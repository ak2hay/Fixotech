import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Req, Res } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import { verifyCaptcha } from "./captcha";
import { CrmService } from "./crm";
import { recordDownload, streamBundle, streamFile } from "./documents";
import { env } from "./env";
import { Public, clientIp, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { AuditService, NotifyService, NumberService, StorageService, assertStorageKey } from "./services";
import { CAD_CATEGORIES } from "./uploads";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

type CategoryRow = { id: string; name: string; slug: string; parentId: string | null; imageKey: string | null; description: string | null; sortOrder: number };
export type CategoryNode = CategoryRow & { productCount: number; children: CategoryNode[] };

export const productCardSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  heroImageKey: true,
  imageKeys: true,
  finish: true,
  segments: true,
  category: { select: { name: true, slug: true } },
  _count: { select: { variants: { where: { active: true } } } },
} as const;

export function productCard(p: { _count?: { variants: number }; imageKeys: string[] } & Record<string, unknown>) {
  const { _count, imageKeys, ...rest } = p;
  return { ...rest, imageKeys: imageKeys.slice(0, 2), variantCount: _count?.variants ?? 0 };
}

const PUBLIC_DOC = { deletedAt: null, audiences: { has: "PUBLIC" }, versions: { some: { status: "APPROVED" } } };

/** Website pages and the Vercel ISR fetcher read these often; the budget is per client IP. */
export const PUBLIC_READ = { default: { limit: 1200, ttl: 60_000 } };

/** How long a visitor who left their details can download CAD/BIM files without asking again. */
const CAD_ACCESS_DAYS = 30;
/** A returning visitor (same email) within this window is logged on the existing lead instead of a new one. */
const CAD_LEAD_WINDOW_DAYS = 30;

const cadAccessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().max(30).optional(),
  productSlug: z.string().regex(/^[a-z0-9-]{1,120}$/).optional(),
  captchaToken: z.string().max(4000).optional(),
  website: z.string().max(200).optional(),
});

type CadAccess = { purpose: "cad_access"; leadId: string };

