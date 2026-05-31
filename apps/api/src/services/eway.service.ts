import crypto from "node:crypto";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "../db/index";
import { eWayBills } from "../db/schema/e_way_bills";
import { auditLogs } from "../db/schema/audit_logs";
import { NotFound, BadRequest } from "../lib/errors";
import { logger } from "../lib/logger";
import { buildPayload, getGeneratedEInvoiceRow } from "./einvoice.service";
import { resolveTenantGstConfig } from "./tenant-gst-settings.service";
import type { EWayBillGenerateInput, EWayBillCancelInput, EWayBillListItem, EWayBillView } from "@indus/shared";

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

/* ------------------------------------------------------------------ *
 * EWB system client — stub mirrors the e-invoice IrpClient approach   *
 * ------------------------------------------------------------------ */

export interface EwbGenerateResult {
  ewbNo: string;
  validUpto: Date;
  raw: Record<string, unknown>;
}

export interface EwbClient {
  generate(payload: Record<string, unknown>): Promise<EwbGenerateResult>;
  cancel(ewbNo: string, reason: string, remark: string): Promise<{ raw: Record<string, unknown> }>;
}

/** EWB validity: 1 day per 200 km (min 1), counted from generation. */
export function ewbValidity(distanceKm: number, from: Date): Date {
  const days = Math.max(1, Math.ceil((distanceKm || 0) / 200));
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

const TRANS_MODE_CODE: Record<string, string> = { road: "1", rail: "2", air: "3", ship: "4" };

/** Sandbox: deterministic 12-digit EWB number, no network / live creds. */
export class SandboxEwbClient implements EwbClient {
  async generate(payload: Record<string, unknown>): Promise<EwbGenerateResult> {
    const docNo = String((payload.docNo ?? "") || "");
    const fromGstin = String((payload.fromGstin ?? "") || "");
    const vehicle = String((payload.vehicleNo ?? "") || "");
    if (!fromGstin) throw BadRequest("invalid_payload", "Consignor GSTIN is required — set it in GST settings.");
    if (!docNo) throw BadRequest("invalid_payload", "The source document has no number to raise an EWB against.");
    if (!vehicle) throw BadRequest("invalid_payload", "A vehicle number is required for a road EWB.");

    const hex = crypto.createHash("sha256").update(`${fromGstin}|${docNo}|EWB`).digest("hex");
    let ewbNo = "";
    for (const ch of hex) {
      ewbNo += (parseInt(ch, 16) % 10).toString();
      if (ewbNo.length >= 12) break;
    }
    const validUpto = ewbValidity(Number(payload.transDistance ?? 0), new Date());
    return {
      ewbNo,
      validUpto,
      raw: { Success: "Y", ewayBillNo: ewbNo, ewayBillDate: new Date().toISOString(), validUpto: validUpto.toISOString(), env: "sandbox" },
    };
  }

  async cancel(ewbNo: string, reason: string, remark: string) {
    return { raw: { Success: "Y", ewayBillNo: ewbNo, cancelRsnCode: reason, cancelRmrk: remark, env: "sandbox" } };
  }
}

/** Live skeleton — structured but guarded, like LiveIrpClient. */
export class LiveEwbClient implements EwbClient {
  async generate(payload: Record<string, unknown>): Promise<EwbGenerateResult> {
    logger.warn("live_ewb_generate_not_enabled");
    void payload;
    throw BadRequest("live_gsp_not_enabled", "Live GSP e-way-bill generation isn't enabled in this environment. Use the sandbox provider.");
  }
  async cancel(ewbNo: string, reason: string, remark: string): Promise<{ raw: Record<string, unknown> }> {
    void [ewbNo, reason, remark];
    throw BadRequest("live_gsp_not_enabled", "Live GSP e-way-bill cancellation isn't enabled in this environment.");
  }
}

export function createEwbClient(live: boolean): EwbClient {
  return live ? new LiveEwbClient() : new SandboxEwbClient();
}

/* ------------------------------------------------------------------ */

function toListItem(row: typeof eWayBills.$inferSelect): EWayBillListItem {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    eInvoiceId: row.eInvoiceId,
    ewbNo: row.ewbNo,
    transporterName: row.transporterName,
    transMode: row.transMode,
    vehicleNo: row.vehicleNo,
    distanceKm: row.distanceKm,
    validUpto: row.validUpto ? row.validUpto.toISOString() : null,
    status: row.status,
    errorMsg: row.errorMsg,
    createdAt: row.createdAt.toISOString(),
  };
}

