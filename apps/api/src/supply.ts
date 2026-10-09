import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  availabilityBand,
  binSchema,
  deliverSchema,
  dispatchSchema,
  goodsReceiptSchema,
  inventoryPostSchema,
  num,
  pickSchema,
  purchaseOrderSchema,
  requisitionSchema,
  shipSchema,
  transferSchema,
  vendorQuoteSchema,
  vendorSchema,
  vendorTaxSchema,
  warehouseSchema,
} from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { randomUUID } from "crypto";
import { AuthUser, RequirePermissions, isExternal, pageOf, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { ApprovalService } from "./platform";
import { present } from "./commercial";
import { InventoryService, StockPosting } from "./inventory";
import { LedgerService } from "./ledger";
import { AuditService, DomainEventService, NotifyService, NumberService, Tx, WorkflowService } from "./services";

type ReqUser = { user: AuthUser; ip?: string };

/** Fallback when BusinessSetting "procurement" has no buyerAuthority. */
const DEFAULT_BUYER_AUTHORITY = 500_000;
const OVER_RECEIPT_TOLERANCE = 1.05;

@Controller()
export class SupplyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumberService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly events: DomainEventService,
    private readonly notify: NotifyService,
    private readonly approvals: ApprovalService,
    private readonly inventory: InventoryService,
    private readonly ledger: LedgerService,
  ) {}

  private log(req: ReqUser, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, tx?: Tx) {
    return this.audit.log({ actorId: req.user.id, action, entityType, entityId, before, after, ip: req.ip }, tx);
  }

  @Get("vendors")
  @RequirePermissions("vendors.view")
  async vendors(@Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    const where = { active: true, name: page.q ? { contains: page.q, mode: "insensitive" as const } : undefined };
    const [items, total] = await Promise.all([
      this.prisma.vendor.findMany({ where, skip: page.skip, take: page.pageSize, orderBy: { name: "asc" }, include: { contacts: true } }),
      this.prisma.vendor.count({ where }),
    ]);
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  @Post("vendors")
  @RequirePermissions("vendors.create")
  async createVendor(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(vendorSchema, body);
    return this.prisma.$transaction(async (tx) => {
      const code = await this.numbers.next("VENDOR", tx);
      const row = await tx.vendor.create({
        data: {
          code,
          name: input.name,
          gstin: input.gstin,
          email: input.email || undefined,
          phone: input.phone,
          paymentTerms: input.paymentTerms,
          leadTimeDays: input.leadTimeDays,
          qualityRating: input.qualityRating,
          deliveryScore: input.deliveryScore,
          bankName: input.bankName,
          bankAccount: input.bankAccount,
          ifsc: input.ifsc,
          categories: input.categories,
          pan: input.pan || null,
          tdsSection: input.tdsSection || null,
        },
      });
      await this.log(req, "create", "vendor", row.id, undefined, { code, name: row.name }, tx);
      return row;
    });
  }

  @Patch("vendors/:id/tax")
  @RequirePermissions("vendors.edit")
  async vendorTax(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(vendorTaxSchema, body);
    const before = await this.prisma.vendor.findUnique({ where: { id }, select: { pan: true, tdsSection: true, lowerDeductionRate: true } });
    if (!before) throw new NotFoundException("Vendor not found");
    const row = await this.prisma.vendor.update({ where: { id }, data: { pan: input.pan || null, tdsSection: input.tdsSection || null, lowerDeductionRate: input.lowerDeductionRate ?? null } });
    await this.log(req, "tax_profile", "vendor", id, before, input);
    return row;
  }

  @Get("purchases/requisitions")
  @RequirePermissions("purchases.view")
  requisitions() {
    return this.prisma.purchaseRequisition.findMany({ include: { items: true, quotes: { include: { vendor: true } }, orders: true }, orderBy: { createdAt: "desc" }, take: 500 });
  }

  @Post("purchases/requisitions")
  @RequirePermissions("purchases.create")
  async createRequisition(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(requisitionSchema, body);
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("PURCHASE_REQUISITION", tx);
      const row = await tx.purchaseRequisition.create({
        data: {
          number,
          requesterId: req.user.id,
          neededBy: input.neededBy ? new Date(input.neededBy) : undefined,
          notes: input.notes,
          status: "SUBMITTED",
          items: { create: input.items.map((item) => ({ variantId: item.variantId, description: item.description, qty: item.qty })) },
        },
        include: { items: true },
      });
      await this.workflow.record("purchase_requisition", row.id, null, "SUBMITTED", req.user.id, undefined, tx);
      await this.log(req, "create", "purchase_requisition", row.id, undefined, { number, lines: row.items.length }, tx);
      return row;
    });
  }

  @Post("purchases/requisitions/:id/quotes")
  @RequirePermissions("purchases.create")
  async addQuote(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(vendorQuoteSchema, body);
    const requisition = await this.prisma.purchaseRequisition.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!requisition) throw new NotFoundException("Requisition not found");
    if (["CLOSED", "CANCELLED", "ORDERED"].includes(requisition.status)) throw new BadRequestException("Requisition is closed");
    const vendor = await this.prisma.vendor.findFirst({ where: { id: input.vendorId, active: true }, select: { id: true } });
    if (!vendor) throw new BadRequestException("Vendor not found or inactive");
    const row = await this.prisma.vendorQuote.create({
      data: { requisitionId: id, vendorId: input.vendorId, amount: input.amount, leadTimeDays: input.leadTimeDays, notes: input.notes, items: input.items as Prisma.InputJsonValue },
    });
    await this.log(req, "create", "vendor_quote", row.id, undefined, { requisitionId: id, vendorId: input.vendorId, amount: input.amount });
    return row;
  }

  @Post("purchases/orders")
  @RequirePermissions("purchases.create")
  async createPo(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(purchaseOrderSchema, body);
    const vendor = await this.prisma.vendor.findFirst({ where: { id: input.vendorId, active: true }, select: { id: true } });
    if (!vendor) throw new BadRequestException("Vendor not found or inactive");
    let subtotal = new Prisma.Decimal(0);
    let tax = new Prisma.Decimal(0);
    const items = input.items.map((item) => {
      const taxRate = item.taxRate ?? 18;
      const line = new Prisma.Decimal(item.qty).mul(item.rate).toDecimalPlaces(2);
      subtotal = subtotal.add(line);
      tax = tax.add(line.mul(taxRate).div(100).toDecimalPlaces(2));
      return { variantId: item.variantId, description: item.description, qty: item.qty, rate: item.rate, taxRate };
    });
    const total = subtotal.add(tax);
    const result = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("PURCHASE_ORDER", tx);
      const order = await tx.purchaseOrder.create({
        data: { number, vendorId: input.vendorId, requisitionId: input.requisitionId, status: "SUBMITTED", subtotal, tax, total, createdById: req.user.id, expectedOn: input.expectedOn ? new Date(input.expectedOn) : undefined, items: { create: items } },
      });
      const approval = await this.approvals.open({ entityType: "PURCHASE", entityId: order.id, requesterId: req.user.id, context: { amount: num(total) }, snapshot: { number, total: num(total) } }, tx);
      const setting = await tx.businessSetting.findUnique({ where: { key: "procurement" } });
      const configured = Number((setting?.value as { buyerAuthority?: unknown } | null)?.buyerAuthority);
      const authority = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_BUYER_AUTHORITY;
      const autoApprove = !approval && total.lte(authority);
      if (autoApprove) {
        await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "APPROVED" } });
        await this.workflow.record("purchase_order", order.id, "SUBMITTED", "APPROVED", req.user.id, "Within buyer authority", tx);
      } else {
        await this.workflow.record("purchase_order", order.id, null, "SUBMITTED", req.user.id, undefined, tx);
      }
      if (input.requisitionId) await tx.purchaseRequisition.updateMany({ where: { id: input.requisitionId, status: { in: ["SUBMITTED", "APPROVED"] } }, data: { status: "ORDERED" } });
      await this.log(req, "create", "purchase_order", order.id, undefined, { number, total, autoApproved: autoApprove }, tx);
      return { id: order.id, number, autoApprove };
    });
    if (result.autoApprove) {
      const managers = await this.notify.usersWithRole("procurement_manager");
      await this.notify.push(managers.map((user) => user.id), "PO approved", `${result.number} is within authority`, "purchase_order", result.id);
    }
    return this.prisma.purchaseOrder.findUnique({ where: { id: result.id }, include: { items: true, vendor: true } });
  }

  @Get("purchases/orders")
  @RequirePermissions("purchases.view")
  orders() {
    return this.prisma.purchaseOrder.findMany({ include: { vendor: true, items: true, receipts: true }, orderBy: { createdAt: "desc" }, take: 500 });
  }

  @Post("purchases/receipts")
  @RequirePermissions("inventory.create")
  async receive(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(goodsReceiptSchema, body);
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, active: true }, select: { id: true } });
    if (!warehouse) throw new BadRequestException("Warehouse not found");
    const receipt = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${input.purchaseOrderId} FOR UPDATE`;
      const po = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { items: true } });
      if (!po) throw new NotFoundException("Purchase order not found");
      if (!["APPROVED", "PARTIAL"].includes(po.status)) throw new BadRequestException("Purchase order is not open for receipt");
      const pending = await tx.goodsReceiptItem.groupBy({
        by: ["purchaseOrderItemId"],
        where: { goodsReceipt: { purchaseOrderId: po.id, status: { in: ["RECEIVED", "QC"] } } },
        _sum: { qty: true },
      });
      const claimed = new Map<string, number>();
      const lines = input.items.map((item) => {
        const source = po.items.find((line) => line.id === item.purchaseOrderItemId);
        if (!source) throw new BadRequestException("Receipt line does not belong to this purchase order");
        const inFlight = num(pending.find((row) => row.purchaseOrderItemId === source.id)?._sum.qty) + (claimed.get(source.id) || 0);
        const open = num(source.qty) * OVER_RECEIPT_TOLERANCE - num(source.receivedQty) - inFlight;
        if (item.qty > open + 0.0001) throw new BadRequestException(`Receipt for "${source.description}" exceeds the open quantity`);
        claimed.set(source.id, (claimed.get(source.id) || 0) + item.qty);
        return { ...item, variantId: source.variantId };
      });
      const number = await this.numbers.next("GRN", tx);
      const created = await tx.goodsReceipt.create({
        data: {
          number,
          purchaseOrderId: po.id,
          warehouseId: input.warehouseId,
          status: "QC",
          createdById: req.user.id,
          items: { create: lines.map((item) => ({ purchaseOrderItemId: item.purchaseOrderItemId, variantId: item.variantId, qty: item.qty, batchCode: item.batchCode })) },
        },
        include: { items: true },
      });
      for (const item of created.items) {
        if (!item.variantId) continue;
        const qcNumber = await this.numbers.next("QC", tx);
        const batchId = item.batchCode ? await this.batchFor(tx, item.batchCode, item.variantId, po.vendorId) : undefined;
        await tx.qualityInspection.create({
          data: {
            number: qcNumber,
            stage: "INCOMING",
            status: "PENDING",
            variantId: item.variantId,
            batchId,
            goodsReceiptId: created.id,
            parameters: ["Dimensions", "Thickness", "Visual", "Coating"].map((name) => ({ name, result: "" })),
          },
        });
      }
      await this.events.record("GoodsReceived", { goodsReceiptId: created.id }, tx);
      await this.events.record("QCRequired", { goodsReceiptId: created.id }, tx);
      await this.workflow.record("goods_receipt", created.id, null, "QC", req.user.id, undefined, tx);
      await this.log(req, "create", "goods_receipt", created.id, undefined, { number, purchaseOrderId: po.id, lines: created.items.length }, tx);
      return created;
    });
    return receipt;
  }

  @Get("warehouses")
  @RequirePermissions("warehouses.view")
  warehouses() {
    return this.prisma.warehouse.findMany({ include: { bins: true, plant: true }, orderBy: { name: "asc" } });
  }

  @Post("warehouses")
  @RequirePermissions("warehouses.create")
  async createWarehouse(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(warehouseSchema, body);
    const row = await this.prisma.warehouse.create({ data: { code: input.code, name: input.name, plantId: input.plantId, address: input.address } });
    await this.log(req, "create", "warehouse", row.id, undefined, { code: row.code });
    return row;
  }

  @Post("warehouses/:id/bins")
  @RequirePermissions("warehouses.create")
  async createBin(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(binSchema, body);
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id }, select: { id: true } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    const row = await this.prisma.warehouseBin.create({ data: { warehouseId: id, code: input.code, zone: input.zone, barcode: input.barcode } });
    await this.log(req, "create", "warehouse_bin", row.id, undefined, { warehouseId: id, code: row.code, zone: row.zone });
    return row;
  }

  @Get("inventory/balances")
  @RequirePermissions("inventory.view")
  async balances(@Req() req: ReqUser) {
    if (isExternal(req.user)) return this.availability(req);
    const rows = await this.prisma.inventoryBalance.findMany({ include: { variant: { include: { product: true } }, warehouse: true, bin: true, batch: true }, orderBy: { updatedAt: "desc" }, take: 5000 });
    return { items: present(rows, req.user) };
  }

  @Get("inventory/availability")
  @RequirePermissions("products.view")
  async availability(@Req() req: ReqUser) {
    if (isExternal(req.user) && !req.user.roleKeys.some((role) => role === "distributor" || role === "dealer")) {
      throw new BadRequestException("Availability is for distributor and dealer accounts");
    }
    const variants = await this.prisma.productVariant.findMany({
      where: { product: { published: true }, active: true },
      select: { id: true, articleNumber: true, name: true, safetyStock: true, product: { select: { supplyMode: true } } },
      orderBy: { articleNumber: "asc" },
      take: 5000,
    });
    const stock = await this.prisma.inventoryBalance.groupBy({ by: ["variantId"], where: { variantId: { in: variants.map((variant) => variant.id) } }, _sum: { qty: true } });
    const onHandOf = new Map(stock.map((row) => [row.variantId, num(row._sum.qty)]));
    return {
      items: variants.map((variant) => {
        const onHand = onHandOf.get(variant.id) || 0;
        return {
          variantId: variant.id,
          articleNumber: variant.articleNumber,
          name: variant.name,
          availability: availabilityBand(onHand, num(variant.safetyStock), variant.product.supplyMode),
        };
      }),
    };
  }

  @Get("inventory/transactions")
  @RequirePermissions("inventory.view")
  transactions(@Query() query: Record<string, string>) {
    return this.prisma.inventoryTransaction.findMany({
      where: { variantId: query.variantId ? String(query.variantId).slice(0, 64) : undefined, warehouseId: query.warehouseId ? String(query.warehouseId).slice(0, 64) : undefined },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  @Post("inventory/transactions")
  @RequirePermissions("inventory.create")
  async post(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(inventoryPostSchema, body);
    return this.prisma.$transaction(async (tx) => {
      const result = await this.postTransaction({ ...input, actorId: req.user.id, override: req.user.permissions.includes("inventory.override") }, tx);
      await this.log(req, "post", "inventory_transaction", result.transaction.id, undefined, { type: input.type, variantId: input.variantId, qty: input.qty }, tx);
      return result;
    });
  }

  @Post("inventory/transfers")
  @RequirePermissions("inventory.create")
  async transfer(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(transferSchema, body);
    const referenceId = `TR-${randomUUID()}`;
    const common = { type: "TRANSFER", variantId: input.variantId, referenceType: "TRANSFER", referenceId, notes: input.notes, actorId: req.user.id, override: false };
    return this.prisma.$transaction(async (tx) => {
      await this.inventory.postTransaction({ ...common, warehouseId: input.fromWarehouseId, binId: input.fromBinId, qty: -input.qty }, tx);
      const result = await this.inventory.postTransaction({ ...common, warehouseId: input.toWarehouseId, binId: input.toBinId, qty: input.qty }, tx);
      await this.log(req, "transfer", "inventory", referenceId, undefined, { variantId: input.variantId, qty: input.qty, from: input.fromBinId, to: input.toBinId }, tx);
      return result;
    });
  }

  @Get("dispatch")
  @RequirePermissions("dispatch.view")
  async dispatches(@Req() req: ReqUser) {
    return this.prisma.dispatchNote.findMany({
      where: { salesOrder: isExternal(req.user) ? { customerId: req.user.customerId || "__none__" } : undefined },
      include: { items: true, salesOrder: { select: { number: true, customer: { select: { name: true } } } }, warehouse: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }

  @Post("dispatch")
  @RequirePermissions("dispatch.create")
  async createDispatch(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(dispatchSchema, body);
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, active: true }, select: { id: true } });
    if (!warehouse) throw new BadRequestException("Warehouse not found");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SalesOrder" WHERE "id" = ${input.salesOrderId} FOR UPDATE`;
      const order = await tx.salesOrder.findUnique({ where: { id: input.salesOrderId }, include: { items: true } });
      if (!order) throw new NotFoundException("Sales order not found");
      if (!["CONFIRMED", "PARTIAL", "BACKORDERED"].includes(order.status)) throw new BadRequestException(`A ${order.status} order cannot be dispatched`);
      const planned = await tx.dispatchItem.groupBy({
        by: ["salesOrderItemId"],
        where: { dispatch: { salesOrderId: order.id, status: { in: ["PICK_LIST", "PICKING"] } } },
        _sum: { qty: true },
      });
      const claimed = new Map<string, number>();
      const lines = input.items.map((item) => {
        const source = order.items.find((line) => line.id === item.salesOrderItemId);
        if (!source) throw new BadRequestException("Dispatch line does not belong to this sales order");
        const inFlight = num(planned.find((row) => row.salesOrderItemId === source.id)?._sum.qty) + (claimed.get(source.id) || 0);
        const open = num(source.qty) - num(source.fulfilledQty) - inFlight;
        if (item.qty > open + 0.0001) throw new BadRequestException(`Dispatch for "${source.description}" exceeds the open quantity`);
        claimed.set(source.id, (claimed.get(source.id) || 0) + item.qty);
        return { salesOrderItemId: source.id, variantId: source.variantId, qty: item.qty };
      });
      const number = await this.numbers.next("DISPATCH", tx);
      const note = await tx.dispatchNote.create({ data: { number, salesOrderId: order.id, warehouseId: input.warehouseId, status: "PICK_LIST", createdById: req.user.id, items: { create: lines } }, include: { items: true } });
      await this.workflow.record("dispatch", note.id, null, "PICK_LIST", req.user.id, undefined, tx);
      await this.log(req, "create", "dispatch", note.id, undefined, { number, salesOrderId: order.id, lines: lines.length }, tx);
      return note;
    });
  }

  @Post("dispatch/:id/pick")
  @RequirePermissions("dispatch.edit")
  async pick(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(pickSchema, body);
    const note = await this.prisma.dispatchNote.findUnique({ where: { id }, include: { items: true } });
    if (!note) throw new NotFoundException("Dispatch not found");
    if (!["PICK_LIST", "PICKING"].includes(note.status)) throw new BadRequestException(`A ${note.status} dispatch cannot be picked`);
    for (const item of input.items) {
      const line = note.items.find((row) => row.id === item.id);
      if (!line) throw new BadRequestException("Pick line does not belong to this dispatch");
      if (item.pickedQty > num(line.qty) + 0.0001) throw new BadRequestException("Picked quantity exceeds the dispatch quantity");
    }
    return this.prisma.$transaction(async (tx) => {
      for (const item of input.items) await tx.dispatchItem.update({ where: { id: item.id }, data: { pickedQty: item.pickedQty } });
      const claimed = await tx.dispatchNote.updateMany({ where: { id, status: note.status }, data: { status: "PICKING" } });
      if (!claimed.count) throw new BadRequestException("Dispatch was changed by someone else; reload and try again");
      if (note.status !== "PICKING") await this.workflow.record("dispatch", id, note.status, "PICKING", req.user.id, undefined, tx);
      await this.log(req, "pick", "dispatch", id, { status: note.status }, { status: "PICKING", lines: input.items.length }, tx);
      return tx.dispatchNote.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
  }

  @Post("dispatch/:id/ship")
  @RequirePermissions("dispatch.approve")
  async ship(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(shipSchema, body ?? {});
    const note = await this.prisma.dispatchNote.findUnique({ where: { id }, include: { items: true } });
    if (!note) throw new NotFoundException("Dispatch not found");
    if (note.status !== "PICKING") throw new BadRequestException("Only a picked dispatch can be shipped");
    if (!note.items.some((item) => num(item.pickedQty) > 0)) throw new BadRequestException("Nothing has been picked");
    const fg = await this.prisma.warehouseBin.findFirst({ where: { warehouseId: note.warehouseId, zone: "FG" } });
    if (!fg) throw new BadRequestException("Finished-goods bin is missing");
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.dispatchNote.updateMany({
        where: { id, status: "PICKING" },
        data: { status: "SHIPPED", transporter: input.transporter, lrNumber: input.lrNumber, ewayBill: input.ewayBill, vehicleNo: input.vehicleNo, transporterGstin: input.transporterGstin || null, distanceKm: input.distanceKm, ewbStatus: input.ewayBill ? "ACTIVE" : undefined, shippedAt: new Date() },
      });
      if (!claimed.count) throw new BadRequestException("Dispatch was already shipped");
      for (const item of note.items) {
        if (!item.variantId || num(item.pickedQty) <= 0) continue;
        await this.inventory.postTransaction({ type: "SALES", warehouseId: note.warehouseId, binId: fg.id, variantId: item.variantId, qty: -num(item.pickedQty), referenceType: "DISPATCH", referenceId: note.id, actorId: req.user.id, override: false }, tx);
        if (item.salesOrderItemId) await tx.salesOrderItem.update({ where: { id: item.salesOrderItemId }, data: { fulfilledQty: { increment: num(item.pickedQty) } } });
      }
      await this.workflow.record("dispatch", id, note.status, "SHIPPED", req.user.id, undefined, tx);
      await this.ledger.tryPost("dispatch " + id, () => this.ledger.postStock(tx, "DISPATCH", id));
      await this.events.record("DispatchShipped", { dispatchId: id }, tx);
      await this.log(req, "ship", "dispatch", id, { status: note.status }, { status: "SHIPPED" }, tx);
      return tx.dispatchNote.findUniqueOrThrow({ where: { id } });
    }, { timeout: 30_000 });
    return updated;
  }

  @Post("dispatch/:id/deliver")
  @RequirePermissions("dispatch.edit")
  async deliver(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(deliverSchema, body ?? {});
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.dispatchNote.updateMany({ where: { id, status: "SHIPPED" }, data: { status: "DELIVERED", deliveredAt: new Date(), proofNote: input.proofNote } });
      if (!result.count) throw new BadRequestException("Ship the dispatch before recording delivery");
      await this.workflow.record("dispatch", id, "SHIPPED", "DELIVERED", req.user.id, input.proofNote, tx);
      await this.log(req, "deliver", "dispatch", id, { status: "SHIPPED" }, { status: "DELIVERED" }, tx);
      return tx.dispatchNote.findUnique({ where: { id } });
    });
  }

  postTransaction(input: StockPosting, tx?: Tx) {
    return this.inventory.postTransaction(input, tx);
  }

  private async batchFor(tx: Tx, code: string, variantId: string, vendorId: string) {
    const existing = await tx.batchLot.findUnique({ where: { vendorId_variantId_supplierBatch: { vendorId, variantId, supplierBatch: code } } });
    if (existing) return existing.id;
    const taken = await tx.batchLot.findUnique({ where: { code }, select: { id: true } });
    const internalCode = taken ? `${code}-${randomUUID().slice(0, 6).toUpperCase()}` : code;
    const batch = await tx.batchLot.create({ data: { code: internalCode, variantId, supplierBatch: code, vendorId, qcStatus: "PENDING" } });
    return batch.id;
  }
}
