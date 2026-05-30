"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FieldError, fieldClass } from "@/components/FieldError";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { vendorCreateSchema, type VendorListItem, type VendorCreateInput } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

interface ListResponse {
  items: VendorListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const TINT_BG = [
  "var(--tint-peach)",
  "var(--tint-lilac)",
  "var(--tint-mint)",
  "var(--tint-blush)",
  "var(--tint-sand)",
  "var(--tint-teal)",
];

export default function VendorsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorListItem | null>(null);

  async function load(searchTerm = search) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (searchTerm) qs.set("search", searchTerm);
      const res = await api<ListResponse>(`/api/vendors?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/vendors/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Vendor removed", `${deleteTarget.name} has been deleted.`);
      setDeleteTarget(null);
      load(search);
    } catch (err) {
      toast.error("Could not delete", err instanceof ApiError ? err.message : "Try again");
    }
  }

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Your supplier directory — used in POs and spend analysis"
        actions={
          <>
            <div className="relative">
              <input
                className="input !py-2 !pl-9 !w-64 text-sm"
                placeholder="Search vendors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load(search)}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" style={{ pointerEvents: "none" }}>
                <Icon name="Search" />
              </span>
            </div>
            <button className="btn btn-primary" onClick={() => { setEditId(null); setShowForm(true); }}>
              <Icon name="Plus" /> New Vendor
            </button>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-muted">Loading vendors…</div>
        ) : !data?.items.length ? (
          <EmptyState onAdd={() => { setEditId(null); setShowForm(true); }} />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Code</th>
                <th className="text-left px-5 py-3 font-semibold">Name</th>
                <th className="text-left px-5 py-3 font-semibold">GSTIN</th>
                <th className="text-left px-5 py-3 font-semibold">Location</th>
                <th className="text-left px-5 py-3 font-semibold">Contact</th>
                <th className="text-left px-5 py-3 font-semibold">Rating</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-right px-5 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((v, i) => (
                <tr
                  key={v.id}
                  className="border-t border-border hover:bg-surface/50 cursor-pointer select-none group"
                  onDoubleClick={() => { setEditId(v.id); setShowForm(true); }}
                  title="Double-click to edit"
                >
                  <td className="px-5 py-3 font-mono text-xs text-muted">{v.code ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-8 w-8 rounded-lg shrink-0"
                        style={{ background: TINT_BG[i % TINT_BG.length] }}
                      />
                      <span className="font-semibold">{v.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{v.gstin ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">
                    {[v.city, v.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {v.email ?? v.phone ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    {v.ratingCount > 0
                      ? <span className="badge badge-tint-mint">{(v.ratingScaled / 100).toFixed(1)}★ ({v.ratingCount})</span>
                      : <span className="text-xs text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`badge ${v.isActive ? "badge-success" : "badge-danger"}`}>
                      {v.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition">
                      <button
                        className="h-8 w-8 rounded-pill grid place-items-center hover:bg-bg"
                        onClick={(e) => { e.stopPropagation(); setEditId(v.id); setShowForm(true); }}
                        title="Edit"
                      >
                        <Icon name="Pencil" size={16} />
                      </button>
                      <button
                        className="h-8 w-8 rounded-pill grid place-items-center hover:bg-danger-bg hover:text-danger-fg"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(v); }}
                        title="Delete"
                      >
                        <Icon name="Trash2" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.items.length > 0 && (
          <div className="px-5 py-3 border-t border-border text-xs text-muted flex justify-between items-center">
            <span>{data.total} vendor{data.total === 1 ? "" : "s"} total · double-click a row to edit</span>
            <span>Page {data.page}</span>
          </div>
        )}
      </div>

      <VendorFormModal
        open={showForm}
        editId={editId}
        onClose={() => setShowForm(false)}
        onSaved={(name, wasEdit) => {
          setShowForm(false);
          toast.success(
            wasEdit ? "Vendor updated" : "Vendor created",
            wasEdit ? `${name} ke changes save ho gaye.` : `${name} ab aapki vendor list mein hai.`,
          );
          load(search);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.name ?? "vendor"}?`}
        description={
          <>
            Yeh vendor hide ho jayega vendor list se. <strong className="text-text-default">Mauud POs untouched rahenge</strong> —
            audit trail mein bhi entry rahegi. Kabhi bhi super-admin se restore ho sakta hai.
          </>
        }
        confirmLabel="Yes, delete"
        cancelLabel="Cancel"
        tone="danger"
      />
    </>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="p-12 text-center">
      <div className="h-14 w-14 rounded-2xl mx-auto grid place-items-center bg-tint-teal text-tint-teal-fg mb-4">
        <Icon name="Users" size={28} />
      </div>
      <h3 className="display text-xl mb-1">No vendors yet</h3>
      <p className="text-sm text-muted mb-5">Add your first vendor to start raising POs.</p>
      <button className="btn btn-primary" onClick={onAdd}>
        <Icon name="Plus" /> Add Vendor
      </button>
    </div>
  );
}

