import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req } from "@nestjs/common";
import {
  bomSchema,
  jobCompleteSchema,
  jobIssueSchema,
  jobPauseSchema,
  machineSchema,
  ncrUpdateSchema,
  num,
  productionOrderSchema,
  qcDecisionSchema,
  transitionAllowed,
  workCenterSchema,
} from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { z } from "zod";
import { closeJobTime, openJobTime } from "./people";
import { AuthUser, RequirePermissions, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { LedgerService } from "./ledger";
import { AuditService, DomainEventService, NumberService, Tx, WorkflowService } from "./services";
import { InventoryService } from "./inventory";

type ReqUser = { user: AuthUser; ip?: string };

const STARTABLE = ["QUEUED", "PAUSED", "ISSUE"];
const ACTIVE_JOB = ["RUNNING", "PAUSED", "ISSUE"];
const jobStartSchema = z.object({ operatorIds: z.array(z.string().max(64)).max(20).optional() });

@Controller()
export class PlantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumberService,
    private readonly workflow: WorkflowService,
    private readonly events: DomainEventService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  private log(req: ReqUser, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, tx?: Tx) {
    return this.audit.log({ actorId: req.user.id, action, entityType, entityId, before, after, ip: req.ip }, tx);
  }

  @Get("bom")
  @RequirePermissions("production.view")
  listBom() {
    return this.prisma.bom.findMany({ where: { active: true }, include: { variant: true, items: { include: { component: true } } }, take: 1000 });
  }

  @Post("bom")
  @RequirePermissions("production.create")
  async createBom(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(bomSchema, body);
    if (input.items.some((item) => item.componentVariantId === input.variantId)) throw new BadRequestException("A BOM cannot contain its own product");
    const ids = [...new Set([input.variantId, ...input.items.map((item) => item.componentVariantId)])];
    const found = await this.prisma.productVariant.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException("One or more variants do not exist");
    const revision = input.revision || "A";
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.bom.findFirst({ where: { variantId: input.variantId, revision }, select: { id: true } });
      if (duplicate) throw new BadRequestException(`Revision ${revision} already exists for this variant`);
      const row = await tx.bom.create({
        data: {
          variantId: input.variantId,
          revision,
          yieldPct: input.yieldPct ?? 100,
          labourMinutes: input.labourMinutes ?? 0,
          machineMinutes: input.machineMinutes ?? 0,
          overheadCost: input.overheadCost ?? 0,
          items: {
            create: input.items.map((item) => ({
              componentVariantId: item.componentVariantId,
              qty: item.qty,
              scrapPct: item.scrapPct ?? 0,
              unit: item.unit || "NOS",
              alternateGroup: item.alternateGroup,
              isAlternate: Boolean(item.isAlternate),
            })),
          },
        },
        include: { items: true },
      });
      await this.log(req, "create", "bom", row.id, undefined, { variantId: row.variantId, revision, lines: row.items.length }, tx);
      return row;
    });
  }

  @Get("work-centers")
  @RequirePermissions("production.view")
  workCenters() {
    return this.prisma.workCenter.findMany({ include: { machines: true, plant: true } });
  }

  @Post("work-centers")
  @RequirePermissions("production.create")
  async createWorkCenter(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(workCenterSchema, body);
    const row = await this.prisma.workCenter.create({ data: { code: input.code, name: input.name, plantId: input.plantId } });
    await this.log(req, "create", "work_center", row.id, undefined, { code: row.code });
    return row;
  }

  @Post("machines")
  @RequirePermissions("production.create")
  async createMachine(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(machineSchema, body);
    const row = await this.prisma.machine.create({ data: { code: input.code, name: input.name, workCenterId: input.workCenterId, capacityPerDay: input.capacityPerDay ?? 8 } });
    await this.log(req, "create", "machine", row.id, undefined, { code: row.code });
    return row;
  }

  @Get("production")
  @RequirePermissions("production.view")
  orders() {
    return this.prisma.productionOrder.findMany({ include: { machine: true, jobCards: true }, orderBy: { createdAt: "desc" }, take: 500 });
  }

  @Get("production/board")
  @RequirePermissions("production.view")
  async board() {
    const machines = await this.prisma.machine.findMany({ include: { workCenter: true }, orderBy: { code: "asc" } });
    const orders = await this.prisma.productionOrder.findMany({
      where: { status: { in: ["PLANNED", "RELEASED", "IN_PROGRESS", "QC"] }, plannedStart: { not: null } },
      include: { machine: true },
      take: 1000,
    });
    return { machines, orders };
  }

  @Post("production")
  @RequirePermissions("production.create")
  async createOrder(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(productionOrderSchema, body);
    if (input.plannedStart && input.plannedEnd && new Date(input.plannedEnd) < new Date(input.plannedStart)) throw new BadRequestException("Planned end is before planned start");
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("PRODUCTION", tx);
      const jobNumber = await this.numbers.next("JOB", tx);
      const order = await tx.productionOrder.create({
        data: {
          number,
          variantId: input.variantId,
          qty: input.qty,
          machineId: input.machineId,
          warehouseId: input.warehouseId,
          salesOrderId: input.salesOrderId,
          plannedStart: input.plannedStart ? new Date(input.plannedStart) : undefined,
          plannedEnd: input.plannedEnd ? new Date(input.plannedEnd) : undefined,
          status: "PLANNED",
          jobCards: { create: { number: jobNumber, machineId: input.machineId, requiredQty: input.qty, status: "QUEUED" } },
        },
        include: { jobCards: true },
      });
      await this.workflow.record("production_order", order.id, null, "PLANNED", req.user.id, undefined, tx);
      await this.log(req, "create", "production_order", order.id, undefined, { number, qty: order.qty }, tx);
      return order;
    });
  }

  @Get("production/jobs")
  @RequirePermissions("production.view")
  jobs() {
    return this.prisma.jobCard.findMany({ include: { productionOrder: true, machine: true }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  @Post("production/jobs/:id/start")
  @RequirePermissions("production.edit")
  async start(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const { operatorIds = [] } = parseBody(jobStartSchema, body ?? {});
    const job = await this.prisma.jobCard.findUnique({ where: { id }, include: { productionOrder: true } });
    if (!job) throw new NotFoundException("Job not found");
    if (!STARTABLE.includes(job.status)) throw new BadRequestException(`A job in ${job.status} cannot be started`);
    const firstStart = job.status === "QUEUED";
    const needs = firstStart ? await this.materialNeeds(job.productionOrder.variantId, num(job.requiredQty)) : [];
    const warehouse = needs.length
      ? await this.prisma.warehouse.findFirst({ where: job.productionOrder.warehouseId ? { id: job.productionOrder.warehouseId } : { active: true }, include: { bins: true } })
      : null;
    const raw = warehouse?.bins.find((bin) => bin.zone === "RAW");
    if (needs.length && (!warehouse || !raw)) throw new BadRequestException("No RAW bin is configured to issue material from");
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.jobCard.updateMany({ where: { id, status: job.status }, data: { status: "RUNNING", startedAt: job.startedAt ?? new Date() } });
      if (!claimed.count) throw new BadRequestException("Job was changed by someone else; reload and try again");
      const missing: Array<{ variantId: string; qty: number; onHand: number }> = [];
      for (const need of needs) {
        const onHand = num((await tx.inventoryBalance.aggregate({ where: { variantId: need.variantId, warehouseId: warehouse!.id, binId: raw!.id }, _sum: { qty: true } }))._sum.qty);
        if (onHand + 0.0001 < need.qty) missing.push({ ...need, onHand });
      }
      if (missing.length) throw new BadRequestException({ message: "Material is short", missing });
      for (const need of needs) {
        await this.inventory.postTransaction({ type: "CONSUMPTION", warehouseId: warehouse!.id, binId: raw!.id, variantId: need.variantId, qty: -need.qty, referenceType: "JOB", referenceId: job.id, actorId: req.user.id, override: false }, tx);
      }
      if (job.productionOrder.status !== "IN_PROGRESS") await tx.productionOrder.update({ where: { id: job.productionOrderId }, data: { status: "IN_PROGRESS" } });
      if (job.machineId) await tx.machine.update({ where: { id: job.machineId }, data: { status: "RUNNING" } });
      const operators = await tx.employee.findMany({ where: { OR: [{ id: { in: operatorIds } }, { userId: req.user.id }], status: { in: ["ACTIVE", "ONBOARDING", "NOTICE"] } }, select: { id: true } });
      await openJobTime(tx, id, operators.map((row) => row.id));
      await this.workflow.record("job_card", id, job.status, "RUNNING", req.user.id, undefined, tx);
      await this.log(req, "start", "job_card", id, { status: job.status }, { status: "RUNNING", consumed: needs.length }, tx);
      return tx.jobCard.findUniqueOrThrow({ where: { id } });
    });
  }

  @Post("production/jobs/:id/pause")
  @RequirePermissions("production.edit")
  async pause(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(jobPauseSchema, body ?? {});
    return this.moveJob(req, id, ["RUNNING"], "PAUSED", { downtimeMinutes: { increment: input.downtimeMinutes || 0 } }, "IDLE");
  }

  @Post("production/jobs/:id/issue")
  @RequirePermissions("production.edit")
  async issue(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(jobIssueSchema, body);
    return this.moveJob(req, id, ["RUNNING", "PAUSED"], "ISSUE", { issueNote: input.note }, "DOWN", input.note);
  }

  @Post("production/jobs/:id/complete")
  @RequirePermissions("production.edit")
  async complete(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(jobCompleteSchema, body);
    const job = await this.prisma.jobCard.findUnique({ where: { id }, include: { productionOrder: true } });
    if (!job) throw new NotFoundException("Job not found");
    if (!ACTIVE_JOB.includes(job.status)) throw new BadRequestException(`A job in ${job.status} cannot be completed`);
    if (input.completedQty > num(job.requiredQty) * 1.1) throw new BadRequestException("Completed quantity exceeds the required quantity by more than 10%");
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.jobCard.updateMany({ where: { id, status: job.status }, data: { status: "COMPLETED", completedQty: input.completedQty, completedAt: new Date() } });
      if (!claimed.count) throw new BadRequestException("Job was changed by someone else; reload and try again");
      await closeJobTime(tx, id);
      await tx.productionOrder.update({ where: { id: job.productionOrderId }, data: { status: "QC", completedQty: input.completedQty } });
      if (job.machineId) await tx.machine.update({ where: { id: job.machineId }, data: { status: "IDLE" } });
      const number = await this.numbers.next("QC", tx);
      await tx.qualityInspection.create({
        data: {
          number,
          stage: "FINAL",
          variantId: job.productionOrder.variantId,
          productionOrderId: job.productionOrderId,
          parameters: ["Dimensions", "Thickness", "Load", "Coating", "Visual"].map((name) => ({ name, result: "" })),
        },
      });
      await this.workflow.record("job_card", id, job.status, "COMPLETED", req.user.id, undefined, tx);
      await this.log(req, "complete", "job_card", id, { status: job.status }, { status: "COMPLETED", completedQty: input.completedQty }, tx);
      return tx.jobCard.findUniqueOrThrow({ where: { id } });
    });
  }

  @Post("mrp/run")
  @RequirePermissions("production.create")
  async mrp(@Req() req: ReqUser) {
    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('fixotec:mrp')) AS locked`;
        if (!lock?.locked) throw new ConflictException("An MRP run is already in progress");
        const demand = await tx.$queryRaw<Array<{ variantId: string; open: unknown; description: string; supplyMode: string; safetyStock: unknown }>>`
          SELECT i."variantId", SUM(GREATEST(0, i."qty" - i."fulfilledQty")) AS open, MIN(i."description") AS description, p."supplyMode", v."safetyStock"
          FROM "SalesOrderItem" i
          JOIN "SalesOrder" o ON o."id" = i."salesOrderId"
          JOIN "ProductVariant" v ON v."id" = i."variantId"
          JOIN "Product" p ON p."id" = v."productId"
          WHERE o."status" IN ('CONFIRMED','BACKORDERED','PARTIAL') AND i."variantId" IS NOT NULL
          GROUP BY i."variantId", p."supplyMode", v."safetyStock"`;
        const ids = demand.map((row) => row.variantId);
        if (!ids.length) return { proposals: [] };
        const [stock, po, production, requisitions] = await Promise.all([
          tx.inventoryBalance.groupBy({ by: ["variantId"], where: { variantId: { in: ids } }, _sum: { qty: true } }),
          tx.purchaseOrderItem.groupBy({ by: ["variantId"], where: { variantId: { in: ids }, purchaseOrder: { status: { in: ["APPROVED", "PARTIAL", "SUBMITTED"] } } }, _sum: { qty: true, receivedQty: true } }),
          tx.productionOrder.groupBy({ by: ["variantId"], where: { variantId: { in: ids }, status: { in: ["PLANNED", "RELEASED", "IN_PROGRESS"] } }, _sum: { qty: true } }),
          tx.purchaseRequisitionItem.groupBy({ by: ["variantId"], where: { variantId: { in: ids }, requisition: { status: { in: ["SUBMITTED", "APPROVED"] } } }, _sum: { qty: true } }),
        ]);
        const sumOf = <T extends { variantId: string | null }>(rows: T[], pick: (row: T) => unknown) => new Map(rows.map((row) => [row.variantId, num(pick(row))]));
        const onHand = sumOf(stock, (row) => row._sum.qty);
        const onOrder = new Map(po.map((row) => [row.variantId, num(row._sum.qty) - num(row._sum.receivedQty)]));
        const inProduction = sumOf(production, (row) => row._sum.qty);
        const requested = sumOf(requisitions, (row) => row._sum.qty);
        const created: Array<{ type: string; id: string; variantId: string; qty: number }> = [];
        for (const row of demand) {
          const variantId = row.variantId;
          const net = num(row.open) - (onHand.get(variantId) || 0) - (onOrder.get(variantId) || 0) - (inProduction.get(variantId) || 0) - (requested.get(variantId) || 0) + num(row.safetyStock);
          if (net <= 0) continue;
          if (row.supplyMode === "MAKE") {
            const number = await this.numbers.next("PRODUCTION", tx);
            const jobNumber = await this.numbers.next("JOB", tx);
            const order = await tx.productionOrder.create({ data: { number, variantId, qty: net, status: "PLANNED", jobCards: { create: { number: jobNumber, requiredQty: net, status: "QUEUED" } } } });
            created.push({ type: "PRODUCTION", id: order.id, variantId, qty: net });
          } else {
            const number = await this.numbers.next("PURCHASE_REQUISITION", tx);
            const requisition = await tx.purchaseRequisition.create({
              data: { number, status: "SUBMITTED", requesterId: req.user.id, sourceType: "MRP", notes: "MRP net requirement", items: { create: [{ variantId, description: row.description, qty: net }] } },
            });
            created.push({ type: "PURCHASE_REQUISITION", id: requisition.id, variantId, qty: net });
          }
        }
        await this.events.record("MrpRun", { proposals: created.length }, tx);
        await this.log(req, "run", "mrp", "mrp", undefined, { proposals: created.length }, tx);
        return { proposals: created };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  @Get("quality")
  @RequirePermissions("quality.view")
  inspections() {
    return this.prisma.qualityInspection.findMany({ orderBy: { createdAt: "desc" }, include: { goodsReceipt: true, productionOrder: true, batch: true }, take: 500 });
  }

  @Post("quality/:id/decide")
  @RequirePermissions("quality.approve")
  async decide(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(qcDecisionSchema, body);
    const inspection = await this.prisma.qualityInspection.findUnique({ where: { id }, include: { goodsReceipt: { include: { items: true, purchaseOrder: true } }, productionOrder: true, batch: true } });
    if (!inspection) throw new NotFoundException("Inspection not found");
    if (inspection.status !== "PENDING") throw new BadRequestException("Inspection is already decided");
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.qualityInspection.updateMany({
        where: { id, status: "PENDING" },
        data: { status: input.decision, parameters: (input.parameters as Prisma.InputJsonValue | undefined) ?? (inspection.parameters as Prisma.InputJsonValue), notes: input.notes, inspectedById: req.user.id, decidedAt: new Date() },
      });
      if (!claimed.count) throw new BadRequestException("Inspection is already decided");
      if (input.decision === "ACCEPTED") {
        await this.releaseStock(tx, inspection, req.user.id);
        await this.events.record("QCApproved", { inspectionId: id }, tx);
      }
      if (input.decision === "REJECTED") {
        const number = await this.numbers.next("NCR", tx);
        await tx.ncr.create({
          data: {
            number,
            inspectionId: id,
            variantId: inspection.variantId,
            batchId: inspection.batchId,
            vendorId: inspection.goodsReceipt?.purchaseOrder.vendorId,
            issue: input.notes || "Rejected at inspection",
            ownerId: req.user.id,
            deadline: new Date(Date.now() + 7 * 86_400_000),
          },
        });
        if (inspection.goodsReceiptId) await tx.goodsReceipt.update({ where: { id: inspection.goodsReceiptId }, data: { status: "REJECTED" } });
      }
      await this.workflow.record("quality_inspection", id, "PENDING", input.decision, req.user.id, input.notes, tx);
      await this.log(req, "decide", "quality_inspection", id, { status: "PENDING" }, { status: input.decision }, tx);
      return tx.qualityInspection.findUniqueOrThrow({ where: { id } });
    }, { timeout: 30_000 });
  }

  @Get("ncr")
  @RequirePermissions("ncr.view")
  ncrs() {
    return this.prisma.ncr.findMany({ include: { vendor: true, inspection: true }, orderBy: { createdAt: "desc" }, take: 500 });
  }

  @Patch("ncr/:id")
  @RequirePermissions("ncr.edit")
  async updateNcr(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(ncrUpdateSchema, body);
    const before = await this.prisma.ncr.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("NCR not found");
    if (input.status && !transitionAllowed("ncr", before.status, input.status)) throw new BadRequestException(`An NCR cannot move from ${before.status} to ${input.status}`);
    if (input.status === "CLOSED" && !(input.correctiveAction ?? before.correctiveAction)) throw new BadRequestException("Record the corrective action before closing the NCR");
    const row = await this.prisma.ncr.update({
      where: { id },
      data: {
        status: input.status,
        rootCause: input.rootCause,
        correctiveAction: input.correctiveAction,
        preventiveAction: input.preventiveAction,
        ownerId: input.ownerId,
        deadline: input.deadline === undefined ? undefined : input.deadline ? new Date(input.deadline) : null,
        closedAt: input.status === "CLOSED" ? new Date() : undefined,
      },
    });
    if (input.status && input.status !== before.status) await this.workflow.record("ncr", id, before.status, input.status, req.user.id);
    await this.log(req, "update", "ncr", id, { status: before.status }, { status: row.status });
    return row;
  }

  private async moveJob(req: ReqUser, id: string, from: string[], to: string, data: Prisma.JobCardUpdateManyMutationInput, machineStatus: string, comment?: string) {
    const job = await this.prisma.jobCard.findUnique({ where: { id } });
    if (!job) throw new NotFoundException("Job not found");
    if (!from.includes(job.status)) throw new BadRequestException(`A job in ${job.status} cannot move to ${to}`);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.jobCard.updateMany({ where: { id, status: job.status }, data: { ...data, status: to } });
      if (!claimed.count) throw new BadRequestException("Job was changed by someone else; reload and try again");
      await closeJobTime(tx, id);
      if (job.machineId) await tx.machine.update({ where: { id: job.machineId }, data: { status: machineStatus } });
      await this.workflow.record("job_card", id, job.status, to, req.user.id, comment, tx);
      await this.log(req, to.toLowerCase(), "job_card", id, { status: job.status }, { status: to }, tx);
      return tx.jobCard.findUniqueOrThrow({ where: { id } });
    });
  }

  private async releaseStock(
    tx: Tx,
    inspection: {
      variantId: string | null;
      goodsReceiptId: string | null;
      productionOrderId: string | null;
      batchId: string | null;
      goodsReceipt: { warehouseId: string; items: Array<{ variantId: string | null; qty: unknown; purchaseOrderItemId: string | null }> } | null;
      productionOrder: { qty: unknown; completedQty: unknown; warehouseId: string | null } | null;
    },
    actorId: string,
  ) {
    const warehouseId = inspection.goodsReceipt?.warehouseId || inspection.productionOrder?.warehouseId || (await tx.warehouse.findFirst({ where: { active: true } }))?.id;
    if (!warehouseId || !inspection.variantId) return;
    const bins = await tx.warehouseBin.findMany({ where: { warehouseId } });
    const fg = bins.find((bin) => bin.zone === "FG") || bins[0];
    const raw = bins.find((bin) => bin.zone === "RAW") || fg;
    if (!fg) throw new BadRequestException("The receiving warehouse has no bins");
    if (inspection.goodsReceipt) {
      for (const item of inspection.goodsReceipt.items) {
        if (!item.variantId || item.variantId !== inspection.variantId) continue;
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId }, include: { product: true } });
        const bin = variant?.product.productType === "RAW" ? raw : fg;
        await this.inventory.postTransaction({ type: "PURCHASE", warehouseId, binId: bin.id, variantId: item.variantId, batchId: inspection.batchId || undefined, qty: num(item.qty), unitCost: num(variant?.purchaseCost), referenceType: "GRN", referenceId: inspection.goodsReceiptId || undefined, actorId, override: false }, tx);
        if (item.purchaseOrderItemId) await tx.purchaseOrderItem.update({ where: { id: item.purchaseOrderItemId }, data: { receivedQty: { increment: num(item.qty) } } });
      }
      await tx.goodsReceipt.update({ where: { id: inspection.goodsReceiptId! }, data: { status: "POSTED" } });
      await this.ledger.tryPost("GRN " + inspection.goodsReceiptId, () => this.ledger.postStock(tx, "GRN", inspection.goodsReceiptId!));
      await this.events.record("InventoryUpdated", { goodsReceiptId: inspection.goodsReceiptId }, tx);
    }
    if (inspection.productionOrder) {
      const variant = await tx.productVariant.findUnique({ where: { id: inspection.variantId } });
      await this.inventory.postTransaction(
        {
          type: "PRODUCTION_RECEIPT",
          warehouseId,
          binId: fg.id,
          variantId: inspection.variantId,
          qty: num(inspection.productionOrder.completedQty) || num(inspection.productionOrder.qty),
          unitCost: num(variant?.manufacturingCost),
          referenceType: "PRODUCTION",
          referenceId: inspection.productionOrderId || undefined,
          actorId,
          override: false,
        },
        tx,
      );
      if (inspection.productionOrderId) await tx.productionOrder.update({ where: { id: inspection.productionOrderId }, data: { status: "COMPLETED" } });
    }
  }

  private async materialNeeds(variantId: string, qty: number) {
    const bom = await this.prisma.bom.findFirst({ where: { variantId, active: true }, include: { items: true }, orderBy: { createdAt: "desc" } });
    if (!bom) return [];
    const yieldPct = num(bom.yieldPct) || 100;
    return bom.items
      .filter((item) => !item.isAlternate)
      .map((item) => ({ variantId: item.componentVariantId, qty: (qty * num(item.qty) * (1 + num(item.scrapPct) / 100)) / (yieldPct / 100) }));
  }
}
