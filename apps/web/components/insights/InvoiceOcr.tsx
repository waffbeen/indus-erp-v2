"use client";
import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Icon } from "@/components/Icon";
import type { OcrInvoiceResult } from "@indus/shared";

const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const MAX_PICK_BYTES = 15 * 1024 * 1024; // generous: images get compressed below
const MAX_PDF_BYTES = 1.4 * 1024 * 1024; // PDFs can't be compressed client-side
const MAX_IMAGE_DIM = 1600; // downscale longest edge to keep uploads small + crisp

function fmtMoney(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)}`;
}

function stripDataPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** Read a File into raw base64 (sans data: prefix). */
function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(stripDataPrefix(String(reader.result ?? "")));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale an image to a JPEG that fits the API's 2 MB body limit. Phone
 * photos are often several MB; we cap the longest edge and re-encode so the
 * upload stays small while staying legible for OCR.
 */
async function downscaleImage(file: File): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode failed"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Canvas unavailable — fall back to the original bytes.
    return { base64: stripDataPrefix(dataUrl), mimeType: file.type };
  }
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.82);
  return { base64: stripDataPrefix(out), mimeType: "image/jpeg" };
}

export function InvoiceOcr() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrInvoiceResult | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    if (file.size > MAX_PICK_BYTES) {
      setError("File is too large (max ~15 MB).");
      return;
    }
    const isPdf = file.type === "application/pdf";
    if (isPdf && file.size > MAX_PDF_BYTES) {
      setError("PDF is too large to scan (max ~1.4 MB). Upload a photo/screenshot of the invoice instead.");
      return;
    }
    setFileName(file.name);
    setBusy(true);
    try {
      const { base64, mimeType } = isPdf
        ? { base64: await toBase64(file), mimeType: "application/pdf" }
        : await downscaleImage(file);
      const res = await api<OcrInvoiceResult>("/api/copilot/ocr-invoice", {
        method: "POST",
        body: JSON.stringify({ fileBase64: base64, mimeType }),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't scan that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />

      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="h-9 w-9 rounded-lg grid place-items-center shrink-0" style={{ background: "var(--tint-lilac)", color: "var(--tint-lilac-fg)" }}>
          <Icon name="ScanLine" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold tracking-tight">Scan a vendor invoice</h3>
          <p className="text-[11.5px] text-muted mt-0.5">
            Upload a photo or PDF of a supplier bill — AI reads the vendor, number, date and line items
            so you can prefill a vendor invoice. Nothing is saved automatically.
          </p>
        </div>
        <button className="btn btn-primary btn-sm shrink-0" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Icon name="Upload" size={13} /> {busy ? "Reading…" : fileName ? "Choose another" : "Choose file"}
        </button>
      </div>

      {fileName && <p className="text-[11.5px] text-muted px-0.5">Selected: {fileName}</p>}

      {error && (
        <div className="rounded p-2.5 text-xs flex items-start gap-2" style={{ background: "var(--warning-bg)", color: "var(--warning-fg)" }}>
          <Icon name="TriangleAlert" size={14} />
          <span>{error}</span>
        </div>
      )}

      {result && !result.configured && (
        <div className="rounded p-2.5 text-xs flex items-start gap-2" style={{ background: "var(--warning-bg)", color: "var(--warning-fg)" }}>
          <Icon name="TriangleAlert" size={14} />
          <span>{result.message}</span>
        </div>
      )}

      {result && result.configured && (
        <div className="card overflow-hidden">
          <div className="p-3 border-b border-border flex items-center gap-2">
            <Icon name={result.extracted ? "CircleCheckBig" : "TriangleAlert"} size={15} style={{ color: result.extracted ? "var(--success-fg, var(--text))" : "var(--warning-fg, var(--text))" }} />
            <span className="text-[12.5px] font-semibold">{result.extracted ? "Extracted fields" : "Couldn't read it cleanly"}</span>
            {result.provider && <span className="text-[11px] text-muted ml-auto">via {result.provider}</span>}
          </div>

          {result.message && !result.extracted && (
            <p className="text-[12px] text-muted px-3 py-2">{result.message}</p>
          )}

          {result.extracted && (
            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Vendor" value={result.vendorName ?? "—"} />
                <Field label="Invoice #" value={result.invoiceNumber ?? "—"} />
                <Field label="Date" value={result.invoiceDate ?? "—"} />
                <Field label="Total" value={fmtMoney(result.total)} />
              </div>

              {result.lineItems.length > 0 && (
                <div className="overflow-x-auto border border-border rounded-lg">
                  <table className="w-full text-[12px]">
                    <thead className="bg-surface">
                      <tr>
                        {["Description", "HSN", "Qty", "Rate", "Amount"].map((h, i) => (
                          <th key={h} className={`px-3 py-1.5 font-semibold uppercase tracking-wider text-muted ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.lineItems.map((li, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="px-3 py-1.5">{li.description}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{li.hsnCode ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{li.quantity ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(li.unitPrice)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(li.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
                <span><span className="text-muted">Subtotal: </span><span className="font-medium">{fmtMoney(result.subtotal)}</span></span>
                <span><span className="text-muted">Tax: </span><span className="font-medium">{fmtMoney(result.tax)}</span></span>
                <span><span className="text-muted">Total: </span><span className="font-semibold">{fmtMoney(result.total)}</span></span>
              </div>

              <p className="text-[11px] text-muted">
                Review the figures, then enter them under Vendor Invoices → New. AI extraction can be
                imperfect — always verify before saving.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-[13px] font-medium text-text-default mt-0.5 break-words">{value}</div>
    </div>
  );
}