function toView(row: typeof eWayBills.$inferSelect): EWayBillView {
  return {
    ...toListItem(row),
    transporterId: row.transporterId,
    requestJson: row.requestJson ?? null,
    responseJson: row.responseJson ?? null,
    cancelReason: row.cancelReason,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEWayBills(tenantId: string, opts: { status?: string; sourceId?: string } = {}) {
  const conds = [eq(eWayBills.tenantId, tenantId), isNull(eWayBills.deletedAt)];
  if (opts.status) conds.push(eq(eWayBills.status, opts.status as "pending"));
  if (opts.sourceId) conds.push(eq(eWayBills.sourceId, opts.sourceId));
  const rows = await db.select().from(eWayBills).where(and(...conds)).orderBy(desc(eWayBills.createdAt)).limit(200);
  return { items: rows.map(toListItem), total: rows.length };
}

export async function getEWayBill(tenantId: string, id: string): Promise<EWayBillView> {
  const [row] = await db
    .select()
    .from(eWayBills)
    .where(and(eq(eWayBills.id, id), eq(eWayBills.tenantId, tenantId), isNull(eWayBills.deletedAt)))
    .limit(1);
  if (!row) throw NotFound("e_way_bill_not_found", "E-way bill not found");
  return toView(row);
}

export async function generateEWayBill(input: EWayBillGenerateInput, ctx: ActorContext): Promise<EWayBillView> {
  // Validate any linked e-invoice belongs to this tenant.
  if (input.eInvoiceId) {
    const ei = await getGeneratedEInvoiceRow(ctx.tenantId, input.eInvoiceId);
    if (!ei) throw NotFound("e_invoice_not_found", "Linked e-invoice not found");
  }

  const built = await buildPayload(ctx.tenantId, input.sourceType, input.sourceId);
  const cfg = await resolveTenantGstConfig(ctx.tenantId);
  const live = cfg.source === "tenant" && cfg.provider !== "nic_sandbox" && Boolean(cfg.password);
  const client = createEwbClient(live);

  const seller = built.payload.SellerDtls as Record<string, unknown>;
  const buyer = built.payload.BuyerDtls as Record<string, unknown>;
  const val = built.payload.ValDtls as Record<string, unknown>;

  const ewbPayload: Record<string, unknown> = {
    supplyType: "O", // Outward
    subSupplyType: "1", // Supply
    docType: "INV",
    docNo: built.docNumber,
    docDate: (built.payload.DocDtls as Record<string, unknown>).Dt,
    fromGstin: seller.Gstin,
    fromPincode: seller.Pin ?? null,
    fromStateCode: seller.Stcd,
    toGstin: buyer.Gstin,
    toPincode: buyer.Pin ?? null,
    toStateCode: buyer.Stcd,
    totInvValue: val.TotInvVal,
    transporterId: input.transporterId ?? null,
    transporterName: input.transporterName ?? null,
    transMode: TRANS_MODE_CODE[input.transMode] ?? "1",
    vehicleNo: input.vehicleNo,
    transDistance: input.distanceKm,
    itemList: built.payload.ItemList,
  };

  const [row] = await db
    .insert(eWayBills)
    .values({
      tenantId: ctx.tenantId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      eInvoiceId: input.eInvoiceId ?? null,
      transporterId: input.transporterId ?? null,
      transporterName: input.transporterName ?? null,
      transMode: input.transMode,
      vehicleNo: input.vehicleNo,
      distanceKm: input.distanceKm,
      status: "pending",
      requestJson: ewbPayload,
      createdByUserId: ctx.userId,
    })
    .returning();
  if (!row) throw new Error("Failed to create e-way bill record");

  try {
    const result = await client.generate(ewbPayload);
    await db
      .update(eWayBills)
      .set({
        ewbNo: result.ewbNo,
        validUpto: result.validUpto,
        status: "generated",
        responseJson: result.raw,
        errorMsg: null,
        updatedAt: new Date(),
      })
      .where(eq(eWayBills.id, row.id));

    await db.insert(auditLogs).values({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "generate",
      resourceType: "e_way_bill",
      resourceId: row.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      after: { ewbNo: result.ewbNo, sourceId: input.sourceId } as Record<string, unknown>,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "EWB generation failed";
    await db.update(eWayBills).set({ status: "failed", errorMsg: message, updatedAt: new Date() }).where(eq(eWayBills.id, row.id));
    logger.warn({ err, eWayBillId: row.id }, "eway_generate_failed");
    throw err;
  }

  return getEWayBill(ctx.tenantId, row.id);
}

export async function cancelEWayBill(id: string, input: EWayBillCancelInput, ctx: ActorContext): Promise<EWayBillView> {
  const [row] = await db
    .select()
    .from(eWayBills)
    .where(and(eq(eWayBills.id, id), eq(eWayBills.tenantId, ctx.tenantId), isNull(eWayBills.deletedAt)))
    .limit(1);
  if (!row) throw NotFound("e_way_bill_not_found", "E-way bill not found");
  if (row.status !== "generated") throw BadRequest("not_cancellable", "Only a generated e-way bill can be cancelled.");
  if (!row.ewbNo) throw BadRequest("no_ewb", "This e-way bill has no number to cancel.");

  const cfg = await resolveTenantGstConfig(ctx.tenantId);
  const live = cfg.source === "tenant" && cfg.provider !== "nic_sandbox" && Boolean(cfg.password);
  const client = createEwbClient(live);
  const result = await client.cancel(row.ewbNo, input.reason, input.remark);

  await db
    .update(eWayBills)
    .set({
      status: "cancelled",
      cancelReason: input.remark,
      cancelledAt: new Date(),
      responseJson: { ...(row.responseJson ?? {}), cancel: result.raw },
      updatedAt: new Date(),
    })
    .where(eq(eWayBills.id, id));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "cancel",
    resourceType: "e_way_bill",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { reason: input.reason, remark: input.remark } as Record<string, unknown>,
  });

  return getEWayBill(ctx.tenantId, id);
}
