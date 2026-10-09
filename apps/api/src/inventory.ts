import { BadRequestException, Injectable } from "@nestjs/common";
import { num } from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { PrismaService } from "./prisma.service";
import { DomainEventService, Tx } from "./services";

export type StockPosting = {
  type: string;
  warehouseId: string;
  binId: string;
  variantId: string;
  batchId?: string;
  qty: number;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  actorId?: string;
  override: boolean;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  /** Posts one stock movement. Pass `tx` to make it part of a larger unit of work. */
  postTransaction(input: StockPosting, tx?: Tx) {
    return tx ? this.post(tx, input) : this.prisma.$transaction((inner) => this.post(inner, input));
  }

  private async post(tx: Tx, input: StockPosting) {
    if (!Number.isFinite(input.qty) || input.qty === 0) throw new BadRequestException("Quantity must be non-zero");
    const batchKey = input.batchId || "_";
    const key = { warehouseId: input.warehouseId, binId: input.binId, variantId: input.variantId, batchKey };
    const bin = await tx.warehouseBin.findFirst({ where: { id: input.binId, warehouseId: input.warehouseId }, select: { id: true } });
    if (!bin) throw new BadRequestException("Bin does not belong to this warehouse");
    const row = await tx.inventoryBalance.upsert({
      where: { warehouseId_binId_variantId_batchKey: key },
      update: {},
      create: { ...key, batchId: input.batchId, qty: 0, avgCost: 0 },
      select: { id: true },
    });
    const [locked] = await tx.$queryRaw<Array<{ qty: Prisma.Decimal; avgCost: Prisma.Decimal }>>`SELECT "qty", "avgCost" FROM "InventoryBalance" WHERE "id" = ${row.id} FOR UPDATE`;
    const current = new Prisma.Decimal(locked?.qty ?? 0);
    const delta = new Prisma.Decimal(input.qty);
    const next = current.add(delta);
    if (next.lt(-0.0001) && !input.override) throw new BadRequestException("Stock cannot go negative. Adjustments that drive stock below zero need override.");
    const currentAvg = new Prisma.Decimal(locked?.avgCost ?? 0);
    const unitCost = input.unitCost !== undefined ? new Prisma.Decimal(input.unitCost) : currentAvg;
    const avgCost = delta.gt(0) && next.gt(0) ? current.mul(currentAvg).add(delta.mul(unitCost)).div(next).toDecimalPlaces(2) : currentAvg;
    const balance = await tx.inventoryBalance.update({ where: { id: row.id }, data: { qty: next, avgCost, batchId: input.batchId } });
    const transaction = await tx.inventoryTransaction.create({
      data: {
        type: input.type,
        warehouseId: input.warehouseId,
        binId: input.binId,
        variantId: input.variantId,
        batchId: batchKey === "_" ? "" : batchKey,
        qty: delta,
        unitCost: input.unitCost !== undefined ? unitCost : avgCost,
        balanceAfter: next,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        notes: input.notes,
        actorId: input.actorId,
      },
    });
    const variant = await tx.productVariant.findUnique({ where: { id: input.variantId }, select: { id: true, reorderLevel: true } });
    if (variant && next.lt(num(variant.reorderLevel))) {
      await this.events.record("StockBelowReorder", { variantId: variant.id, onHand: num(next), reorderLevel: num(variant.reorderLevel) }, tx);
    }
    return { transaction, balance };
  }
}
