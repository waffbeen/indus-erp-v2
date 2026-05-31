import { resolveAiConfig, aiComplete, AiNotConfiguredError } from "./ai.service";
import { logger } from "../lib/logger";
import type { OcrInvoiceRequest, OcrInvoiceResult, OcrLineItem } from "@indus/shared";

/**
 * Document AI — vendor-invoice OCR. Runs the tenant's vision-capable model over
 * an uploaded bill and returns structured fields to PREFILL the vendor-invoice
 * form. Nothing is persisted here; the buyer reviews and saves the invoice.
 *
 * Vision support varies by provider: Gemini handles images + PDF; OpenAI handles
 * images; Anthropic handles images (PNG/JPEG/GIF/WEBP). When the chosen provider
 * can't read the supplied type we return a graceful, explanatory message rather
 * than throwing.
 */

const OCR_SYSTEM = `You are an invoice data-extraction engine for an Indian procurement system.
Read the attached vendor invoice (image or PDF) and extract its fields.
Return ONLY valid JSON with EXACTLY this shape (use null when a value is not present):
{
  "vendorName": string | null,
  "invoiceNumber": string | null,
  "invoiceDate": string | null,          // ISO date "YYYY-MM-DD"
  "lineItems": [
    { "description": string, "hsnCode": string | null, "quantity": number | null, "unitPrice": number | null, "amount": number | null }
  ],
  "subtotal": number | null,
  "tax": number | null,                   // total GST (CGST+SGST+IGST)
  "total": number | null
}
Rules: numbers must be plain numbers — no currency symbols, no thousands separators. Money is in Indian Rupees. Do not fabricate values you cannot see.`;

function notConfigured(): OcrInvoiceResult {
  return {
    configured: false,
    extracted: false,
    vendorName: null,
    invoiceNumber: null,
    invoiceDate: null,
    lineItems: [],
    subtotal: null,
    tax: null,
    total: null,
    provider: null,
    message:
      "AI isn't configured for this workspace. An admin can add an API key under Settings → AI Assistant to enable invoice scanning.",
  };
}

function emptyResult(provider: string | null, message: string): OcrInvoiceResult {
  return {
    configured: true,
    extracted: false,
    vendorName: null,
    invoiceNumber: null,
    invoiceDate: null,
    lineItems: [],
    subtotal: null,
    tax: null,
    total: null,
    provider,
    message,
  };
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[₹,\s]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/** Best-effort normalise a model-returned date to YYYY-MM-DD. */
function toIsoDate(v: unknown): string | null {
  const s = toStr(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function normalizeLine(raw: unknown): OcrLineItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const description = toStr(r.description) ?? toStr(r.itemName) ?? toStr(r.name);
  if (!description) return null;
  return {
    description,
    hsnCode: toStr(r.hsnCode) ?? toStr(r.hsn),
    quantity: toNum(r.quantity ?? r.qty),
    unitPrice: toNum(r.unitPrice ?? r.rate ?? r.price),
    amount: toNum(r.amount ?? r.total ?? r.lineTotal),
  };
}

export async function extractInvoice(req: OcrInvoiceRequest & { tenantId: string }): Promise<OcrInvoiceResult> {
  const cfg = await resolveAiConfig(req.tenantId);
  if (!cfg) return notConfigured();

  // Providers that can't read PDFs (only Gemini can in our setup).
  const mimeType = req.mimeType === "image/jpg" ? "image/jpeg" : req.mimeType;
  if (mimeType === "application/pdf" && cfg.provider !== "gemini") {
    return emptyResult(
      cfg.provider,
      `PDF scanning needs the Gemini provider (currently ${cfg.provider}). Upload a PNG/JPG image of the invoice, or switch provider under Settings → AI Assistant.`,
    );
  }

  try {
    const result = await aiComplete({
      tenantId: req.tenantId,
      system: OCR_SYSTEM,
      messages: [
        {
          role: "user",
          content: "Extract the invoice fields from the attached document and return the JSON object.",
        },
      ],
      images: [{ base64: req.fileBase64, mimeType }],
      json: true,
      maxTokens: 2500,
    });

    const data = (result.json ?? {}) as Record<string, unknown>;
    const lineItems = Array.isArray(data.lineItems)
      ? data.lineItems.map(normalizeLine).filter((l): l is OcrLineItem => l !== null)
      : [];
    const invoiceNumber = toStr(data.invoiceNumber);
    const extracted = Boolean(invoiceNumber) || lineItems.length > 0;

    return {
      configured: true,
      extracted,
      vendorName: toStr(data.vendorName),
      invoiceNumber,
      invoiceDate: toIsoDate(data.invoiceDate),
      lineItems,
      subtotal: toNum(data.subtotal),
      tax: toNum(data.tax),
      total: toNum(data.total),
      provider: result.provider,
      message: extracted
        ? null
        : "Couldn't read the invoice clearly. Try a sharper, well-lit image or enter the details manually.",
    };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return notConfigured();
    logger.warn({ err, tenantId: req.tenantId }, "ocr_extract_failed");
    return emptyResult(
      cfg.provider,
      "The AI service couldn't process this file just now. Check the API key under Settings → AI Assistant, or try again.",
    );
  }
}
