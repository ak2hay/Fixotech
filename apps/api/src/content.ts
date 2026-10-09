import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthUser, RequirePermissions } from "./http";
import { PrismaService } from "./prisma.service";
import { sanitizeRichText } from "./sanitize";
import { AuditService, StorageService } from "./services";
import { IMAGE_KINDS, MB, Upload, inspectUpload, uploadLimits } from "./uploads";

type ReqUser = { user: AuthUser; ip?: string };
// SVG is excluded on purpose: media is served inline from the API origin and SVG can carry script.
const MEDIA_MAX_BYTES = 8 * MB;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA_KEY = /^media\/[\w./-]+$/;

const str = (value: unknown) => (typeof value === "string" ? value.trim() : undefined);
const optStr = (value: unknown) => (value === null ? null : typeof value === "string" ? value.trim() || null : undefined);
const strList = (value: unknown, max = 50, each = 300) => {
  if (!Array.isArray(value)) return undefined;
  if (value.length > max) throw new BadRequestException(`At most ${max} items are allowed`);
  return value.map((v) => String(v).trim().slice(0, each)).filter(Boolean);
};
const bool = (value: unknown) => (typeof value === "boolean" ? value : undefined);
const int = (value: unknown) => (value === undefined || value === "" ? undefined : Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : undefined);

function mediaKey(value: unknown) {
  const key = optStr(value);
  if (key && (!MEDIA_KEY.test(key) || key.includes(".."))) throw new BadRequestException("Image must be an uploaded media key");
  return key;
}

function slugOf(value: unknown) {
  const slug = str(value);
  if (!slug || !SLUG.test(slug)) throw new BadRequestException("Slug must be lowercase words separated by hyphens");
  return slug;
}

const MAX_BODY = 200_000;

function safeHtml(html: string | undefined) {
  if (html === undefined) return undefined;
  if (html.length > MAX_BODY) throw new BadRequestException("Body is too long");
  return sanitizeRichText(html);
}

function limited<T extends string | null | undefined>(value: T, max: number, label: string): T {
  if (value && value.length > max) throw new BadRequestException(`${label} must be at most ${max} characters`);
  return value;
}

function clean<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<T>;
}

