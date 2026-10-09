import { BadRequestException, BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { createHash, randomInt } from "crypto";
import { ewbValidity } from "@fixotec/shared";
import { env } from "./env";

export type IrnResult = { irn: string; ackNo: string; ackDate: Date; signedQr: string };
export type EwbResult = { ewbNo: string; ewbDate: Date; validUntil: Date | null };

const b64url = (value: string) => Buffer.from(value).toString("base64url");

/**
 * GST Suvidha Provider bridge for e-invoice (IRP) and e-way bill (NIC) calls.
 * SANDBOX produces realistic but unregistered IRNs for demos and tests. GENERIC talks to a GSP that exposes
 * NIC-shaped JSON behind token auth (ClearTax, Masters India, IRIS and others differ only in paths and the auth call;
 * adjust `paths` when onboarding a provider).
 */
@Injectable()
export class GspClient {
  private readonly logger = new Logger(GspClient.name);
  private token?: { value: string; expiresAt: number };
  private readonly paths = {
    auth: "/auth",
    irn: "/einvoice/irn",
    irnCancel: "/einvoice/irn/cancel",
    ewb: "/ewaybill",
    ewbVehicle: "/ewaybill/vehicle",
    ewbExtend: "/ewaybill/extend",
    ewbCancel: "/ewaybill/cancel",
  };

  get provider() {
    return env.GSP_PROVIDER;
  }

  get configured() {
    if (this.provider === "SANDBOX") return true;
    return this.provider === "GENERIC" && Boolean(env.GSP_BASE_URL && env.GSP_CLIENT_ID && env.GSP_CLIENT_SECRET && env.GSP_USERNAME && env.GSP_PASSWORD && env.GSTIN);
  }

  private assertConfigured() {
    if (!this.configured) throw new BadRequestException("e-invoice and e-way bill are not configured. Set GSP_PROVIDER (SANDBOX for testing) and the GSP credentials.");
  }

  async generateIrn(payload: Record<string, any>): Promise<IrnResult> {
    this.assertConfigured();
    if (this.provider === "SANDBOX") {
      const doc = payload.DocDtls;
      const irn = createHash("sha256").update(`${payload.SellerDtls.Gstin}${doc.Dt.slice(-4)}${doc.Typ}${doc.No}`).digest("hex");
      const ackDate = new Date();
      const ackNo = `11${String(Date.now()).slice(-8)}${randomInt(10000, 99999)}`;
      const qrData = {
        SellerGstin: payload.SellerDtls.Gstin,
        BuyerGstin: payload.BuyerDtls.Gstin,
        DocNo: doc.No,
        DocTyp: doc.Typ,
        DocDt: doc.Dt,
        TotInvVal: payload.ValDtls.TotInvVal,
        ItemCnt: payload.ItemList.length,
        MainHsnCode: payload.ItemList[0]?.HsnCd,
        Irn: irn,
        IrnDt: ackDate.toISOString().replace("T", " ").slice(0, 19),
      };
      const signedQr = `${b64url(JSON.stringify({ alg: "none", typ: "JWT", sandbox: true }))}.${b64url(JSON.stringify({ data: JSON.stringify(qrData), iss: "SANDBOX" }))}.sandbox`;
      return { irn, ackNo, ackDate, signedQr };
    }
    const data = await this.call(this.paths.irn, payload);
    const irn = data.Irn || data.irn;
    if (!irn) throw new BadGatewayException("The GSP did not return an IRN");
    return { irn, ackNo: String(data.AckNo || data.ackNo || ""), ackDate: new Date(data.AckDt || data.ackDate || Date.now()), signedQr: data.SignedQRCode || data.signedQRCode || data.signedQr || "" };
  }

  async cancelIrn(irn: string, reason: string, remark: string) {
    this.assertConfigured();
    if (this.provider === "SANDBOX") return { cancelDate: new Date() };
    const data = await this.call(this.paths.irnCancel, { Irn: irn, CnlRsn: reason, CnlRem: remark });
    return { cancelDate: new Date(data.CancelDate || data.cancelDate || Date.now()) };
  }

  async generateEwb(payload: Record<string, any>): Promise<EwbResult> {
    this.assertConfigured();
    if (this.provider === "SANDBOX") {
      const ewbDate = new Date();
      return { ewbNo: `${randomInt(1, 10)}${String(randomInt(0, 1e9)).padStart(9, "0")}${randomInt(10, 99)}`, ewbDate, validUntil: payload.vehicleNo ? ewbValidity(ewbDate, Number(payload.transDistance) || 1) : null };
    }
    const data = await this.call(this.paths.ewb, payload);
    const ewbNo = data.ewayBillNo || data.EwbNo || data.ewbNo;
    if (!ewbNo) throw new BadGatewayException("The GSP did not return an e-way bill number");
    const valid = data.validUpto || data.EwbValidTill || data.validUntil;
    return { ewbNo: String(ewbNo), ewbDate: new Date(data.ewayBillDate || data.EwbDt || Date.now()), validUntil: valid ? new Date(valid) : null };
  }

  async updatePartB(payload: Record<string, any>, distanceKm: number) {
    this.assertConfigured();
    if (this.provider === "SANDBOX") return { validUntil: ewbValidity(new Date(), distanceKm || 1) };
    const data = await this.call(this.paths.ewbVehicle, payload);
    const valid = data.validUpto || data.EwbValidTill;
    return { validUntil: valid ? new Date(valid) : ewbValidity(new Date(), distanceKm || 1) };
  }

  async extendEwb(payload: Record<string, any>) {
    this.assertConfigured();
    if (this.provider === "SANDBOX") return { validUntil: ewbValidity(new Date(), Number(payload.remainingDistance) || 1) };
    const data = await this.call(this.paths.ewbExtend, payload);
    return { validUntil: new Date(data.validUpto || data.EwbValidTill || Date.now()) };
  }

  async cancelEwb(ewbNo: string, reason: string, remark: string) {
    this.assertConfigured();
    if (this.provider === "SANDBOX") return { cancelDate: new Date() };
    const data = await this.call(this.paths.ewbCancel, { ewbNo: Number(ewbNo), cancelRsnCode: Number(reason), cancelRmrk: remark });
    return { cancelDate: new Date(data.cancelDate || Date.now()) };
  }

  private async auth() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const response = await fetch(`${env.GSP_BASE_URL}${this.paths.auth}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: env.GSP_CLIENT_ID, client_secret: env.GSP_CLIENT_SECRET, username: env.GSP_USERNAME, password: env.GSP_PASSWORD, gstin: env.GSTIN }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, any>;
    const value = body.token || body.access_token || body.AuthToken || body.data?.AuthToken;
    if (!response.ok || !value) throw new BadGatewayException(`GSP sign-in failed (${response.status})`);
    const seconds = Number(body.expires_in || body.expiresIn || 3600);
    this.token = { value, expiresAt: Date.now() + seconds * 1000 };
    return value as string;
  }

  private async call(path: string, payload: unknown): Promise<Record<string, any>> {
    const token = await this.auth();
    const response = await fetch(`${env.GSP_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, gstin: env.GSTIN || "" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let body: Record<string, any> = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text.slice(0, 300) };
    }
    const data = (body.data || body.Data || body.result || body) as Record<string, any>;
    const failed = !response.ok || body.Status === 0 || body.status === "0" || body.success === false;
    if (failed) {
      const errors = body.ErrorDetails || body.errors || body.error || body.message || `HTTP ${response.status}`;
      const message = Array.isArray(errors) ? errors.map((item: Record<string, unknown>) => `${item.ErrorCode || item.code || ""} ${item.ErrorMessage || item.message || ""}`.trim()).join("; ") : String(typeof errors === "object" ? JSON.stringify(errors) : errors);
      this.logger.warn(`GSP ${path} failed: ${message}`);
      throw new BadRequestException(`GSP: ${message.slice(0, 400)}`);
    }
    return data;
  }
}
