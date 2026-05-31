import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "../db/index";
import { gstinVerifications } from "../db/schema/gstin_verifications";
import { vendors } from "../db/schema/vendors";
import { companies } from "../db/schema/companies";
import { GSTIN_REGEX } from "@indus/shared";
import type { GstinView } from "@indus/shared";

/** GST state codes → readable names (used to decode the first 2 digits of a GSTIN). */
const STATE_NAMES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "25": "Daman & Diu", "26": "Dadra & Nagar Haveli", "27": "Maharashtra", "28": "Andhra Pradesh (Old)",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh",
  "38": "Ladakh", "97": "Other Territory", "99": "Centre Jurisdiction",
};

/** Pure regex check — exported so other services can validate a GSTIN cheaply. */
export function validateFormat(gstin: string): boolean {
  return GSTIN_REGEX.test((gstin ?? "").trim().toUpperCase());
}

/* ------------------------------------------------------------------ *
 * Lookup client — the boundary a real govt/GSP taxpayer API plugs in *
 * ------------------------------------------------------------------ */

export interface GstinLookupResult {
  legalName: string | null;
  tradeName: string | null;
  status: string; // "Active" | "Cancelled" | "format_valid" | "invalid"
  raw: Record<string, unknown>;
}

export interface GstinLookupClient {
  lookup(gstin: string): Promise<GstinLookupResult>;
}

/**
 * Sandbox lookup — does the format check and returns a "format_valid" verdict
 * with no portal name (the service then enriches from the tenant's own masters
 * if the GSTIN is already on a vendor/company). A real client would call the
 * public GST taxpayer API and fill legalName/tradeName/status from it.
 */
export class SandboxGstinClient implements GstinLookupClient {
  async lookup(gstin: string): Promise<GstinLookupResult> {
    const ok = validateFormat(gstin);
    return {
      legalName: null,
      tradeName: null,
      status: ok ? "format_valid" : "invalid",
      raw: { gstin, formatValid: ok, env: "sandbox", checkedVia: "regex" },
    };
  }
}

export function createGstinClient(): GstinLookupClient {
  return new SandboxGstinClient();
}

function buildView(
  gstin: string,
  formatValid: boolean,
  legalName: string | null,
  tradeName: string | null,
  status: string | null,
  lastCheckedAt: string | null,
): GstinView {
  const stateCode = formatValid ? gstin.slice(0, 2) : null;
  return {
    gstin,
    formatValid,
    legalName,
    tradeName,
    status,
    stateCode,
    stateName: stateCode ? STATE_NAMES[stateCode] ?? "Unknown" : null,
    pan: formatValid ? gstin.slice(2, 12) : null,
    lastCheckedAt,
  };
}

/**
 * Verify a GSTIN: format-check, look it up (stub), enrich with any matching
 * vendor/company name from this tenant's masters, and cache the result.
 */
export async function verify(tenantId: string, rawGstin: string): Promise<GstinView> {
  const gstin = (rawGstin ?? "").trim().toUpperCase();
  const formatValid = validateFormat(gstin);

  if (!formatValid) {
    // Don't cache obviously-invalid input; just report it.
    return buildView(gstin, false, null, null, "invalid", null);
  }

  const client = createGstinClient();
  const lookup = await client.lookup(gstin);

  // Enrich from our own masters — if we already trade with this GSTIN, surface
  // the known name and treat it as active.
  let legalName = lookup.legalName;
  let tradeName = lookup.tradeName;
  let status = lookup.status;

  const [vendorMatch] = await db
    .select({ name: vendors.name, legalName: vendors.legalName })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), eq(vendors.gstin, gstin), isNull(vendors.deletedAt)))
    .limit(1);
  if (vendorMatch) {
    legalName = vendorMatch.legalName ?? vendorMatch.name;
    tradeName = tradeName ?? vendorMatch.name;
    status = "Active";
  } else {
    const [companyMatch] = await db
      .select({ name: companies.name, legalName: companies.legalName })
      .from(companies)
      .where(and(eq(companies.tenantId, tenantId), eq(companies.gstin, gstin), isNull(companies.deletedAt)))
      .limit(1);
    if (companyMatch) {
      legalName = companyMatch.legalName ?? companyMatch.name;
      tradeName = tradeName ?? companyMatch.name;
      status = "Active";
    }
  }

  const now = new Date();
  const responseJson: Record<string, unknown> = { ...lookup.raw, enrichedLegalName: legalName, enrichedTradeName: tradeName };

  // Upsert the cache (no unique constraint, so find-then-write).
  const [existing] = await db
    .select({ id: gstinVerifications.id })
    .from(gstinVerifications)
    .where(and(eq(gstinVerifications.tenantId, tenantId), eq(gstinVerifications.gstin, gstin), isNull(gstinVerifications.deletedAt)))
    .limit(1);

  if (existing) {
    await db
      .update(gstinVerifications)
      .set({ legalName, tradeName, status, lastCheckedAt: now, responseJson, updatedAt: now })
      .where(eq(gstinVerifications.id, existing.id));
  } else {
    await db.insert(gstinVerifications).values({
      tenantId,
      gstin,
      legalName,
      tradeName,
      status,
      lastCheckedAt: now,
      responseJson,
    });
  }

  return buildView(gstin, true, legalName, tradeName, status, now.toISOString());
}

/** List cached verifications for a tenant (most recent first). */
export async function listVerifications(tenantId: string) {
  const rows = await db
    .select()
    .from(gstinVerifications)
    .where(and(eq(gstinVerifications.tenantId, tenantId), isNull(gstinVerifications.deletedAt)))
    .orderBy(desc(gstinVerifications.lastCheckedAt))
    .limit(100);
  return {
    items: rows.map((r) =>
      buildView(
        r.gstin,
        validateFormat(r.gstin),
        r.legalName,
        r.tradeName,
        r.status,
        r.lastCheckedAt ? r.lastCheckedAt.toISOString() : null,
      ),
    ),
    total: rows.length,
  };
}