@Controller("cms")
export class ContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private log(req: ReqUser, action: string, entityType: string, entityId: string, after: unknown) {
    return this.audit.log({ actorId: req.user.id, action, entityType, entityId, after, ip: String(req.ip || "") });
  }

  @Post("media")
  @RequirePermissions("content.edit")
  @UseInterceptors(FileInterceptor("file", uploadLimits(MEDIA_MAX_BYTES)))
  async uploadMedia(@UploadedFile() file: Upload, @Req() req: ReqUser) {
    const checked = await inspectUpload(file, IMAGE_KINDS, MEDIA_MAX_BYTES);
    const now = new Date();
    const base = checked.fileName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "image";
    const ext = checked.ext === "jpeg" ? "jpg" : checked.ext;
    const key = `media/uploads/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}-${base}.${ext}`;
    await this.storage.put(key, file.buffer, checked.mimeType);
    await this.log(req, "upload", "media", key, { bytes: file.size, mime: checked.mimeType });
    return { key };
  }

  // ---------- categories ----------
  @Get("categories")
  @RequirePermissions("content.view")
  categories() {
    return this.prisma.productCategory.findMany({ orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }], include: { parent: { select: { id: true, name: true } }, _count: { select: { products: true } } } });
  }

  private categoryData(body: Record<string, unknown>) {
    return clean({ name: limited(str(body.name), 120, "Name"), description: limited(optStr(body.description), 5000, "Description"), imageKey: mediaKey(body.imageKey), sortOrder: int(body.sortOrder), parentId: optStr(body.parentId) });
  }

  /** Walks up from the proposed parent; if it reaches `id` the move would create a loop. */
  private async assertNoCycle(id: string, parentId: string | null | undefined) {
    let current = parentId;
    for (let depth = 0; current && depth < 50; depth += 1) {
      if (current === id) throw new BadRequestException("A category cannot be moved under itself or one of its children");
      const parent = await this.prisma.productCategory.findUnique({ where: { id: current }, select: { parentId: true } });
      current = parent?.parentId;
    }
  }

  @Post("categories")
  @RequirePermissions("content.edit")
  async createCategory(@Body() body: Record<string, unknown>, @Req() req: ReqUser) {
    const data = this.categoryData(body);
    if (!data.name) throw new BadRequestException("Name is required");
    const row = await this.prisma.productCategory.create({ data: { ...data, name: data.name, slug: slugOf(body.slug) } });
    await this.log(req, "create", "product_category", row.id, data);
    return row;
  }

  @Patch("categories/:id")
  @RequirePermissions("content.edit")
  async updateCategory(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqUser) {
    const data = this.categoryData(body);
    await this.assertNoCycle(id, data.parentId);
    const row = await this.prisma.productCategory.update({ where: { id }, data });
    await this.log(req, "update", "product_category", id, data);
    return row;
  }

  // ---------- products (website content only; commercial fields stay in the product master) ----------
  @Get("products")
  @RequirePermissions("content.view")
  products(@Query("q") q?: string) {
    return this.prisma.product.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : undefined,
      select: { id: true, sku: true, name: true, slug: true, published: true, heroImageKey: true, imageKeys: true, category: { select: { id: true, name: true } }, _count: { select: { variants: true } } },
      orderBy: [{ published: "desc" }, { name: "asc" }],
      take: 300,
    });
  }

  @Get("products/:id")
  @RequirePermissions("content.view")
  async product(@Param("id") id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: { category: { select: { id: true, name: true } } } });
    if (!product) throw new NotFoundException();
    const documents = await this.prisma.document.findMany({ where: { entityType: "product", entityId: id, deletedAt: null }, include: { versions: { orderBy: { version: "desc" }, select: { id: true, version: true, status: true, fileName: true, sizeBytes: true, createdAt: true } } }, orderBy: { title: "asc" } });
    return { ...product, documents };
  }

  @Patch("products/:id")
  @RequirePermissions("content.edit")
  async updateProduct(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqUser) {
    const imageKeys = strList(body.imageKeys);
    imageKeys?.forEach(mediaKey);
    const data = clean({
      name: limited(str(body.name), 200, "Name"),
      description: limited(optStr(body.description), 10_000, "Description"),
      technicalDescription: limited(optStr(body.technicalDescription), 20_000, "Technical description"),
      finish: limited(optStr(body.finish), 200, "Finish"),
      categoryId: optStr(body.categoryId),
      heroImageKey: mediaKey(body.heroImageKey),
      imageKeys,
      features: strList(body.features),
      applications: strList(body.applications),
      segments: strList(body.segments),
      sectors: strList(body.sectors),
      metaTitle: limited(optStr(body.metaTitle), 200, "Meta title"),
      metaDescription: limited(optStr(body.metaDescription), 500, "Meta description"),
      sortOrder: int(body.sortOrder),
      published: bool(body.published),
    });
    const row = await this.prisma.product.update({ where: { id }, data });
    await this.log(req, "update", "product_content", id, data);
    return row;
  }

  // ---------- news ----------
  @Get("posts")
  @RequirePermissions("content.view")
  posts() {
    return this.prisma.post.findMany({ orderBy: { publishedAt: "desc" }, select: { id: true, slug: true, title: true, excerpt: true, imageKey: true, publishedAt: true, published: true }, take: 1000 });
  }

  @Get("posts/:id")
  @RequirePermissions("content.view")
  async post(@Param("id") id: string) {
    const row = await this.prisma.post.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  private postData(body: Record<string, unknown>) {
    const publishedAt = str(body.publishedAt);
    if (publishedAt && Number.isNaN(Date.parse(publishedAt))) throw new BadRequestException("Invalid publish date");
    return clean({ title: limited(str(body.title), 200, "Title"), excerpt: limited(optStr(body.excerpt), 1000, "Excerpt"), body: safeHtml(str(body.body)), imageKey: mediaKey(body.imageKey), publishedAt: publishedAt ? new Date(publishedAt) : undefined, published: bool(body.published) });
  }

  @Post("posts")
  @RequirePermissions("content.edit")
  async createPost(@Body() body: Record<string, unknown>, @Req() req: ReqUser) {
    const data = this.postData(body);
    if (!data.title) throw new BadRequestException("Title is required");
    const row = await this.prisma.post.create({ data: { ...data, title: data.title, body: data.body || "", slug: slugOf(body.slug), publishedAt: data.publishedAt || new Date(), published: data.published ?? false } });
    await this.log(req, "create", "post", row.id, { title: row.title });
    return row;
  }

  @Patch("posts/:id")
  @RequirePermissions("content.edit")
  async updatePost(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqUser) {
    const data = this.postData(body);
    const row = await this.prisma.post.update({ where: { id }, data });
    await this.log(req, "update", "post", id, { ...data, body: data.body ? `${data.body.length} chars` : undefined });
    return row;
  }

  // ---------- service areas ----------
  @Get("services")
  @RequirePermissions("content.view")
  services() {
    return this.prisma.serviceArea.findMany({ orderBy: { sortOrder: "asc" } });
  }

  private serviceData(body: Record<string, unknown>) {
    return clean({ title: limited(str(body.title), 200, "Title"), summary: limited(str(body.summary), 2000, "Summary"), iconKey: mediaKey(body.iconKey), sortOrder: int(body.sortOrder), published: bool(body.published) });
  }

  @Post("services")
  @RequirePermissions("content.edit")
  async createService(@Body() body: Record<string, unknown>, @Req() req: ReqUser) {
    const data = this.serviceData(body);
    if (!data.title) throw new BadRequestException("Title is required");
    const row = await this.prisma.serviceArea.create({ data: { ...data, title: data.title, summary: data.summary || "", slug: slugOf(body.slug) } });
    await this.log(req, "create", "service_area", row.id, data);
    return row;
  }

  @Patch("services/:id")
  @RequirePermissions("content.edit")
  async updateService(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: ReqUser) {
    const data = this.serviceData(body);
    const row = await this.prisma.serviceArea.update({ where: { id }, data });
    await this.log(req, "update", "service_area", id, data);
    return row;
  }
}