function VendorFormModal({
  open,
  editId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editId: string | null;
  onClose: () => void;
  onSaved: (name: string, wasEdit: boolean) => void;
}) {
  const [form, setForm] = useState<VendorCreateInput>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);
  const fe = errors.fields;

  useEffect(() => {
    if (!open) return;
    setErrors(emptyErrors);
    if (editId) {
      (async () => {
        try {
          const v = await api<{
            name: string; legalName: string | null; gstin: string | null; pan: string | null;
            msmeNumber: string | null; contactPerson: string | null; email: string | null;
            phone: string | null; address: string | null; city: string | null; state: string | null;
            pincode: string | null; paymentTerms: string | null; notes: string | null;
          }>(`/api/vendors/${editId}`);
          setForm({
            name: v.name,
            legalName: v.legalName ?? "",
            gstin: v.gstin ?? "",
            pan: v.pan ?? "",
            msmeNumber: v.msmeNumber ?? "",
            contactPerson: v.contactPerson ?? "",
            email: v.email ?? "",
            phone: v.phone ?? "",
            address: v.address ?? "",
            city: v.city ?? "",
            state: v.state ?? "",
            pincode: v.pincode ?? "",
            paymentTerms: v.paymentTerms ?? "",
            notes: v.notes ?? "",
          });
        } catch (err) {
          setErrors({ summary: err instanceof ApiError ? err.message : "Could not load vendor", fields: {} });
        }
      })();
    } else {
      setForm(emptyForm());
    }
  }, [editId, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const cleaned: VendorCreateInput = { ...form, name: form.name.trim() };
    const result = validate(vendorCreateSchema, cleaned);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(emptyErrors);
    setSubmitting(true);
    try {
      if (editId) {
        await api(`/api/vendors/${editId}`, { method: "PATCH", body: JSON.stringify(result.data) });
      } else {
        await api("/api/vendors", { method: "POST", body: JSON.stringify(result.data) });
      }
      onSaved(cleaned.name, !!editId);
    } catch (err) {
      setErrors(apiErrorToFormErrors(err));
    } finally {
      setSubmitting(false);
    }
  }

  const set = <K extends keyof VendorCreateInput>(k: K, v: VendorCreateInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (fe[k as string]) setErrors((e) => ({ ...e, fields: { ...e.fields, [k as string]: "" } }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editId ? "Edit vendor" : "New vendor"}
      description="Master record — used by POs, payments, and reports."
      size="xl"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button form="vendor-form" type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : editId ? "Save changes" : "Create vendor"}
          </button>
        </>
      }
    >
      <form id="vendor-form" onSubmit={handleSubmit} className="space-y-5">
        {errors.summary && (
          <div className="rounded-lg p-3 bg-danger-bg text-danger-fg text-sm flex items-start gap-2">
            <Icon name="TriangleAlert" size={16} />
            <span className="flex-1">{errors.summary}</span>
          </div>
        )}

        <Section title="Basics">
          <Field label="Vendor name" required error={fe.name}>
            <input className={fieldClass(fe.name)} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Legal name" error={fe.legalName}>
            <input className={fieldClass(fe.legalName)} value={form.legalName ?? ""} onChange={(e) => set("legalName", e.target.value)} />
          </Field>
          <Field label="Contact person">
            <input className="input" value={form.contactPerson ?? ""} onChange={(e) => set("contactPerson", e.target.value)} />
          </Field>
        </Section>

        <Section title="Tax & registration">
          <Field label="GSTIN" error={fe.gstin}>
            <input className={fieldClass(fe.gstin, "input font-mono")} placeholder="22AAAAA0000A1Z5" value={form.gstin ?? ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
          </Field>
          <Field label="PAN" error={fe.pan}>
            <input className={fieldClass(fe.pan, "input font-mono")} placeholder="ABCDE1234F" value={form.pan ?? ""} onChange={(e) => set("pan", e.target.value.toUpperCase())} />
          </Field>
          <Field label="MSME number">
            <input className="input" value={form.msmeNumber ?? ""} onChange={(e) => set("msmeNumber", e.target.value)} />
          </Field>
        </Section>

        <Section title="Contact">
          <Field label="Email" error={fe.email}>
            <input className={fieldClass(fe.email)} type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Payment terms">
            <input className="input" placeholder="Net 30" value={form.paymentTerms ?? ""} onChange={(e) => set("paymentTerms", e.target.value)} />
          </Field>
        </Section>

        <Section title="Address">
          <Field label="City">
            <input className="input" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State">
            <input className="input" value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="Pincode">
            <input className="input" value={form.pincode ?? ""} onChange={(e) => set("pincode", e.target.value)} />
          </Field>
        </Section>

        <Field label="Street address">
          <textarea className="input" rows={2} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Notes">
          <textarea className="input" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, required, children, error }: { label: string; required?: boolean; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      <FieldError error={error} />
    </div>
  );
}

function emptyForm(): VendorCreateInput {
  return {
    name: "",
    legalName: "",
    gstin: "",
    pan: "",
    msmeNumber: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    paymentTerms: "",
    notes: "",
  };
}