@Throttle(PUBLIC_READ)
@Controller("public")
export class SiteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
    private readonly numbers: NumberService,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
  ) {}

  /** Lead capture in front of CAD/BIM downloads: returns an access token the website keeps for later downloads. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  @Post("cad-access")
  async cadAccess(@Body() body: unknown, @Req() req: Request) {
    const input = parseBody(cadAccessSchema, body);
    if (input.website) return { token: null };
    await verifyCaptcha(input.captchaToken, clientIp(req));
    const product = input.productSlug ? await this.prisma.product.findFirst({ where: { slug: input.productSlug, published: true }, select: { name: true } }) : null;
    const note = `Requested CAD/BIM files${product ? ` for ${product.name}` : ""}`;
    const recent = await this.prisma.lead.findFirst({
      where: { email: { equals: input.email, mode: "insensitive" }, source: "CAD_DOWNLOAD", createdAt: { gte: new Date(Date.now() - CAD_LEAD_WINDOW_DAYS * 86_400_000) } },
      orderBy: { createdAt: "desc" },
    });
    const lead = recent
      ? await this.prisma.leadActivity.create({ data: { leadId: recent.id, type: "CAD_DOWNLOAD", note } }).then(() => recent)
      : await this.prisma.$transaction(async (tx) => {
          const number = await this.numbers.next("LEAD", tx);
          const created = await tx.lead.create({
            data: { number, source: "CAD_DOWNLOAD", status: "NEW", contactName: input.name, companyName: input.company, email: input.email, phone: input.phone, application: product?.name, message: note, activities: { create: { type: "CAD_DOWNLOAD", note } } },
          });
          await this.audit.log({ action: "cad_access", entityType: "lead", entityId: created.id, after: { number }, ip: clientIp(req) }, tx);
          return created;
        });
    if (!recent) {
      await this.crm.onLeadCreated(lead.id, true);
      const sales = await this.notify.usersWithRole("sales_head");
      await this.notify.push(sales.map((user) => user.id), "CAD/BIM download lead", `${input.company} (${input.name}) ${note.toLowerCase()}`, "lead", lead.id);
    }
    const access: CadAccess = { purpose: "cad_access", leadId: lead.id };
    return { token: await this.jwt.signAsync(access, { expiresIn: `${CAD_ACCESS_DAYS}d` }), expiresAt: new Date(Date.now() + CAD_ACCESS_DAYS * 86_400_000) };
  }

  /** Every public file and every product's CAD/BIM models as one zip. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get("products/:slug/files.zip")
  async productBundle(@Param("slug") slug: string, @Query("category") category: string | undefined, @Query("access") access: string | undefined, @Req() req: Request, @Res() res: Response) {
    const product = await this.prisma.product.findFirst({ where: { slug, published: true }, select: { id: true, sku: true, variants: { where: { active: true }, select: { id: true } } } });
    if (!product) throw new NotFoundException("Product not found");
    const categories = category ? category.split(",").map((item) => item.trim().toUpperCase()).filter((item) => /^[A-Z_]{2,40}$/.test(item)) : CAD_CATEGORIES;
    const documents = await this.prisma.document.findMany({
      where: {
        ...PUBLIC_DOC,
        category: { in: categories },
        OR: [{ entityType: "product", entityId: product.id }, { entityType: "variant", entityId: { in: product.variants.map((variant) => variant.id) } }],
      },
      include: { versions: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 } },
      orderBy: { title: "asc" },
    });
    const gated = documents.some((document) => CAD_CATEGORIES.includes(document.category));
    const leadId = gated ? await this.requireCadAccess(access) : null;
    const files = documents.filter((document) => document.versions.length).map((document) => ({ ...document.versions[0], category: document.category }));
    await streamBundle(res, this.storage, files, `${product.sku}-files.zip`);
    for (const file of files) await recordDownload(this.prisma, { documentId: file.documentId, version: file.version, channel: "PUBLIC", leadId, ip: clientIp(req) });
  }

  private async requireCadAccess(access: string | undefined) {
    if (!env.CAD_DOWNLOAD_GATE) return null;
    const claim = access ? await this.jwt.verifyAsync<CadAccess>(access).catch(() => null) : null;
    if (claim?.purpose !== "cad_access" || !claim.leadId) throw new ForbiddenException("Leave your contact details to download CAD and BIM files");
    return claim.leadId;
  }

  @Public()
  @Get("media/*path")
  async media(@Req() req: Request, @Res() res: Response) {
    let rest: string;
    try {
      rest = decodeURIComponent((req.path.split("/public/media/")[1] || "").replace(/\/+$/, ""));
    } catch {
      throw new BadRequestException("Invalid media path");
    }
    if (!rest || rest.includes("\\") || rest.split("/").some((part) => part === ".." || part === "." || !part)) throw new BadRequestException("Invalid media path");
    const ext = rest.split(".").pop()?.toLowerCase() || "";
    if (!MIME[ext] || ext === "pdf") throw new NotFoundException();
    const bytes = await this.storage.get(assertStorageKey(`media/${rest}`));
    res.setHeader("Content-Type", MIME[ext]);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // SVGs are only shipped seed artwork (uploads are raster-only); the sandbox CSP stops script if one is opened directly.
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.send(bytes);
  }

  @Public()
  @Get("documents")
  async documents(@Query("category") category?: string, @Query("q") q?: string, @Query("family") family?: string) {
    const rows = await this.prisma.document.findMany({
      where: {
        ...PUBLIC_DOC,
        category: category ? category.toUpperCase() : { in: ["DATASHEET", "CATALOGUE", "CERTIFICATE", "INSTALLATION_GUIDE", "BROCHURE"] },
        title: q ? { contains: q, mode: "insensitive" } : undefined,
      },
      include: { versions: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1, select: { version: true, fileName: true, sizeBytes: true, createdAt: true } } },
      orderBy: { title: "asc" },
    });
    const productIds = [...new Set(rows.filter((d) => d.entityType === "product" && d.entityId).map((d) => d.entityId as string))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, published: true },
      select: { id: true, name: true, slug: true, family: { select: { name: true, slug: true } }, category: { select: { name: true, slug: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return rows
      .map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        version: d.versions[0]?.version ?? 1,
        fileName: d.versions[0]?.fileName,
        sizeBytes: d.versions[0]?.sizeBytes,
        updatedAt: d.versions[0]?.createdAt ?? d.updatedAt,
        product: d.entityId ? byId.get(d.entityId) || null : null,
      }))
      .filter((d) => !family || d.product?.family?.slug === family);
  }

  @Public()
  @Get("documents/:id/download")
  async download(@Param("id") id: string, @Query("access") access: string | undefined, @Req() req: Request, @Res() res: Response) {
    const document = await this.prisma.document.findFirst({
      where: { id, ...PUBLIC_DOC },
      include: { versions: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 } },
    });
    const version = document?.versions[0];
    if (!document || !version) throw new NotFoundException("Document not available");
    const gated = CAD_CATEGORIES.includes(document.category);
    const leadId = gated ? await this.requireCadAccess(access) : null;
    const inlineSafe = version.mimeType === "application/pdf" || /^image\/(png|jpeg|webp|gif)$/.test(version.mimeType);
    // Gated files must not be served from a shared cache to someone without a token.
    res.setHeader("Cache-Control", gated && env.CAD_DOWNLOAD_GATE ? "private, no-store" : "public, max-age=86400");
    // Browsers refuse to render a sandboxed PDF inline, so PDFs keep the viewer and everything else is sandboxed.
    await streamFile(res, this.storage, version, inlineSafe ? "inline" : "attachment", version.mimeType !== "application/pdf");
    await recordDownload(this.prisma, { documentId: document.id, version: version.version, channel: "PUBLIC", leadId, ip: clientIp(req) });
  }

  @Public()
  @Get("categories")
  async categories() {
    return this.tree();
  }

  @Public()
  @Get("categories/:slug")
  async category(@Param("slug") slug: string) {
    const nodes = await this.tree();
    const flat = flatten(nodes);
    const node = flat.find((c) => c.slug === slug);
    if (!node) return null;
    const ids = flatten([node]).map((c) => c.id);
    const trail: Array<{ name: string; slug: string }> = [];
    let parent = flat.find((c) => c.id === node.parentId);
    while (parent) {
      trail.unshift({ name: parent.name, slug: parent.slug });
      const parentId: string | null = parent.parentId;
      parent = flat.find((c) => c.id === parentId);
    }
    const products = await this.prisma.product.findMany({
      where: { published: true, categoryId: { in: ids } },
      select: productCardSelect,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 500,
    });
    return { category: node, trail, products: products.map(productCard) };
  }

  @Public()
  @Get("news")
  async news(@Query("limit") limit?: string) {
    return this.prisma.post.findMany({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      take: Math.min(Number(limit) || 100, 100),
      select: { slug: true, title: true, excerpt: true, imageKey: true, publishedAt: true },
    });
  }

  @Public()
  @Get("news/:slug")
  async newsItem(@Param("slug") slug: string) {
    const post = await this.prisma.post.findFirst({ where: { slug, published: true } });
    if (!post) return null;
    const more = await this.prisma.post.findMany({
      where: { published: true, slug: { not: slug } },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: { slug: true, title: true, imageKey: true, publishedAt: true },
    });
    return { post, more };
  }

  @Public()
  @Get("services")
  services() {
    return this.prisma.serviceArea.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } });
  }

  // Header/footer data: brand, contact, catalogue, navigation.
  @Public()
  @Get("site")
  async site() {
    const [blocks, categories, segments, sectors, catalogue] = await Promise.all([
      this.prisma.cmsBlock.findMany({ where: { published: true, key: { in: ["brand", "contact", "catalogue"] } } }),
      this.tree(),
      this.prisma.solution.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true, imageKey: true } }),
      this.prisma.industry.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true, group: true, imageKey: true } }),
      this.prisma.document.findFirst({ where: { category: "CATALOGUE", ...PUBLIC_DOC }, select: { id: true, title: true } }),
    ]);
    const block = (key: string) => blocks.find((b) => b.key === key);
    return {
      brand: block("brand")?.data ?? null,
      contact: block("contact")?.data ?? null,
      catalogue,
      categories: categories.map((c) => ({ name: c.name, slug: c.slug, imageKey: c.imageKey, productCount: c.productCount, children: c.children.map((k) => ({ name: k.name, slug: k.slug, productCount: k.productCount })) })),
      segments,
      sectors,
    };
  }

  private async tree(): Promise<CategoryNode[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.productCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true, parentId: true, imageKey: true, description: true, sortOrder: true } }),
      this.prisma.product.groupBy({ by: ["categoryId"], where: { published: true }, _count: { _all: true } }),
    ]);
    const direct = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const build = (parentId: string | null): CategoryNode[] =>
      rows
        .filter((r) => r.parentId === parentId)
        .map((r) => {
          const children = build(r.id);
          const productCount = (direct.get(r.id) || 0) + children.reduce((sum, c) => sum + c.productCount, 0);
          return { ...r, children, productCount };
        })
        .filter((n) => n.productCount > 0);
    return build(null);
  }
}

function flatten(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}
