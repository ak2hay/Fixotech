import { NotFoundException } from "@nestjs/common";
import { PROJECT_MILESTONES, STAGE_MILESTONES_DONE, projectHealth } from "@fixotec/shared";
import type { Prisma } from "@fixotec/db";
import type { PrismaService } from "./prisma.service";
import { AuthUser, isExternal } from "./http";

type FindFirstDelegate<Row> = { findFirst(args: { where: object }): Promise<Row | null> };

/**
 * The one way to load a record by id for a request: the id and the caller's tenant scope are combined in
 * one query, so an out-of-scope id is indistinguishable from a missing one (404, never 403).
 */
export async function scopedFindOrThrow<Row>(delegate: FindFirstDelegate<Row>, id: string, scope: object, label = "Record"): Promise<Row> {
  const row = await delegate.findFirst({ where: { AND: [{ id }, scope] } });
  if (!row) throw new NotFoundException(`${label} not found`);
  return row;
}

/** Throws 404 unless the project exists and, for portal users, belongs to their account. */
export async function assertProjectInScope(prisma: PrismaService, user: AuthUser, projectId: string | null | undefined) {
  if (!projectId) return;
  const project = await prisma.project.findFirst({ where: { AND: [{ id: projectId }, projectScope(user)] }, select: { id: true } });
  if (!project) throw new NotFoundException("Project not found");
}

/** Prisma `where` fragment for records that hang off a project (site visits, issues, reports). */
export function viaProject(user: AuthUser) {
  return isExternal(user) ? { project: projectScope(user) } : {};
}

export function projectScope(user: AuthUser) {
  if (!isExternal(user)) return {};
  if (!user.customerId) return { id: "__none__" };
  if (user.roleKeys.includes("consultant")) {
    return { OR: [{ consultantId: user.customerId }, { customerId: user.customerId }, { members: { some: { userId: user.id } } }] };
  }
  return { OR: [{ customerId: user.customerId }, { contractorId: user.customerId }, { mepContractorId: user.customerId }] };
}

export function customerScope(user: AuthUser) {
  return isExternal(user) ? user.customerId || "__none__" : undefined;
}

/** Drafts, internal reviews and rejected versions stay internal; the customer sees a quotation once it is sent. */
export const CUSTOMER_QUOTE_STATUSES = ["SENT", "NEGOTIATION", "ACCEPTED", "COMPLETED"];

export function quoteScope(user: AuthUser) {
  if (!isExternal(user)) return {};
  return { customerId: user.customerId || "__none__", status: { in: CUSTOMER_QUOTE_STATUSES } };
}

/** Archived (soft-deleted) documents are excluded from every read path. */
export const LIVE_DOCUMENT = { deletedAt: null } as const;

export function documentAudience(user: AuthUser) {
  return isExternal(user) ? user.roleKeys.map((role) => role.toUpperCase()) : [];
}

/**
 * Portal users may open library files (no entity, or a product) and files attached to records
 * in their own scope. Audience tags alone are not enough: they say who a file is for, not whose it is.
 */
export async function documentScope(prisma: PrismaService, user: AuthUser): Promise<Prisma.DocumentWhereInput> {
  if (!isExternal(user)) return LIVE_DOCUMENT;
  const customerId = user.customerId || "__none__";
  const projects = (await prisma.project.findMany({ where: projectScope(user), select: { id: true } })).map((row) => row.id);
  const [rfqs, quotes, orders, engineering] = await Promise.all([
    prisma.rfq.findMany({ where: { customerId }, select: { id: true } }),
    prisma.quotation.findMany({ where: quoteScope(user), select: { id: true } }),
    prisma.salesOrder.findMany({ where: { customerId }, select: { id: true } }),
    prisma.engineeringRequest.findMany({ where: { OR: [{ customerId }, { projectId: { in: projects } }] }, select: { id: true } }),
  ]);
  const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);
  return {
    ...LIVE_DOCUMENT,
    OR: [
      { entityType: null },
      { entityType: "product" },
      { entityType: "variant" },
      { entityType: "project", entityId: { in: projects } },
      { entityType: "rfq", entityId: { in: ids(rfqs) } },
      { entityType: "quotation", entityId: { in: ids(quotes) } },
      { entityType: "sales_order", entityId: { in: ids(orders) } },
      { entityType: "engineering", entityId: { in: ids(engineering) } },
    ],
  };
}

export function mediaPath(key?: string | null) {
  if (!key) return null;
  return `/public/media/${key.replace(/^media\//, "")}`;
}

const OPEN_ISSUE = { notIn: ["RESOLVED", "VERIFIED", "CLOSED"] };
export const openIssueWhere = { status: OPEN_ISSUE };

type MilestoneRow = { key: string; label: string; sortOrder: number; status: string; plannedDate: Date | null; actualDate: Date | null };

export function progressOf(stage: string, milestones: MilestoneRow[]) {
  if (milestones.length) {
    const done = milestones.filter((item) => item.status === "DONE").length;
    return Math.round((done / milestones.length) * 100);
  }
  return Math.round(((STAGE_MILESTONES_DONE[stage] ?? 0) / PROJECT_MILESTONES.length) * 100);
}

export function healthOf(project: { health?: string | null; stage: string; startDate?: Date | null; expectedCompletion?: Date | null }, progress: number, openIssues: number) {
  return projectHealth({ override: project.health, stage: project.stage, startDate: project.startDate, expectedCompletion: project.expectedCompletion, progress, openIssues });
}

function plannedFor(start: Date | null, end: Date | null, at: number) {
  if (!start || !end || end <= start) return null;
  return new Date(start.getTime() + (end.getTime() - start.getTime()) * at);
}

/** Creates the default milestone rows when missing and marks them done according to the project stage. */
export async function syncMilestones(prisma: PrismaService | Prisma.TransactionClient, project: { id: string; stage: string; startDate: Date | null; expectedCompletion: Date | null }) {
  const existing = await prisma.projectMilestone.findMany({ where: { projectId: project.id } });
  const done = STAGE_MILESTONES_DONE[project.stage] ?? 0;
  const now = new Date();
  for (const [index, template] of PROJECT_MILESTONES.entries()) {
    const row = existing.find((item) => item.key === template.key);
    const shouldBeDone = index < done;
    const current = index === done && project.stage !== "LOST";
    const status = shouldBeDone ? "DONE" : current ? "IN_PROGRESS" : "PENDING";
    if (!row) {
      await prisma.projectMilestone.create({
        data: {
          projectId: project.id,
          key: template.key,
          label: template.label,
          sortOrder: index,
          plannedDate: plannedFor(project.startDate, project.expectedCompletion, template.at),
          actualDate: shouldBeDone ? plannedFor(project.startDate, project.expectedCompletion, template.at) || now : null,
          status,
        },
      });
      continue;
    }
    if (row.status !== status && !(row.status === "DONE" && shouldBeDone)) {
      await prisma.projectMilestone.update({ where: { id: row.id }, data: { status, actualDate: shouldBeDone ? row.actualDate || now : null } });
    }
  }
}
