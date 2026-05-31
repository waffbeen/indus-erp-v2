import crypto from "node:crypto";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { eInvoices } from "../db/schema/e_invoices";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { auditLogs } from "../db/schema/audit_logs";
import { NotFound, BadRequest, Conflict } from "../lib/errors";
import { logger } from "../lib/logger";
import { getPo } from "./po.service";
import { resolveTenantGstConfig, type ResolvedGstConfig } from "./tenant-gst-settings.service";
import type { EInvoiceGenerateInput, EInvoiceCancelInput, EInvoiceListItem, EInvoiceView } from "@indus/shared";

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

/* ------------------------------------------------------------------ *
 * IRP / GSP client — the boundary the real HTTP integration plugs in *
 * ------------------------------------------------------------------ */

export interface IrpGenerateResult {
  irn: string;
  ackNo: string;
  ackDate: Date;
  signedQrBase64: string;
  raw: Record<string, unknown>;
}

export interface IrpCancelResult {
  raw: Record<string, unknown>;
}

/** Everything a concrete IRP client must implement. */
export interface IrpClient {
  generateIrn(payload: Record<string, unknown>): Promise<IrpGenerateResult>;
  cancelIrn(irn: string, reason: string, remark: string): Promise<IrpCancelResult>;
}

/** Indian FY label ("2026-27") for a given date — IRN inputs are FY-scoped. */
function financialYear(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0 = Jan
  const start = m >= 3 ? y : y - 1; // FY starts in April (month index 3)
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function digitsFromHash(hex: string, len: number): string {
  // Map hex → decimal digits deterministically for fake ack/ewb numbers.
  let out = "";
  for (const ch of hex) {
    out += (parseInt(ch, 16) % 10).toString();
    if (out.length >= len) break;
  }
  return out.slice(0, len);
}

/**
 * SANDBOX client — validates the payload the same way the IRP would (mandatory
 * SellerDtls.Gstin, at least one item, a doc number) and returns a DETERMINISTIC
 * IRN + signed-QR so the same source always yields the same IRN. No network, no
 * live creds — perfect for demos and tests.
 */
export class SandboxIrpClient implements IrpClient {
  async generateIrn(payload: Record<string, unknown>): Promise<IrpGenerateResult> {
    const seller = (payload.SellerDtls ?? {}) as Record<string, unknown>;
    const doc = (payload.DocDtls ?? {}) as Record<string, unknown>;
    const items = (payload.ItemList ?? []) as unknown[];
    const sellerGstin = String(seller.Gstin ?? "");
    const docNo = String(doc.No ?? "");

    if (!sellerGstin) throw BadRequest("invalid_payload", "Seller GSTIN is required to generate an IRN — set it in GST settings.");
    if (!docNo) throw BadRequest("invalid_payload", "The source document has no number to invoice against.");
    if (!items.length) throw BadRequest("invalid_payload", "The e-invoice has no line items.");

    const fy = String(doc.Dt ? financialYear(parseInvDate(String(doc.Dt))) : financialYear(new Date()));
    const irn = crypto.createHash("sha256").update(`${sellerGstin}|${docNo}|${fy}`).digest("hex"); // 64 hex chars
    const ackNo = digitsFromHash(irn, 10);
    const ackDate = new Date();

    // The signed QR on a real e-invoice is a JWT of these fields; we pack the
    // same canonical set so the FE can render a QR that scans to real data.
    const qrPayload = {
      SellerGstin: sellerGstin,
      BuyerGstin: (payload.BuyerDtls as Record<string, unknown> | undefined)?.Gstin ?? "",
      DocNo: docNo,
      DocTyp: doc.Typ ?? "INV",
      DocDt: doc.Dt ?? "",
      TotInvVal: (payload.ValDtls as Record<string, unknown> | undefined)?.TotInvVal ?? 0,
      ItemCnt: items.length,
      Irn: irn,
      IrnDt: ackDate.toISOString(),
    };
    const signedQrBase64 = Buffer.from(JSON.stringify(qrPayload), "utf8").toString("base64");

    return {
      irn,
      ackNo,
      ackDate,
      signedQrBase64,
      raw: { Success: "Y", AckNo: ackNo, AckDt: ackDate.toISOString(), Irn: irn, SignedQRCode: signedQrBase64, env: "sandbox" },
    };
  }

  async cancelIrn(irn: string, reason: string, remark: string): Promise<IrpCancelResult> {
    return { raw: { Success: "Y", Irn: irn, CnlReason: reason, CnlRem: remark, env: "sandbox" } };
  }
}

/**
 * LIVE client skeleton — structures the real GSP HTTP call without requiring
 * live creds at build time. Wired but intentionally guarded: until the GSP
 * endpoints/auth are finalised it refuses rather than half-calling a gateway.
 * The factory below only ever returns this when a tenant has real credentials.
 */
export class LiveIrpClient implements IrpClient {
  constructor(private readonly cfg: ResolvedGstConfig) {}

  private baseUrl(): string {
    switch (this.cfg.provider) {
      case "masters_india": return "https://api.mastersindia.co/api/v1/einvoice";
      case "cleartax":      return "https://api.clear.in/einv/v2";
      default:              return "https://gsp.example.in/einvoice"; // placeholder
    }
  }

  async generateIrn(payload: Record<string, unknown>): Promise<IrpGenerateResult> {
    // The real call would authenticate (provider-specific session token), POST
    // the payload to `${this.baseUrl()}/irn`, and map the response. We don't
    // have a live gateway here, so fail loudly rather than silently no-op.
    logger.warn({ provider: this.cfg.provider }, "live_irp_generate_not_enabled");
    void payload;
    throw BadRequest(
      "live_gsp_not_enabled",
      "Live GSP e-invoicing isn't enabled in this environment. Use the sandbox provider to simulate generation.",
    );
  }

  async cancelIrn(irn: string, reason: string, remark: string): Promise<IrpCancelResult> {
    void [irn, reason, remark];
    throw BadRequest("live_gsp_not_enabled", "Live GSP cancellation isn't enabled in this environment.");
  }
}

/** Pick the right client for a tenant's resolved GST config. */
export function createIrpClient(cfg: ResolvedGstConfig): IrpClient {
  const live = cfg.source === "tenant" && cfg.provider !== "nic_sandbox" && Boolean(cfg.password);
  return live ? new LiveIrpClient(cfg) : new SandboxIrpClient();
}

/* ------------------------------------------------------------------ *
 * Payload building (GST e-invoice schema v1.1)                        *
 * ------------------------------------------------------------------ */

/** paise (string) → rupees number rounded to 2 dp. */
function paiseToNum(paise: string | number | null | undefined): number {
  const v = typeof paise === "string" ? Number(paise) : paise ?? 0;
  if (!Number.isFinite(v)) return 0;
  return Math.round(v) / 100;
}

/** DD/MM/YYYY for the e-invoice schema. */
function fmtInvDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function parseInvDate(s: string): Date {
  // accepts DD/MM/YYYY or ISO
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** 2-digit state code from a GSTIN, else a fallback. */
function stateCodeOf(gstin: string | null | undefined, fallback = "99"): string {
  if (gstin && gstin.length >= 2 && /^\d{2}/.test(gstin)) return gstin.slice(0, 2);
  return fallback;
}

export interface BuiltEInvoice {
  docNumber: string;
  payload: Record<string, unknown>;
  sellerGstin: string;
}

/**
 * Build the GST e-invoice JSON (schema v1.1) from a source document. Only POs
 * are wired today (reuses po.service.getPo); sales invoices are recognised but
 * not yet sourced here.
 */
export async function buildPayload(
  tenantId: string,
  sourceType: EInvoiceGenerateInput["sourceType"],
  sourceId: string,
): Promise<BuiltEInvoice> {
  if (sourceType !== "po") {
    throw BadRequest(
      "source_not_supported",
      "E-invoicing from sales invoices isn't wired yet — generate from a Purchase Order.",
    );
  }

  const po = await getPo(tenantId, sourceId);

  const [company] = await db.select().from(companies).where(eq(companies.id, po.companyId)).limit(1);
  const [unit] = await db.select().from(units).where(eq(units.id, po.unitId)).limit(1);
  const gstCfg = await resolveTenantGstConfig(tenantId);
  const vendor = po.vendor;

  // Seller = the tenant's own legal entity (the party generating the IRN).
  const sellerGstin = (gstCfg.gstin ?? unit?.gstin ?? company?.gstin ?? "").toUpperCase();
  const buyerGstin = (vendor?.gstin ?? "").toUpperCase();

  const docDate = po.createdAt ? new Date(po.createdAt) : new Date();
  const docNumber = po.poNumber ?? `DRAFT-${po.id.slice(0, 8)}`;

  const itemList = po.items.map((it, idx) => {
    const qty = it.quantityScaled / 1000;
    const igst = paiseToNum(it.igstPaise);
    const cgst = paiseToNum(it.cgstPaise);
    const sgst = paiseToNum(it.sgstPaise);
    return {
      SlNo: String(idx + 1),
      PrdDesc: it.itemName,
      IsServc: "N",
      HsnCd: it.hsnCode ?? "",
      Qty: qty,
      Unit: (it.uom ?? "NOS").toUpperCase(),
      UnitPrice: paiseToNum(it.unitPricePaise),
      TotAmt: paiseToNum(it.subtotalPaise),
      Discount: paiseToNum(it.discountAmountPaise),
      AssAmt: paiseToNum(it.taxableAmountPaise),
      GstRt: it.taxRate,
      IgstAmt: igst,
      CgstAmt: cgst,
      SgstAmt: sgst,
      TotItemVal: paiseToNum(it.totalPaise),
    };
  });

  const payload: Record<string, unknown> = {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
    DocDtls: { Typ: "INV", No: docNumber, Dt: fmtInvDate(docDate) },
    SellerDtls: {
      Gstin: sellerGstin,
      LglNm: company?.legalName ?? company?.name ?? "",
      Addr1: unit?.address ?? company?.address ?? "",
      Loc: unit?.city ?? company?.city ?? "",
      Pin: Number(unit?.pincode ?? company?.pincode ?? 0) || undefined,
      Stcd: stateCodeOf(sellerGstin),
    },
    BuyerDtls: {
      Gstin: buyerGstin || "URP", // URP = unregistered person
      LglNm: vendor?.legalName ?? vendor?.name ?? "",
      Pos: po.placeOfSupply ?? stateCodeOf(buyerGstin),
      Addr1: vendor?.address ?? "",
      Loc: vendor?.city ?? "",
      Pin: Number(vendor?.pincode ?? 0) || undefined,
      Stcd: stateCodeOf(buyerGstin),
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: paiseToNum(po.taxableAmountPaise),
      CgstVal: paiseToNum(po.cgstTotalPaise),
      SgstVal: paiseToNum(po.sgstTotalPaise),
      IgstVal: paiseToNum(po.igstTotalPaise),
      OthChrg: paiseToNum(po.otherChargesPaise) + paiseToNum(po.freightChargesPaise),
      RndOffAmt: paiseToNum(po.roundOffPaise),
      TotInvVal: paiseToNum(po.totalPaise),
    },
  };

  return { docNumber, payload, sellerGstin };
}

/* ------------------------------------------------------------------ *
 * CRUD + lifecycle                                                    *
 * ------------------------------------------------------------------ */

function toListItem(row: typeof eInvoices.$inferSelect): EInvoiceListItem {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    docNumber: row.docNumber,
    irn: row.irn,
    ackNo: row.ackNo,
    ackDate: row.ackDate ? row.ackDate.toISOString() : null,
    status: row.status,
    errorMsg: row.errorMsg,
    createdAt: row.createdAt.toISOString(),
  };
}

function toView(row: typeof eInvoices.$inferSelect): EInvoiceView {
  return {
    ...toListItem(row),
    signedQrBase64: row.signedQrBase64,
    requestJson: row.requestJson ?? null,
    responseJson: row.responseJson ?? null,
    cancelReason: row.cancelReason,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEInvoices(tenantId: string, opts: { status?: string; sourceId?: string } = {}) {
  const conds = [eq(eInvoices.tenantId, tenantId), isNull(eInvoices.deletedAt)];
  if (opts.status) conds.push(eq(eInvoices.status, opts.status as "pending"));
  if (opts.sourceId) conds.push(eq(eInvoices.sourceId, opts.sourceId));
  const rows = await db.select().from(eInvoices).where(and(...conds)).orderBy(desc(eInvoices.createdAt)).limit(200);
  return { items: rows.map(toListItem), total: rows.length };
}

export async function getEInvoice(tenantId: string, id: string): Promise<EInvoiceView> {
  const [row] = await db
    .select()
    .from(eInvoices)
    .where(and(eq(eInvoices.id, id), eq(eInvoices.tenantId, tenantId), isNull(eInvoices.deletedAt)))
    .limit(1);
  if (!row) throw NotFound("e_invoice_not_found", "E-invoice not found");
  return toView(row);
}

/** Preview the e-invoice JSON without persisting — used by the UI before generating. */
export async function previewPayload(tenantId: string, input: EInvoiceGenerateInput) {
  const built = await buildPayload(tenantId, input.sourceType, input.sourceId);
  return { docNumber: built.docNumber, sellerGstin: built.sellerGstin, payload: built.payload };
}

export async function generateEInvoice(input: EInvoiceGenerateInput, ctx: ActorContext): Promise<EInvoiceView> {
  // Block a duplicate IRN for the same source.
  const existing = await db
    .select()
    .from(eInvoices)
    .where(
      and(
        eq(eInvoices.tenantId, ctx.tenantId),
        eq(eInvoices.sourceType, input.sourceType),
        eq(eInvoices.sourceId, input.sourceId),
        eq(eInvoices.status, "generated"),
        isNull(eInvoices.deletedAt),
      ),
    )
    .limit(1);
  if (existing.length) {
    throw Conflict("already_generated", "An IRN already exists for this document. Cancel it before regenerating.", {
      id: existing[0]!.id,
    });
  }

  const built = await buildPayload(ctx.tenantId, input.sourceType, input.sourceId);
  const cfg = await resolveTenantGstConfig(ctx.tenantId);
  const client = createIrpClient(cfg);

  // Persist the attempt first (pending) so a failure is still recorded.
  const [row] = await db
    .insert(eInvoices)
    .values({
      tenantId: ctx.tenantId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      docNumber: built.docNumber,
      status: "pending",
      requestJson: built.payload,
      createdByUserId: ctx.userId,
    })
    .returning();
  if (!row) throw new Error("Failed to create e-invoice record");

  try {
    const result = await client.generateIrn(built.payload);
    await db
      .update(eInvoices)
      .set({
        irn: result.irn,
        ackNo: result.ackNo,
        ackDate: result.ackDate,
        signedQrBase64: result.signedQrBase64,
        status: "generated",
        responseJson: result.raw,
        errorMsg: null,
        updatedAt: new Date(),
      })
      .where(eq(eInvoices.id, row.id));

    await db.insert(auditLogs).values({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "generate",
      resourceType: "e_invoice",
      resourceId: row.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      after: { irn: result.irn, source: input.sourceType, sourceId: input.sourceId } as Record<string, unknown>,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "IRP generation failed";
    await db
      .update(eInvoices)
      .set({ status: "failed", errorMsg: message, updatedAt: new Date() })
      .where(eq(eInvoices.id, row.id));
    logger.warn({ err, eInvoiceId: row.id }, "einvoice_generate_failed");
    // Surface the failure to the caller, but the row is kept for audit.
    throw err;
  }

  return getEInvoice(ctx.tenantId, row.id);
}

export async function cancelEInvoice(id: string, input: EInvoiceCancelInput, ctx: ActorContext): Promise<EInvoiceView> {
  const [row] = await db
    .select()
    .from(eInvoices)
    .where(and(eq(eInvoices.id, id), eq(eInvoices.tenantId, ctx.tenantId), isNull(eInvoices.deletedAt)))
    .limit(1);
  if (!row) throw NotFound("e_invoice_not_found", "E-invoice not found");
  if (row.status !== "generated") throw BadRequest("not_cancellable", "Only a generated e-invoice can be cancelled.");
  if (!row.irn) throw BadRequest("no_irn", "This e-invoice has no IRN to cancel.");

  const cfg = await resolveTenantGstConfig(ctx.tenantId);
  const client = createIrpClient(cfg);
  const result = await client.cancelIrn(row.irn, input.reason, input.remark);

  await db
    .update(eInvoices)
    .set({
      status: "cancelled",
      cancelReason: input.remark,
      cancelledAt: new Date(),
      responseJson: { ...(row.responseJson ?? {}), cancel: result.raw },
      updatedAt: new Date(),
    })
    .where(eq(eInvoices.id, id));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "cancel",
    resourceType: "e_invoice",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { reason: input.reason, remark: input.remark } as Record<string, unknown>,
  });

  return getEInvoice(ctx.tenantId, id);
}

/** Helper for the e-way-bill service: fetch a generated e-invoice by id (tenant-scoped). */
export async function getGeneratedEInvoiceRow(tenantId: string, id: string) {
  const [row] = await db
    .select()
    .from(eInvoices)
    .where(and(eq(eInvoices.id, id), eq(eInvoices.tenantId, tenantId), isNull(eInvoices.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Bulk status lookup keyed by sourceId — lets list screens show "IRN generated" badges. */
export async function eInvoiceStatusBySource(tenantId: string, sourceIds: string[]) {
  if (!sourceIds.length) return new Map<string, string>();
  const rows = await db
    .select({ sourceId: eInvoices.sourceId, status: eInvoices.status })
    .from(eInvoices)
    .where(and(eq(eInvoices.tenantId, tenantId), inArray(eInvoices.sourceId, sourceIds), isNull(eInvoices.deletedAt)));
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.sourceId, r.status);
  return map;
}
