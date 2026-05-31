"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FieldError, fieldClass } from "@/components/FieldError";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { customerCreateSchema, type CustomerListItem, type CustomerCreateInput } from "@indus/shared";
import { validate, apiErrorToFormErrors, emptyErrors, type FormErrorState } from "@/lib/form-errors";

interface ListResponse {
  items: CustomerListItem[];
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

export default function CustomersPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerListItem | null>(null);

  async function load(searchTerm = search) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (searchTerm) qs.set("search", searchTerm);
      const res = await api<ListResponse>(`/api/customers?${qs.toString()}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/customers/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Customer removed", `${deleteTarget.name} has been deleted.`);
      setDeleteTarget(null);
      load(search);
    } catch (err) {
      toast.error("Could not delete", err instanceof ApiError ? err.message : "Try again");
    }
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Your buyer directory — used in sales orders, invoices and AR ageing"
        actions={
          <>
            <div className="relative">
              <input
                className="input !py-2 !pl-9 !w-64 text-sm"
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load(search)}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" style={{ pointerEvents: "none" }}>
                <Icon name="Search" />
              </span>
            </div>
            <button className="btn btn-primary" onClick={() => { setEditId(null); setShowForm(true); }}>
              <Icon name="Plus" /> New Customer
            </button>
          </>
        }
      />

      {error && <div className="mb-4 rounded-lg p-3 bg-danger-bg text-danger-fg text-sm">{error}</div>}

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-muted">Loading customers…</div>
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
                <th className="text-left px-5 py-3 font-semibold">Credit</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-right px-5 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c, i) => (
                <tr
                  key={c.id}
                  className="border-t border-border hover:bg-surface/50 cursor-pointer select-none group"
                  onDoubleClick={() => { setEditId(c.id); setShowForm(true); }}
                  title="Double-click to edit"
                >
                  <td className="px-5 py-3 font-mono text-xs text-muted">{c.code ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg shrink-0" style={{ background: TINT_BG[i % TINT_BG.length] }} />
                      <span className="font-semibold">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{c.gstin ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">{[c.city, c.state].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-5 py-3 text-muted">{c.email ?? c.phone ?? "—"}</td>
                  <td className="px-5 py-3 text-muted tabular-nums">{c.creditDays > 0 ? `${c.creditDays} days` : "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${c.isActive ? "badge-success" : "badge-danger"}`}>
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition">
                      <button
                        className="h-8 w-8 rounded-pill grid place-items-center hover:bg-bg"
                        onClick={(e) => { e.stopPropagation(); setEditId(c.id); setShowForm(true); }}
                        title="Edit"
                      >
                        <Icon name="Pencil" size={16} />
                      </button>
                      <button
                        className="h-8 w-8 rounded-pill grid place-items-center hover:bg-danger-bg hover:text-danger-fg"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
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
            <span>{data.total} customer{data.total === 1 ? "" : "s"} total · double-click a row to edit</span>
            <span>Page {data.page}</span>
          </div>
        )}
      </div>

      <CustomerFormModal
        open={showForm}
        editId={editId}
        onClose={() => setShowForm(false)}
        onSaved={(name, wasEdit) => {
          setShowForm(false);
          toast.success(
            wasEdit ? "Customer updated" : "Customer created",
            wasEdit ? `${name} ke changes save ho gaye.` : `${name} ab aapki customer list mein hai.`,
          );
          load(search);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.name ?? "customer"}?`}
        description={
          <>
            Yeh customer hide ho jayega customer list se. <strong className="text-text-default">Mauud sales orders untouched rahenge</strong> —
            audit trail mein bhi entry rahegi.
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
        <Icon name="Contact" size={28} />
      </div>
      <h3 className="display text-xl mb-1">No customers yet</h3>
      <p className="text-sm text-muted mb-5">Add your first customer to start raising sales orders.</p>
      <button className="btn btn-primary" onClick={onAdd}>
        <Icon name="Plus" /> Add Customer
      </button>
    </div>
  );
}

function CustomerFormModal({
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
  const [form, setForm] = useState<CustomerCreateInput>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrorState>(emptyErrors);
  const fe = errors.fields;

  useEffect(() => {
    if (!open) return;
    setErrors(emptyErrors);
    if (editId) {
      (async () => {
        try {
          const c = await api<Record<string, unknown> & { creditLimitPaise: string | null }>(`/api/customers/${editId}`);
          setForm({
            name: (c.name as string) ?? "",
            legalName: (c.legalName as string) ?? "",
            gstin: (c.gstin as string) ?? "",
            pan: (c.pan as string) ?? "",
            contactPerson: (c.contactPerson as string) ?? "",
            email: (c.email as string) ?? "",
            phone: (c.phone as string) ?? "",
            billingAddress: (c.billingAddress as string) ?? "",
            shippingAddress: (c.shippingAddress as string) ?? "",
            city: (c.city as string) ?? "",
            state: (c.state as string) ?? "",
            pincode: (c.pincode as string) ?? "",
            creditDays: (c.creditDays as number) ?? 0,
            creditLimit: c.creditLimitPaise != null ? Number(c.creditLimitPaise) / 100 : null,
            paymentTerms: (c.paymentTerms as string) ?? "",
            notes: (c.notes as string) ?? "",
          });
        } catch (err) {
          setErrors({ summary: err instanceof ApiError ? err.message : "Could not load customer", fields: {} });
        }
      })();
    } else {
      setForm(emptyForm());
    }
  }, [editId, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const cleaned: CustomerCreateInput = { ...form, name: form.name.trim() };
    const result = validate(customerCreateSchema, cleaned);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(emptyErrors);
    setSubmitting(true);
    try {
      if (editId) {
        await api(`/api/customers/${editId}`, { method: "PATCH", body: JSON.stringify(result.data) });
      } else {
        await api("/api/customers", { method: "POST", body: JSON.stringify(result.data) });
      }
      onSaved(cleaned.name, !!editId);
    } catch (err) {
      setErrors(apiErrorToFormErrors(err));
    } finally {
      setSubmitting(false);
    }
  }

  const set = <K extends keyof CustomerCreateInput>(k: K, v: CustomerCreateInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (fe[k as string]) setErrors((e) => ({ ...e, fields: { ...e.fields, [k as string]: "" } }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editId ? "Edit customer" : "New customer"}
      description="Master record — used by sales orders, invoices and AR ageing."
      size="xl"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button form="customer-form" type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : editId ? "Save changes" : "Create customer"}
          </button>
        </>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} className="space-y-5">
        {errors.summary && (
          <div className="rounded-lg p-3 bg-danger-bg text-danger-fg text-sm flex items-start gap-2">
            <Icon name="TriangleAlert" size={16} />
            <span className="flex-1">{errors.summary}</span>
          </div>
        )}

        <Section title="Basics">
          <Field label="Customer name" required error={fe.name}>
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
          <Field label="Place of supply (state)">
            <input className="input" value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
          </Field>
        </Section>

        <Section title="Contact & terms">
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

        <Section title="Credit & location">
          <Field label="Credit days" error={fe.creditDays}>
            <input className={fieldClass(fe.creditDays, "input tabular-nums")} type="number" min="0" max="365" value={form.creditDays ?? 0} onChange={(e) => set("creditDays", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Credit limit (₹)">
            <input className="input tabular-nums" type="number" min="0" step="0.01" value={form.creditLimit ?? ""} onChange={(e) => set("creditLimit", e.target.value === "" ? null : Number(e.target.value))} placeholder="Optional" />
          </Field>
          <Field label="City">
            <input className="input" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </Field>
        </Section>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Billing address">
            <textarea className="input" rows={2} value={form.billingAddress ?? ""} onChange={(e) => set("billingAddress", e.target.value)} />
          </Field>
          <Field label="Shipping address">
            <textarea className="input" rows={2} value={form.shippingAddress ?? ""} onChange={(e) => set("shippingAddress", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Pincode">
            <input className="input" value={form.pincode ?? ""} onChange={(e) => set("pincode", e.target.value)} />
          </Field>
        </div>
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

function emptyForm(): CustomerCreateInput {
  return {
    name: "",
    legalName: "",
    gstin: "",
    pan: "",
    contactPerson: "",
    email: "",
    phone: "",
    billingAddress: "",
    shippingAddress: "",
    city: "",
    state: "",
    pincode: "",
    creditDays: 0,
    creditLimit: null,
    paymentTerms: "",
    notes: "",
  };
}
