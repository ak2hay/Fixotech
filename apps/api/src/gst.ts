import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Put, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import QRCode from "qrcode";
import {
  EINVOICE_CANCEL_REASONS,
  STATE_CODES,
  SupplyType,
  TDS_SECTIONS,
  buildGstr1,
  einvoiceCancelSchema,
  ewayBillSchema,
  ewayCancelSchema,
  ewayExtendSchema,
  ewayPartBSchema,
  gstFilingSchema,
  gstSettingsSchema,
  hsnSummary,
  isValidGstin,
  monthRange,
  num,
  quarterRange,
  reconcile2b,
  round2,
  setOffItc,
  stateCodeFromName,
  stateCodeOf,
  tdsRateFor,
  twoBActionSchema,
  type ReturnDoc,
} from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { z } from "zod";
import { env } from "./env";
import { GspClient } from "./gsp";
import { AuthUser, RequirePermissions, assertStaff, parseBody } from "./http";
import { LedgerService } from "./ledger";
import { GstService, type Party } from "./tax";
import { PrismaService } from "./prisma.service";
import { AuditService, contentDisposition } from "./services";
import { MB, Upload, uploadLimits } from "./uploads";

type ReqUser = { user: AuthUser; ip?: string };

const DAY = 86_400_000;
const periodQuery = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM") });
const quarterQuery = z.object({ quarter: z.string().regex(/^\d{4}-Q[1-4]$/, "Use YYYY-Q1..Q4") });
const docDate = (date: Date) => `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;

@Controller()
export class GstController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gst: GstService,
    private readonly gsp: GspClient,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  private log(req: ReqUser, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown) {
    return this.audit.log({ actorId: req.user.id, action, entityType, entityId, before, after, ip: req.ip });
  }

  // ---------- Settings ----------

  @Get("gst/settings")
  @RequirePermissions("accounting.view")
  async getSettings() {
    const settings = await this.gst.settings();
    return { settings, gstin: env.GSTIN || null, gstinValid: isValidGstin(env.GSTIN), provider: this.gsp.provider, configured: this.gsp.configured, states: STATE_CODES, tdsSections: TDS_SECTIONS, cancelReasons: EINVOICE_CANCEL_REASONS };
  }

  @Put("gst/settings")
  @RequirePermissions("accounting.edit")
  async putSettings(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(gstSettingsSchema, body);
    if (env.GSTIN && stateCodeOf(env.GSTIN) !== input.stateCode) throw new BadRequestException(`The state must match the GSTIN (${stateCodeOf(env.GSTIN)})`);
    const before = await this.gst.settings();
    await this.prisma.businessSetting.upsert({ where: { key: "gst" }, update: { value: input }, create: { key: "gst", value: input } });
    await this.log(req, "update", "gst_settings", "gst", before, input);
    return input;
  }

  // ---------- e-invoice ----------

  @Get("gst/einvoice/queue")
  @RequirePermissions("invoices.view")
  async einvoiceQueue(@Req() req: ReqUser) {
    assertStaff(req.user);
    const since = new Date(Date.now() - 30 * DAY);
    const [invoices, notes] = await Promise.all([
      this.prisma.invoice.findMany({ where: { source: null, status: { not: "CANCELLED" }, supplyType: { not: "B2C" }, issueDate: { gte: since } }, include: { customer: { select: { name: true, gstin: true } } }, orderBy: { issueDate: "desc" }, take: 300 }),
      this.prisma.creditNote.findMany({ where: { status: { not: "CANCELLED" }, supplyType: { not: "B2C" }, date: { gte: since } }, include: { customer: { select: { name: true, gstin: true } } }, orderBy: { date: "desc" }, take: 300 }),
    ]);
    const row = (kind: string, doc: { id: string; number: string; total: unknown; irn: string | null; ackNo: string | null; ackDate: Date | null; einvoiceStatus: string | null; einvoiceError: string | null; customer: { name: string; gstin: string | null } }, date: Date) => ({
      kind,
      id: doc.id,
      number: doc.number,
      date,
      customer: doc.customer.name,
      gstin: doc.customer.gstin,
      total: num(doc.total),
      irn: doc.irn,
      ackNo: doc.ackNo,
      ackDate: doc.ackDate,
      status: doc.einvoiceStatus || "PENDING",
      error: doc.einvoiceError,
      cancellable: Boolean(doc.irn && doc.einvoiceStatus === "GENERATED" && doc.ackDate && Date.now() - doc.ackDate.getTime() < DAY),
    });
    return [...invoices.map((doc) => row("invoice", doc, doc.issueDate)), ...notes.map((doc) => row("credit_note", doc, doc.date))].sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private async sellerBlock() {
    const settings = await this.gst.settings();
    if (!env.GSTIN || !isValidGstin(env.GSTIN)) throw new BadRequestException("Set a valid GSTIN in the API environment before e-invoicing");
    if (!settings.legalName || !settings.address1 || !settings.pincode || !settings.stateCode || !settings.city) throw new BadRequestException("Complete the GST settings (legal name, address, PIN, state) first");
    return { settings, seller: { Gstin: env.GSTIN.toUpperCase(), LglNm: settings.legalName, TrdNm: settings.tradeName || undefined, Addr1: settings.address1, Addr2: settings.address2 || undefined, Loc: settings.city, Pin: Number(settings.pincode), Stcd: settings.stateCode, Ph: settings.phone || undefined, Em: settings.email || undefined } };
  }

  private buyerBlock(customer: { name: string; gstin: string | null; addresses: NonNullable<Party["addresses"]> }, placeOfSupply: string, supplyType: string) {
    const billing = customer.addresses.find((address) => /bill|office|head/i.test(address.label)) || customer.addresses[0];
    const exportSale = supplyType.startsWith("EXP");
    if (!exportSale && !customer.gstin) throw new BadRequestException("e-invoices are for registered buyers; add the customer's GSTIN");
    if (!exportSale && !isValidGstin(customer.gstin)) throw new BadRequestException(`The customer GSTIN ${customer.gstin} is not valid`);
    if (!billing) throw new BadRequestException("Add a billing address to the customer");
    const pin = exportSale ? 999999 : Number(billing.postalCode || 0);
    if (!exportSale && !/^[1-9]\d{5}$/.test(String(billing.postalCode || ""))) throw new BadRequestException("The customer's billing address needs a 6-digit PIN code");
    return {
      Gstin: exportSale ? "URP" : customer.gstin!.toUpperCase(),
      LglNm: customer.name.slice(0, 100),
      Pos: placeOfSupply,
      Addr1: billing.line1.slice(0, 100),
      Addr2: billing.line2?.slice(0, 100) || undefined,
      Loc: billing.city.slice(0, 50),
      Pin: pin,
      Stcd: exportSale ? "96" : customer.gstin!.slice(0, 2),
    };
  }

  /** NIC e-invoice schema 1.1. */
  private async einvoicePayload(kind: "invoice" | "credit_note", id: string) {
    const { seller } = await this.sellerBlock();
    if (kind === "invoice") {
      const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: { items: true, customer: { include: { addresses: true } } } });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.source) throw new BadRequestException("Imported invoices were e-invoiced in the previous system");
      if (invoice.status === "CANCELLED") throw new BadRequestException("The invoice is cancelled");
      if (invoice.supplyType === "B2C") throw new BadRequestException("B2C invoices do not need an IRN");
      const pos = invoice.placeOfSupply || (await this.gst.placeOf(invoice.customer, invoice.currency)).placeOfSupply;
      const split = invoice.items.some((item) => num(item.cgst) + num(item.sgst) + num(item.igst) > 0) || invoice.supplyType.endsWith("WOP")
        ? invoice.items.map((item) => ({ amount: num(item.amount), taxRate: num(item.taxRate), hsn: item.hsn, qty: num(item.qty), uqc: item.uqc, cgst: num(item.cgst), sgst: num(item.sgst), igst: num(item.igst) }))
        : (await this.gst.splitFor(invoice.items.map((item) => ({ amount: num(item.amount), taxRate: num(item.taxRate), hsn: item.hsn, qty: num(item.qty) })), pos, invoice.supplyType)).lines;
      const rows = invoice.items.map((item, index) => ({ ...split[index], description: item.description, rate: num(item.rate) }));
      return { doc: invoice, payload: this.nicPayload("INV", invoice.number, invoice.issueDate, invoice.supplyType, invoice.reverseCharge, seller, this.buyerBlock(invoice.customer, pos, invoice.supplyType), rows, num(invoice.total)) };
    }
    const note = await this.prisma.creditNote.findUnique({ where: { id }, include: { customer: { include: { addresses: true } }, invoice: { select: { number: true, issueDate: true } } } });
    if (!note) throw new NotFoundException("Credit note not found");
    if (note.status === "CANCELLED") throw new BadRequestException("The credit note is cancelled");
    const pos = note.placeOfSupply || (await this.gst.placeOf(note.customer)).placeOfSupply;
    const lines = (note.items as Array<{ description: string; amount: number; taxRate: number; hsn?: string }>).map((line) => ({ amount: Number(line.amount), taxRate: Number(line.taxRate), hsn: line.hsn, qty: 1, description: line.description }));
    const split = (await this.gst.splitFor(lines, pos, note.supplyType)).lines.map((line, index) => ({ ...line, description: lines[index].description, rate: line.amount }));
    const payload = this.nicPayload("CRN", note.number, note.date, note.supplyType, false, seller, this.buyerBlock(note.customer, pos, note.supplyType), split, num(note.total));
    if (note.invoice) Object.assign(payload, { RefDtls: { PrecDocDtls: [{ InvNo: note.invoice.number, InvDt: docDate(note.invoice.issueDate) }] } });
    return { doc: note, payload };
  }

  private nicPayload(type: "INV" | "CRN", number: string, date: Date, supplyType: string, reverseCharge: boolean, seller: Record<string, unknown>, buyer: Record<string, unknown>, rows: Array<{ amount: number; taxRate: number; hsn?: string | null; qty?: number; uqc?: string | null; cgst: number; sgst: number; igst: number; description?: string; rate: number }>, total: number) {
    const missingHsn = rows.find((row) => !row.hsn || !/^\d{4,8}$/.test(row.hsn.replace(/\s/g, "")));
    if (missingHsn) throw new BadRequestException(`Every line needs a 4-8 digit HSN code (${missingHsn.description || "line"}); set it on the product`);
    const items = rows.map((row, index) => {
      const qty = row.qty || 1;
      return {
        SlNo: String(index + 1),
        PrdDesc: (row.description || "Item").slice(0, 300),
        IsServc: row.hsn!.startsWith("99") ? "Y" : "N",
        HsnCd: row.hsn!.replace(/\s/g, ""),
        Qty: qty,
        Unit: row.uqc || "NOS",
        UnitPrice: round2(row.rate || row.amount / qty),
        TotAmt: round2(row.amount),
        AssAmt: round2(row.amount),
        GstRt: row.taxRate,
        IgstAmt: row.igst,
        CgstAmt: row.cgst,
        SgstAmt: row.sgst,
        TotItemVal: round2(row.amount + row.igst + row.cgst + row.sgst),
      };
    });
    const sum = (key: "AssAmt" | "IgstAmt" | "CgstAmt" | "SgstAmt") => round2(items.reduce((acc, item) => acc + item[key], 0));
    const computed = round2(sum("AssAmt") + sum("IgstAmt") + sum("CgstAmt") + sum("SgstAmt"));
    return {
      Version: "1.1",
      TranDtls: { TaxSch: "GST", SupTyp: supplyType === "B2C" ? "B2B" : supplyType, RegRev: reverseCharge ? "Y" : "N", IgstOnIntra: "N" },
      DocDtls: { Typ: type, No: number.slice(0, 16), Dt: docDate(date) },
      SellerDtls: seller,
      BuyerDtls: buyer,
      ItemList: items,
      ValDtls: { AssVal: sum("AssAmt"), IgstVal: sum("IgstAmt"), CgstVal: sum("CgstAmt"), SgstVal: sum("SgstAmt"), RndOffAmt: round2(total - computed), TotInvVal: round2(total) },
      ...(supplyType.startsWith("EXP") ? { ExpDtls: { CntCode: "XX", ForCur: "INR" } } : {}),
    };
  }

  @Post("gst/einvoice/:kind/:id")
  @RequirePermissions("invoices.edit")
  async generateIrn(@Param("kind") kind: string, @Param("id") id: string, @Req() req: ReqUser) {
    if (kind !== "invoice" && kind !== "credit_note") throw new BadRequestException("Unknown document type");
    const { doc, payload } = await this.einvoicePayload(kind, id);
    if (doc.irn && doc.einvoiceStatus === "GENERATED") throw new ConflictException(`IRN already generated: ${doc.irn}`);
    const store = (data: Record<string, unknown>) => (kind === "invoice" ? this.prisma.invoice.update({ where: { id }, data }) : this.prisma.creditNote.update({ where: { id }, data }));
    try {
      const result = await this.gsp.generateIrn(payload);
      await store({ irn: result.irn, ackNo: result.ackNo, ackDate: result.ackDate, signedQr: result.signedQr, einvoiceStatus: "GENERATED", einvoiceError: null });
      await this.log(req, "einvoice", kind, id, undefined, { irn: result.irn, ackNo: result.ackNo, provider: this.gsp.provider });
      return { ...result, provider: this.gsp.provider };
    } catch (error) {
      await store({ einvoiceStatus: "FAILED", einvoiceError: (error as Error).message.slice(0, 500) });
      throw error;
    }
  }

  /** IRNs can be cancelled only within 24 hours; after that the correction is a credit note. */
  @Post("gst/einvoice/:kind/:id/cancel")
  @RequirePermissions("invoices.approve")
  async cancelIrn(@Param("kind") kind: string, @Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(einvoiceCancelSchema, body);
    if (kind !== "invoice" && kind !== "credit_note") throw new BadRequestException("Unknown document type");
    const doc = kind === "invoice" ? await this.prisma.invoice.findUnique({ where: { id } }) : await this.prisma.creditNote.findUnique({ where: { id } });
    if (!doc?.irn || doc.einvoiceStatus !== "GENERATED") throw new BadRequestException("There is no active IRN to cancel");
    if (!doc.ackDate || Date.now() - doc.ackDate.getTime() > DAY) throw new BadRequestException("The 24-hour cancellation window has passed; issue a credit note instead");
    const result = await this.gsp.cancelIrn(doc.irn, input.reason, input.remark);
    await this.prisma.$transaction(async (tx) => {
      if (kind === "invoice") {
        await tx.invoice.update({ where: { id }, data: { einvoiceStatus: "CANCELLED", irnCancelledAt: result.cancelDate, status: "CANCELLED" } });
        const entry = await tx.journalEntry.findUnique({ where: { postingKey: `invoice:${id}` }, include: { reversedBy: true } });
        if (entry && !entry.reversedBy) await this.ledger.reverse(tx, entry.id, `IRN cancelled: ${EINVOICE_CANCEL_REASONS[input.reason]}`, req.user.id);
      } else {
        await tx.creditNote.update({ where: { id }, data: { einvoiceStatus: "CANCELLED", irnCancelledAt: result.cancelDate, status: "CANCELLED" } });
        const entry = await tx.journalEntry.findUnique({ where: { postingKey: `credit_note:${id}` }, include: { reversedBy: true } });
        if (entry && !entry.reversedBy) await this.ledger.reverse(tx, entry.id, `IRN cancelled: ${EINVOICE_CANCEL_REASONS[input.reason]}`, req.user.id);
      }
    });
    await this.log(req, "einvoice_cancel", kind, id, { irn: doc.irn }, { reason: EINVOICE_CANCEL_REASONS[input.reason], remark: input.remark });
    return { cancelled: true, cancelDate: result.cancelDate };
  }

  @Get("gst/einvoice/:kind/:id/qr")
  @RequirePermissions("invoices.view")
  async qr(@Param("kind") kind: string, @Param("id") id: string, @Req() req: ReqUser, @Res() res: Response) {
    assertStaff(req.user);
    const doc = kind === "invoice" ? await this.prisma.invoice.findUnique({ where: { id }, select: { signedQr: true, number: true } }) : await this.prisma.creditNote.findUnique({ where: { id }, select: { signedQr: true, number: true } });
    if (!doc?.signedQr) throw new NotFoundException("No signed QR for this document");
    const png = await QRCode.toBuffer(doc.signedQr, { errorCorrectionLevel: "M", margin: 1, width: 360 });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", contentDisposition(`${doc.number}-qr.png`, "inline"));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(png);
  }

  // ---------- e-way bill ----------

  @Post("gst/ewaybill/:dispatchId")
  @RequirePermissions("dispatch.approve")
  async ewayBill(@Param("dispatchId") dispatchId: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(ewayBillSchema, body);
    const note = await this.prisma.dispatchNote.findUnique({ where: { id: dispatchId }, include: { invoice: { include: { items: true } }, salesOrder: { include: { customer: { include: { addresses: true } } } } } });
    if (!note) throw new NotFoundException("Dispatch not found");
    if (note.ewayBill && note.ewbStatus === "ACTIVE") throw new ConflictException(`E-way bill ${note.ewayBill} is already active`);
    if (!note.invoice) throw new BadRequestException("Raise the invoice for this dispatch first; the e-way bill quotes it");
    if (input.transMode === "1" && !input.vehicleNo && !input.transporterId) throw new BadRequestException("Give the vehicle number, or the transporter ID to let them fill Part-B");
    const { seller } = await this.sellerBlock();
    const invoice = note.invoice;
    const customer = note.salesOrder.customer;
    const shipping = customer.addresses.find((address) => /ship|site|deliver/i.test(address.label)) || customer.addresses[0];
    if (!shipping?.postalCode) throw new BadRequestException("The customer's shipping address needs a PIN code");
    const pos = invoice.placeOfSupply || (await this.gst.placeOf(customer, invoice.currency)).placeOfSupply;
    const items = invoice.items.some((item) => num(item.cgst) + num(item.sgst) + num(item.igst) > 0) ? invoice.items.map((item) => ({ ...item, cgst: num(item.cgst), sgst: num(item.sgst), igst: num(item.igst) })) : (await this.gst.splitFor(invoice.items.map((item) => ({ amount: num(item.amount), taxRate: num(item.taxRate), hsn: item.hsn, qty: num(item.qty) })), pos, invoice.supplyType)).lines.map((line, index) => ({ ...invoice.items[index], ...line }));
    const payload = {
      supplyType: "O",
      subSupplyType: invoice.supplyType.startsWith("EXP") ? "3" : "1",
      docType: "INV",
      docNo: invoice.number.slice(0, 16),
      docDate: docDate(invoice.issueDate),
      fromGstin: seller.Gstin,
      fromTrdName: seller.LglNm,
      fromAddr1: seller.Addr1,
      fromPlace: seller.Loc,
      fromPincode: seller.Pin,
      fromStateCode: Number(seller.Stcd),
      actFromStateCode: Number(seller.Stcd),
      toGstin: customer.gstin && isValidGstin(customer.gstin) ? customer.gstin.toUpperCase() : "URP",
      toTrdName: customer.name.slice(0, 100),
      toAddr1: shipping.line1.slice(0, 120),
      toPlace: shipping.city.slice(0, 50),
      toPincode: Number(shipping.postalCode),
      toStateCode: Number(pos === "96" ? "99" : pos),
      actToStateCode: Number(stateCodeFromName(shipping.state) || pos),
      transactionType: 1,
      totalValue: num(invoice.subtotal),
      cgstValue: round2(items.reduce((sum, item) => sum + item.cgst, 0)),
      sgstValue: round2(items.reduce((sum, item) => sum + item.sgst, 0)),
      igstValue: round2(items.reduce((sum, item) => sum + item.igst, 0)),
      totInvValue: num(invoice.total),
      transMode: input.transMode,
      transDistance: String(input.distanceKm),
      transporterId: input.transporterId || note.transporterGstin || undefined,
      transporterName: input.transporterName || note.transporter || undefined,
      transDocNo: input.transDocNo || note.lrNumber || undefined,
      vehicleNo: input.vehicleNo || note.vehicleNo || undefined,
      vehicleType: "R",
      itemList: items.map((item) => ({ productName: item.description.slice(0, 100), hsnCode: Number(String(item.hsn || "").replace(/\D/g, "") || 0), quantity: num(item.qty), qtyUnit: item.uqc || "NOS", taxableAmount: num(item.amount), cgstRate: item.cgst ? num(item.taxRate) / 2 : 0, sgstRate: item.sgst ? num(item.taxRate) / 2 : 0, igstRate: item.igst ? num(item.taxRate) : 0 })),
    };
    if (payload.itemList.some((item) => !item.hsnCode)) throw new BadRequestException("Every item needs an HSN code for the e-way bill");
    try {
      const result = await this.gsp.generateEwb(payload);
      await this.prisma.dispatchNote.update({ where: { id: dispatchId }, data: { ewayBill: result.ewbNo, ewbDate: result.ewbDate, ewbValidUntil: result.validUntil, ewbStatus: "ACTIVE", ewbError: null, distanceKm: input.distanceKm, vehicleNo: payload.vehicleNo, transporterGstin: payload.transporterId, transporter: payload.transporterName } });
      await this.log(req, "ewaybill", "dispatch", dispatchId, undefined, { ewbNo: result.ewbNo, provider: this.gsp.provider });
      return result;
    } catch (error) {
      await this.prisma.dispatchNote.update({ where: { id: dispatchId }, data: { ewbStatus: "FAILED", ewbError: (error as Error).message.slice(0, 500) } });
      throw error;
    }
  }

  private async activeEwb(dispatchId: string) {
    const note = await this.prisma.dispatchNote.findUnique({ where: { id: dispatchId } });
    if (!note?.ewayBill || note.ewbStatus !== "ACTIVE") throw new BadRequestException("There is no active e-way bill on this dispatch");
    return note;
  }

  @Post("gst/ewaybill/:dispatchId/part-b")
  @RequirePermissions("dispatch.approve")
  async partB(@Param("dispatchId") dispatchId: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(ewayPartBSchema, body);
    const note = await this.activeEwb(dispatchId);
    const settings = await this.gst.settings();
    const result = await this.gsp.updatePartB({ ewbNo: Number(note.ewayBill), vehicleNo: input.vehicleNo, fromPlace: input.fromPlace, fromState: Number(settings.stateCode), reasonCode: input.reason, reasonRem: input.remark, transMode: "1" }, note.distanceKm || 1);
    await this.prisma.dispatchNote.update({ where: { id: dispatchId }, data: { vehicleNo: input.vehicleNo, ewbValidUntil: note.ewbValidUntil || result.validUntil } });
    await this.log(req, "ewaybill_part_b", "dispatch", dispatchId, { vehicleNo: note.vehicleNo }, { vehicleNo: input.vehicleNo });
    return { vehicleNo: input.vehicleNo, validUntil: note.ewbValidUntil || result.validUntil };
  }

  /** Extension is allowed from 8 hours before to 8 hours after expiry. */
  @Post("gst/ewaybill/:dispatchId/extend")
  @RequirePermissions("dispatch.approve")
  async extend(@Param("dispatchId") dispatchId: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(ewayExtendSchema, body);
    const note = await this.activeEwb(dispatchId);
    if (note.ewbValidUntil && Math.abs(Date.now() - note.ewbValidUntil.getTime()) > 8 * 3_600_000) throw new BadRequestException("An e-way bill can be extended only within 8 hours of its expiry");
    const settings = await this.gst.settings();
    const result = await this.gsp.extendEwb({ ewbNo: Number(note.ewayBill), vehicleNo: note.vehicleNo, fromPlace: input.fromPlace, fromState: Number(settings.stateCode), fromPincode: Number(input.fromPincode), remainingDistance: input.remainingKm, extnRsnCode: input.reason, extnRemarks: input.remark, transMode: "1" });
    await this.prisma.dispatchNote.update({ where: { id: dispatchId }, data: { ewbValidUntil: result.validUntil } });
    await this.log(req, "ewaybill_extend", "dispatch", dispatchId, { validUntil: note.ewbValidUntil }, { validUntil: result.validUntil });
    return result;
  }

  @Post("gst/ewaybill/:dispatchId/cancel")
  @RequirePermissions("dispatch.approve")
  async cancelEwb(@Param("dispatchId") dispatchId: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(ewayCancelSchema, body);
    const note = await this.activeEwb(dispatchId);
    if (note.ewbDate && Date.now() - note.ewbDate.getTime() > DAY) throw new BadRequestException("An e-way bill can be cancelled only within 24 hours");
    await this.gsp.cancelEwb(note.ewayBill!, input.reason, input.remark);
    await this.prisma.dispatchNote.update({ where: { id: dispatchId }, data: { ewbStatus: "CANCELLED" } });
    await this.log(req, "ewaybill_cancel", "dispatch", dispatchId, { ewbNo: note.ewayBill }, { remark: input.remark });
    return { cancelled: true };
  }

  @Get("gst/ewaybills")
  @RequirePermissions("dispatch.view")
  async ewayBills(@Req() req: ReqUser) {
    assertStaff(req.user);
    const notes = await this.prisma.dispatchNote.findMany({
      where: { status: { in: ["PICKING", "SHIPPED", "DELIVERED"] }, createdAt: { gte: new Date(Date.now() - 60 * DAY) } },
      include: { salesOrder: { select: { number: true, customer: { select: { name: true } } } }, invoice: { select: { id: true, number: true, total: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return notes.map((note) => ({
      id: note.id,
      number: note.number,
      status: note.status,
      customer: note.salesOrder.customer.name,
      order: note.salesOrder.number,
      invoice: note.invoice ? { id: note.invoice.id, number: note.invoice.number, total: num(note.invoice.total) } : null,
      ewayBill: note.ewayBill,
      ewbStatus: note.ewbStatus,
      ewbDate: note.ewbDate,
      ewbValidUntil: note.ewbValidUntil,
      ewbError: note.ewbError,
      vehicleNo: note.vehicleNo,
      transporter: note.transporter,
      distanceKm: note.distanceKm,
    }));
  }

  // ---------- Returns ----------

  /** Outward documents of a month in the shape the return builders take. */
  private async outward(period: string) {
    const range = monthRange(period);
    if (!range) throw new BadRequestException("Use YYYY-MM");
    const [invoices, notes] = await Promise.all([
      this.prisma.invoice.findMany({ where: { source: null, status: { not: "CANCELLED" }, issueDate: { gte: range.start, lte: range.end } }, include: { items: true, customer: { include: { addresses: true } } }, orderBy: { issueDate: "asc" } }),
      this.prisma.creditNote.findMany({ where: { status: { not: "CANCELLED" }, date: { gte: range.start, lte: range.end } }, include: { customer: { include: { addresses: true } } }, orderBy: { date: "asc" } }),
    ]);
    const docs: ReturnDoc[] = [];
    for (const invoice of invoices) {
      const place = invoice.placeOfSupply ? { placeOfSupply: invoice.placeOfSupply, supplyType: invoice.supplyType as SupplyType } : await this.gst.placeOf(invoice.customer, invoice.currency);
      const stored = invoice.items.some((item) => num(item.cgst) + num(item.sgst) + num(item.igst) > 0) || place.supplyType.endsWith("WOP");
      const lines = stored
        ? invoice.items.map((item) => ({ amount: num(item.amount), taxRate: num(item.taxRate), hsn: item.hsn, uqc: item.uqc, qty: num(item.qty), cgst: num(item.cgst), sgst: num(item.sgst), igst: num(item.igst) }))
        : (await this.gst.splitFor(invoice.items.map((item) => ({ amount: num(item.amount), taxRate: num(item.taxRate), hsn: item.hsn, qty: num(item.qty) })), place.placeOfSupply, place.supplyType)).lines;
      docs.push({ kind: "INVOICE", number: invoice.number, date: invoice.issueDate, counterpartyGstin: isValidGstin(invoice.customer.gstin) ? invoice.customer.gstin!.toUpperCase() : null, placeOfSupply: place.placeOfSupply, supplyType: place.supplyType, reverseCharge: invoice.reverseCharge, total: num(invoice.total), lines: lines.map((line) => ({ amount: line.amount, taxRate: line.taxRate, hsn: line.hsn, uqc: line.uqc, qty: line.qty, igst: line.igst, cgst: line.cgst, sgst: line.sgst })) });
    }
    for (const note of notes) {
      const place = note.placeOfSupply ? { placeOfSupply: note.placeOfSupply, supplyType: note.supplyType as SupplyType } : await this.gst.placeOf(note.customer);
      const items = note.items as Array<{ amount: number; taxRate: number; hsn?: string }>;
      const { lines } = await this.gst.splitFor(items.map((item) => ({ amount: Number(item.amount), taxRate: Number(item.taxRate), hsn: item.hsn, qty: 0 })), place.placeOfSupply, place.supplyType);
      docs.push({ kind: "CREDIT_NOTE", number: note.number, date: note.date, counterpartyGstin: isValidGstin(note.customer.gstin) ? note.customer.gstin!.toUpperCase() : null, placeOfSupply: place.placeOfSupply, supplyType: place.supplyType, total: num(note.total), lines: lines.map((line) => ({ amount: line.amount, taxRate: line.taxRate, hsn: line.hsn, qty: 0, igst: line.igst, cgst: line.cgst, sgst: line.sgst })) });
    }
    return docs;
  }

  @Get("gst/gstr1")
  @RequirePermissions("accounting.view")
  async gstr1(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const { period } = parseBody(periodQuery, query);
    const docs = await this.outward(period);
    const supplier = (await this.gst.supplierState()) || "27";
    const { json, counts } = buildGstr1(env.GSTIN || "GSTIN-NOT-SET", period, docs, supplier);
    const sumBy = (filter: (doc: ReturnDoc) => boolean) => {
      const picked = docs.filter(filter);
      const sign = (doc: ReturnDoc) => (doc.kind === "CREDIT_NOTE" ? -1 : 1);
      const total = (key: "amount" | "igst" | "cgst" | "sgst") => round2(picked.reduce((acc, doc) => acc + sign(doc) * doc.lines.reduce((s, line) => s + line[key], 0), 0));
      return { documents: picked.length, taxable: total("amount"), igst: total("igst"), cgst: total("cgst"), sgst: total("sgst") };
    };
    const missingHsn = docs.flatMap((doc) => doc.lines.filter((line) => !line.hsn).map(() => doc.number));
    const filing = await this.prisma.gstFiling.findUnique({ where: { period_returnType: { period, returnType: "GSTR1" } } });
    return {
      period,
      counts,
      sections: {
        b2b: sumBy((doc) => doc.kind === "INVOICE" && Boolean(doc.counterpartyGstin)),
        b2c: sumBy((doc) => doc.kind === "INVOICE" && !doc.counterpartyGstin && !doc.supplyType.startsWith("EXP")),
        exports: sumBy((doc) => doc.supplyType.startsWith("EXP")),
        creditNotes: sumBy((doc) => doc.kind === "CREDIT_NOTE"),
        total: sumBy(() => true),
      },
      hsn: hsnSummary(docs.flatMap((doc) => doc.lines.map((line) => ({ ...line, sign: doc.kind === "CREDIT_NOTE" ? -1 : 1 })))),
      warnings: [...(missingHsn.length ? [`${new Set(missingHsn).size} document(s) have lines without an HSN code: ${[...new Set(missingHsn)].slice(0, 10).join(", ")}`] : []), ...(env.GSTIN ? [] : ["GSTIN is not set in the API environment"])],
      filing,
      json,
    };
  }

  @Get("gst/gstr1/download")
  @RequirePermissions("accounting.export")
  async gstr1Download(@Query() query: Record<string, unknown>, @Req() req: ReqUser, @Res() res: Response) {
    const result = await this.gstr1(query, req);
    await this.log(req, "export", "gstr1", result.period, undefined, result.counts);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition(`GSTR1_${env.GSTIN || "GSTIN"}_${result.json.fp}.json`));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(JSON.stringify(result.json, null, 2));
  }

  @Get("gst/gstr3b")
  @RequirePermissions("accounting.view")
  async gstr3b(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const { period } = parseBody(periodQuery, query);
    const range = monthRange(period)!;
    const docs = await this.outward(period);
    const heads = () => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
    const add = (target: ReturnType<typeof heads>, line: { amount: number; igst: number; cgst: number; sgst: number }, sign: number) => {
      target.taxable = round2(target.taxable + sign * line.amount);
      target.igst = round2(target.igst + sign * line.igst);
      target.cgst = round2(target.cgst + sign * line.cgst);
      target.sgst = round2(target.sgst + sign * line.sgst);
    };
    const outwardTaxable = heads();
    const zeroRated = heads();
    const nilExempt = heads();
    for (const doc of docs) {
      const sign = doc.kind === "CREDIT_NOTE" ? -1 : 1;
      for (const line of doc.lines) {
        if (doc.supplyType.startsWith("EXP") || doc.supplyType.startsWith("SEZ")) add(zeroRated, line, sign);
        else if (!line.taxRate) add(nilExempt, line, sign);
        else add(outwardTaxable, line, sign);
      }
    }
    const [bills, debitNotes, twoBCount] = await Promise.all([
      this.prisma.vendorBill.findMany({ where: { source: null, status: { not: "CANCELLED" }, OR: [{ billDate: { gte: range.start, lte: range.end } }, { billDate: null, createdAt: { gte: range.start, lte: range.end } }] }, include: { vendor: { select: { gstin: true } } } }),
      this.prisma.debitNote.findMany({ where: { status: { not: "CANCELLED" }, date: { gte: range.start, lte: range.end } } }),
      this.prisma.gstr2bEntry.count({ where: { period } }),
    ]);
    const basis = query.basis === "books" || !twoBCount ? "books" : "2b";
    const rcmInward = heads();
    const itcOther = heads();
    const itcRcm = heads();
    const itcHeld = heads();
    for (const bill of bills) {
      const taxes = this.billTaxes(bill);
      const line = { amount: num(bill.subtotal ?? num(bill.total) - num(bill.tax)), ...taxes };
      if (bill.reverseCharge) {
        add(rcmInward, line, 1);
        if (bill.itcEligible) add(itcRcm, line, 1);
        continue;
      }
      if (!bill.itcEligible) continue;
      if (basis === "2b" && !["MATCHED", "PROBABLE"].includes(bill.itcStatus || "")) add(itcHeld, line, 1);
      else add(itcOther, line, 1);
    }
    const reversal = heads();
    for (const note of debitNotes) add(reversal, { amount: num(note.subtotal), igst: num(note.igst), cgst: num(note.cgst), sgst: num(note.sgst) }, 1);
    const itcNet = { igst: round2(itcOther.igst + itcRcm.igst - reversal.igst), cgst: round2(itcOther.cgst + itcRcm.cgst - reversal.cgst), sgst: round2(itcOther.sgst + itcRcm.sgst - reversal.sgst) };
    const liability = { igst: round2(outwardTaxable.igst + zeroRated.igst), cgst: outwardTaxable.cgst, sgst: outwardTaxable.sgst };
    const setOff = setOffItc(liability, { igst: Math.max(itcNet.igst, 0), cgst: Math.max(itcNet.cgst, 0), sgst: Math.max(itcNet.sgst, 0) });
    const cash = { igst: round2(setOff.cash.igst + rcmInward.igst), cgst: round2(setOff.cash.cgst + rcmInward.cgst), sgst: round2(setOff.cash.sgst + rcmInward.sgst) };
    const filing = await this.prisma.gstFiling.findUnique({ where: { period_returnType: { period, returnType: "GSTR3B" } } });
    return {
      period,
      basis,
      table31: { a: outwardTaxable, b: zeroRated, c: nilExempt, d: rcmInward },
      table4: { importedAndOther: itcOther, reverseCharge: itcRcm, reversed: reversal, net: itcNet, heldPending2b: itcHeld },
      liability,
      setOff,
      cashPayable: { ...cash, total: round2(cash.igst + cash.cgst + cash.sgst) },
      filing,
    };
  }

  /** Stored IGST/CGST/SGST, or the split implied by the vendor's GSTIN for bills entered with a single tax figure. */
  private billTaxes(bill: { igst: unknown; cgst: unknown; sgst: unknown; tax: unknown; vendor: { gstin: string | null } }) {
    const igst = num(bill.igst);
    const cgst = num(bill.cgst);
    const sgst = num(bill.sgst);
    if (igst + cgst + sgst > 0) return { igst, cgst, sgst };
    const tax = num(bill.tax);
    if (!tax) return { igst: 0, cgst: 0, sgst: 0 };
    if (!this.ledger.intraState(bill.vendor.gstin)) return { igst: tax, cgst: 0, sgst: 0 };
    const half = round2(tax / 2);
    return { igst: 0, cgst: half, sgst: round2(tax - half) };
  }

  @Get("gst/filings")
  @RequirePermissions("accounting.view")
  filings() {
    return this.prisma.gstFiling.findMany({ orderBy: [{ period: "desc" }, { returnType: "asc" }], take: 48 });
  }

  /** Records a return as filed and, by default, locks the books up to the end of that month. */
  @Post("gst/filings")
  @RequirePermissions("accounting.approve")
  async markFiled(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(gstFilingSchema, body);
    const range = monthRange(input.period)!;
    const summary = input.returnType === "GSTR1" ? (await this.gstr1({ period: input.period }, req)).sections : (await this.gstr3b({ period: input.period }, req)).cashPayable;
    const row = await this.prisma.gstFiling.upsert({
      where: { period_returnType: { period: input.period, returnType: input.returnType } },
      update: { arn: input.arn, filedOn: input.filedOn ? new Date(input.filedOn) : new Date(), summary: summary as Prisma.InputJsonValue, createdById: req.user.id },
      create: { period: input.period, returnType: input.returnType, arn: input.arn, filedOn: input.filedOn ? new Date(input.filedOn) : new Date(), summary: summary as Prisma.InputJsonValue, createdById: req.user.id },
    });
    if (input.lockBooks) {
      const locked = await this.ledger.lockedUntil();
      if (!locked || locked < range.end) await this.prisma.periodLock.create({ data: { lockedUntil: range.end, reason: `${input.returnType} filed for ${input.period}${input.arn ? ` (ARN ${input.arn})` : ""}`, createdById: req.user.id } });
    }
    await this.log(req, "file", "gst_return", row.id, undefined, { period: input.period, returnType: input.returnType, arn: input.arn });
    return row;
  }

  // ---------- GSTR-2B ----------

  /** GSTR-2B JSON as downloaded from the portal (Returns → GSTR-2B → Download JSON). */
  @Post("gst/gstr2b/import")
  @RequirePermissions("accounting.edit")
  @UseInterceptors(FileInterceptor("file", uploadLimits(20 * MB)))
  async import2b(@UploadedFile() file: Upload, @Req() req: ReqUser) {
    if (!file?.buffer?.length) throw new BadRequestException("Choose the GSTR-2B JSON file");
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(file.buffer.toString("utf8"));
    } catch {
      throw new BadRequestException("That is not a GSTR-2B JSON file");
    }
    const data = parsed.data || parsed;
    const rtnprd = String(data.rtnprd || "");
    if (!/^\d{6}$/.test(rtnprd)) throw new BadRequestException("The file has no return period (rtnprd)");
    const period = `${rtnprd.slice(2)}-${rtnprd.slice(0, 2)}`;
    if (env.GSTIN && data.gstin && String(data.gstin).toUpperCase() !== env.GSTIN.toUpperCase()) throw new BadRequestException(`This 2B is for ${data.gstin}, not ${env.GSTIN}`);
    const docdata = data.docdata || {};
    const parseDate = (value: string) => {
      const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value || ""));
      return match ? new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]))) : new Date(`${value}T00:00:00Z`);
    };
    const rows: Prisma.Gstr2bEntryCreateManyInput[] = [];
    for (const supplier of docdata.b2b || []) {
      for (const inv of supplier.inv || []) {
        rows.push({ period, supplierGstin: String(supplier.ctin).toUpperCase(), supplierName: supplier.trdnm, docType: "INV", invoiceNo: String(inv.inum), invoiceDate: parseDate(inv.dt), invoiceValue: Number(inv.val) || 0, placeOfSupply: inv.pos, reverseCharge: inv.rev === "Y", taxable: Number(inv.txval) || 0, igst: Number(inv.igst) || 0, cgst: Number(inv.cgst) || 0, sgst: Number(inv.sgst) || 0, cess: Number(inv.cess) || 0, itcAvailable: inv.itcavl !== "N", itcReason: inv.rsn || null });
      }
    }
    for (const supplier of docdata.cdnr || []) {
      for (const note of supplier.nt || []) {
        const sign = note.typ === "C" ? -1 : 1;
        rows.push({ period, supplierGstin: String(supplier.ctin).toUpperCase(), supplierName: supplier.trdnm, docType: note.typ === "C" ? "CRN" : "DBN", invoiceNo: String(note.ntnum), invoiceDate: parseDate(note.dt), invoiceValue: sign * (Number(note.val) || 0), placeOfSupply: note.pos, reverseCharge: note.rev === "Y", taxable: sign * (Number(note.txval) || 0), igst: sign * (Number(note.igst) || 0), cgst: sign * (Number(note.cgst) || 0), sgst: sign * (Number(note.sgst) || 0), cess: sign * (Number(note.cess) || 0), itcAvailable: note.itcavl !== "N", itcReason: note.rsn || null });
      }
    }
    if (!rows.length) throw new BadRequestException("No B2B invoices or notes found in the file");
    const created = await this.prisma.gstr2bEntry.createMany({ data: rows, skipDuplicates: true });
    await this.log(req, "import", "gstr2b", period, undefined, { rows: rows.length, created: created.count });
    const reconciled = await this.runReconcile(period);
    return { period, rows: rows.length, created: created.count, ...reconciled };
  }

  @Post("gst/gstr2b/reconcile")
  @RequirePermissions("accounting.edit")
  async reconcile(@Body() body: unknown) {
    const { period } = parseBody(periodQuery, body);
    return this.runReconcile(period);
  }

  /** Matches the month's 2B against purchase bills of the month and the two before it (suppliers file late). */
  private async runReconcile(period: string) {
    const range = monthRange(period)!;
    const windowStart = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth() - 2, 1));
    const [entries, bills] = await Promise.all([
      this.prisma.gstr2bEntry.findMany({ where: { period, docType: "INV" } }),
      this.prisma.vendorBill.findMany({ where: { source: null, status: { not: "CANCELLED" }, reverseCharge: false, OR: [{ billDate: { gte: windowStart, lte: range.end } }, { billDate: null, createdAt: { gte: windowStart, lte: range.end } }] }, include: { vendor: { select: { gstin: true } } } }),
    ]);
    const pinned = new Map(entries.filter((entry) => entry.vendorBillId && entry.action === "ACCEPT").map((entry) => [entry.id, entry.vendorBillId!]));
    const free = entries.filter((entry) => !pinned.has(entry.id));
    const freeBills = bills.filter((bill) => ![...pinned.values()].includes(bill.id));
    const { results, missingIn2b } = reconcile2b(
      free.map((entry) => ({ id: entry.id, supplierGstin: entry.supplierGstin, invoiceNo: entry.invoiceNo, invoiceDate: entry.invoiceDate, taxable: num(entry.taxable), igst: num(entry.igst), cgst: num(entry.cgst), sgst: num(entry.sgst) })),
      freeBills.map((bill) => ({ id: bill.id, gstin: bill.vendor.gstin, invoiceNo: bill.vendorInvoiceNo, date: bill.billDate || bill.createdAt, taxable: num(bill.subtotal ?? num(bill.total) - num(bill.tax)), ...this.billTaxes(bill) })),
    );
    await this.prisma.$transaction(async (tx) => {
      for (const result of results) await tx.gstr2bEntry.update({ where: { id: result.entryId }, data: { matchStatus: result.status, differences: result.differences, vendorBillId: result.billId } });
      for (const [entryId, billId] of pinned) await tx.gstr2bEntry.update({ where: { id: entryId }, data: { matchStatus: "MATCHED", differences: [], vendorBillId: billId } });
      const statusOf = new Map<string, string>();
      for (const result of results) if (result.billId) statusOf.set(result.billId, result.status);
      for (const billId of pinned.values()) statusOf.set(billId, "MATCHED");
      for (const [billId, status] of statusOf) await tx.vendorBill.update({ where: { id: billId }, data: { itcStatus: status } });
      const inMonth = missingIn2b.filter((id) => {
        const bill = bills.find((row) => row.id === id)!;
        const date = bill.billDate || bill.createdAt;
        return date >= range.start && date <= range.end;
      });
      if (inMonth.length) await tx.vendorBill.updateMany({ where: { id: { in: inMonth } }, data: { itcStatus: "MISSING_IN_2B" } });
    });
    const counts: Record<string, number> = {};
    for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
    counts.MATCHED = (counts.MATCHED || 0) + pinned.size;
    return { counts, missingIn2b: missingIn2b.length };
  }

  @Get("gst/gstr2b")
  @RequirePermissions("accounting.view")
  async list2b(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const { period } = parseBody(periodQuery, query);
    const range = monthRange(period)!;
    const [entries, missing] = await Promise.all([
      this.prisma.gstr2bEntry.findMany({ where: { period }, orderBy: [{ matchStatus: "asc" }, { supplierName: "asc" }] }),
      this.prisma.vendorBill.findMany({ where: { itcStatus: "MISSING_IN_2B", OR: [{ billDate: { gte: range.start, lte: range.end } }, { billDate: null, createdAt: { gte: range.start, lte: range.end } }] }, include: { vendor: { select: { name: true, gstin: true, email: true } } } }),
    ]);
    const billIds = entries.map((entry) => entry.vendorBillId).filter((id): id is string => Boolean(id));
    const bills = await this.prisma.vendorBill.findMany({ where: { id: { in: billIds } }, select: { id: true, number: true, vendorInvoiceNo: true } });
    const byId = new Map(bills.map((bill) => [bill.id, bill]));
    const totals = entries.reduce(
      (acc, entry) => {
        const tax = num(entry.igst) + num(entry.cgst) + num(entry.sgst);
        acc.tax = round2(acc.tax + tax);
        if (entry.matchStatus === "MATCHED" || entry.action === "ACCEPT") acc.claimable = round2(acc.claimable + tax);
        else acc.atRisk = round2(acc.atRisk + tax);
        return acc;
      },
      { tax: 0, claimable: 0, atRisk: 0 },
    );
    return {
      period,
      totals,
      entries: entries.map((entry) => ({ ...entry, taxable: num(entry.taxable), igst: num(entry.igst), cgst: num(entry.cgst), sgst: num(entry.sgst), invoiceValue: num(entry.invoiceValue), bill: entry.vendorBillId ? byId.get(entry.vendorBillId) || null : null })),
      missingIn2b: missing.map((bill) => ({ id: bill.id, number: bill.number, vendorInvoiceNo: bill.vendorInvoiceNo, vendor: bill.vendor.name, gstin: bill.vendor.gstin, email: bill.vendor.email, total: num(bill.total), tax: num(bill.tax), billDate: bill.billDate || bill.createdAt })),
    };
  }

  @Patch("gst/gstr2b/:id")
  @RequirePermissions("accounting.edit")
  async update2b(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(twoBActionSchema, body);
    const entry = await this.prisma.gstr2bEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("2B entry not found");
    if (input.billId) {
      const bill = await this.prisma.vendorBill.findUnique({ where: { id: input.billId }, include: { vendor: { select: { gstin: true } } } });
      if (!bill) throw new BadRequestException("Bill not found");
      if (bill.vendor.gstin && bill.vendor.gstin.toUpperCase() !== entry.supplierGstin) throw new BadRequestException("That bill is from a different GSTIN");
    }
    const row = await this.prisma.gstr2bEntry.update({ where: { id }, data: { action: input.action, notes: input.notes, vendorBillId: input.billId === undefined ? undefined : input.billId, matchStatus: input.billId ? "MATCHED" : input.billId === null ? "MISSING_IN_BOOKS" : undefined } });
    if (input.billId) await this.prisma.vendorBill.update({ where: { id: input.billId }, data: { itcStatus: "MATCHED" } });
    await this.log(req, "update", "gstr2b_entry", id, { action: entry.action, billId: entry.vendorBillId }, { action: row.action, billId: row.vendorBillId });
    return row;
  }

  // ---------- TDS ----------

  @Get("gst/tds/suggest")
  @RequirePermissions("payments.view")
  async suggestTds(@Query() query: Record<string, unknown>) {
    const vendorId = String(query.vendorId || "");
    const amount = Number(query.amount) || 0;
    const vendor = vendorId ? await this.prisma.vendor.findUnique({ where: { id: vendorId }, select: { pan: true, tdsSection: true, lowerDeductionRate: true, gstin: true, name: true } }) : null;
    if (!vendor?.tdsSection || !TDS_SECTIONS[vendor.tdsSection]) return { section: null, rate: 0, amount: 0 };
    const pan = vendor.pan || (vendor.gstin ? vendor.gstin.slice(2, 12) : null);
    const rate = vendor.lowerDeductionRate !== null ? num(vendor.lowerDeductionRate) : tdsRateFor(vendor.tdsSection, pan);
    const fy = new Date().getUTCMonth() >= 3 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
    const paidThisYear = await this.prisma.payment.aggregate({ where: { vendorId, direction: "OUT", paidAt: { gte: new Date(Date.UTC(fy, 3, 1)) } }, _sum: { amount: true } });
    const rule = TDS_SECTIONS[vendor.tdsSection];
    const aggregate = num(paidThisYear._sum.amount) + amount;
    const applies = (rule.single !== undefined && amount > rule.single) || (rule.annual !== undefined && aggregate > rule.annual) || (rule.single === undefined && rule.annual === undefined);
    const base = vendor.tdsSection === "194Q" ? Math.max(0, aggregate - (rule.annual || 0)) - Math.max(0, aggregate - amount - (rule.annual || 0)) : amount;
    return { section: vendor.tdsSection, label: rule.label, rate, pan, applies, amount: applies ? round2((base * rate) / 100) : 0, paidThisYear: num(paidThisYear._sum.amount) };
  }

  private async tdsRows(quarter: string) {
    const range = quarterRange(quarter);
    if (!range) throw new BadRequestException("Use YYYY-Q1..Q4");
    const payments = await this.prisma.payment.findMany({ where: { direction: "OUT", tdsAmount: { gt: 0 }, paidAt: { gte: range.start, lte: range.end } }, include: { vendor: { select: { name: true, pan: true, gstin: true, tdsSection: true } } }, orderBy: { paidAt: "asc" } });
    return payments.map((payment) => {
      const pan = payment.vendor?.pan || (payment.vendor?.gstin ? payment.vendor.gstin.slice(2, 12) : "");
      const amount = num(payment.amount);
      const tds = num(payment.tdsAmount);
      return { paymentId: payment.id, number: payment.number, date: payment.paidAt, vendor: payment.vendor?.name || "", pan: pan || "PANNOTAVBL", section: payment.tdsSection || payment.vendor?.tdsSection || "", amount, tds, rate: amount ? round2((tds / amount) * 100) : 0 };
    });
  }

  @Get("gst/tds")
  @RequirePermissions("accounting.view")
  async tds(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const { quarter } = parseBody(quarterQuery, query);
    const rows = await this.tdsRows(quarter);
    const bySection = new Map<string, { section: string; deductees: Set<string>; amount: number; tds: number }>();
    for (const row of rows) {
      const entry = bySection.get(row.section) || { section: row.section, deductees: new Set<string>(), amount: 0, tds: 0 };
      entry.deductees.add(row.pan);
      entry.amount = round2(entry.amount + row.amount);
      entry.tds = round2(entry.tds + row.tds);
      bySection.set(row.section, entry);
    }
    const payableAccount = await this.ledger.accountFor("TDS_PAYABLE").catch(() => null);
    const balance = payableAccount ? await this.prisma.journalLine.aggregate({ where: { accountId: payableAccount }, _sum: { debit: true, credit: true } }) : null;
    return {
      quarter,
      rows,
      sections: [...bySection.values()].map((entry) => ({ section: entry.section, label: TDS_SECTIONS[entry.section]?.label || entry.section, deductees: entry.deductees.size, amount: entry.amount, tds: entry.tds })),
      missingPan: rows.filter((row) => row.pan === "PANNOTAVBL").length,
      payableBalance: balance ? round2(num(balance._sum.credit) - num(balance._sum.debit)) : null,
    };
  }

  /** Deductee annexure for Form 26Q in the column order the NSDL RPU "Deductee Details" sheet uses. */
  @Get("gst/tds/26q")
  @RequirePermissions("accounting.export")
  async form26q(@Query() query: Record<string, unknown>, @Req() req: ReqUser, @Res() res: Response) {
    assertStaff(req.user);
    const { quarter } = parseBody(quarterQuery, query);
    const rows = await this.tdsRows(quarter);
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const date = (value: Date) => `${String(value.getUTCDate()).padStart(2, "0")}/${String(value.getUTCMonth() + 1).padStart(2, "0")}/${value.getUTCFullYear()}`;
    const header = ["Sr No", "Section Code", "Deductee Code", "PAN of Deductee", "Name of Deductee", "Date of Payment/Credit", "Amount Paid/Credited", "TDS Rate", "TDS Amount", "Date of Deduction", "Reason for non/lower deduction", "Payment Reference"];
    const lines = rows.map((row, index) => [index + 1, row.section.replace(/-.*/, ""), /^[A-Z]{3}C/.test(row.pan) ? "01" : "02", row.pan, row.vendor, date(row.date), row.amount.toFixed(2), row.rate.toFixed(2), row.tds.toFixed(2), date(row.date), row.pan === "PANNOTAVBL" ? "C" : "", row.number].map(escape).join(","));
    await this.log(req, "export", "form26q", quarter, undefined, { rows: rows.length });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition(`26Q-${quarter}.csv`));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send([header.map(escape).join(","), ...lines].join("\n"));
  }
}
