import { Injectable } from "@nestjs/common";
import { SupplyType, computeTax, gstSettingsSchema, isValidGstin, stateCodeFromName, stateCodeOf } from "@fixotec/shared";
import { z } from "zod";
import { env } from "./env";
import { PrismaService } from "./prisma.service";
import { Tx } from "./services";

export type GstSettings = z.infer<typeof gstSettingsSchema>;
export type Party = { gstin?: string | null; addresses?: Array<{ label: string; city: string; state: string | null; postalCode: string | null; country: string; gstin: string | null; line1: string; line2: string | null }> };

@Injectable()
export class GstService {
  constructor(private readonly prisma: PrismaService) {}

  async settings(tx: Tx | PrismaService = this.prisma): Promise<Partial<GstSettings>> {
    const row = await tx.businessSetting.findUnique({ where: { key: "gst" } });
    return (row?.value as Partial<GstSettings> | null) || {};
  }

  async supplierState(tx: Tx | PrismaService = this.prisma) {
    const settings = await this.settings(tx);
    return settings.stateCode || stateCodeOf(env.GSTIN);
  }

  /**
   * Place of supply and supply type for a sale. Registered buyers: the state in their GSTIN.
   * Unregistered: the shipping (else any) address state. Foreign currency or address abroad: export (96).
   */
  async placeOf(customer: Party, currency = "INR", tx: Tx | PrismaService = this.prisma): Promise<{ placeOfSupply: string; supplyType: SupplyType }> {
    const settings = await this.settings(tx);
    const supplier = settings.stateCode || stateCodeOf(env.GSTIN) || "27";
    const addresses = customer.addresses || [];
    const abroad = addresses.length > 0 && addresses.every((address) => address.country && !/^india$/i.test(address.country.trim()));
    if (currency !== "INR" || abroad) return { placeOfSupply: "96", supplyType: settings.exportWithPayment ? "EXPWP" : "EXPWOP" };
    const gstin = customer.gstin && isValidGstin(customer.gstin) ? customer.gstin.toUpperCase() : null;
    if (gstin) return { placeOfSupply: gstin.slice(0, 2), supplyType: "B2B" };
    const shipping = addresses.find((address) => /ship|site|deliver/i.test(address.label)) || addresses[0];
    return { placeOfSupply: stateCodeFromName(shipping?.state) || supplier, supplyType: "B2C" };
  }

  /** Tax lines for an invoice that predates the tax engine (no split stored). */
  async splitFor(lines: Array<{ amount: number; taxRate: number; hsn?: string | null; qty?: number; uqc?: string | null }>, placeOfSupply: string | null, supplyType: string, tx: Tx | PrismaService = this.prisma) {
    return computeTax(lines, { supplierState: await this.supplierState(tx), placeOfSupply, supplyType: supplyType as SupplyType });
  }
}
