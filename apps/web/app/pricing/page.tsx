"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";

interface Plan {
  key: string;
  name: string;
  price: string;
  period: string;
  tagline: string;
  cta: string;
  href: string;
  popular?: boolean;
  features: string[];
}

const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    price: "₹0",
    period: "forever",
    tagline: "For solo shops trying it out",
    cta: "Start free",
    href: "/signup",
    features: ["2 users", "1 company · 1 unit", "PR → PO → GRN + inventory", "~25 POs / month", "Community support"],
  },
  {
    key: "starter",
    name: "Starter",
    price: "₹1,499",
    period: "/month",
    tagline: "Chhoti dukaan & growing teams",
    cta: "Start free trial",
    href: "/signup",
    features: ["5 users", "1 company · 3 units", "Unlimited purchase orders", "Vendors, items & masters", "Standard reports", "Email support"],
  },
  {
    key: "business",
    name: "Business",
    price: "₹4,999",
    period: "/month",
    tagline: "Growing businesses",
    cta: "Start 14-day trial",
    href: "/signup",
    popular: true,
    features: [
      "25 users",
      "3 companies · 10 units",
      "Everything in Starter, plus —",
      "Vendor invoices + 3-way match",
      "Payments & AP aging",
      "Inventory valuation (FIFO / Avg)",
      "AI assistant",
      "GST e-invoicing",
      "Priority support",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    tagline: "Multi-company & compliance",
    cta: "Talk to us",
    href: "/signup",
    features: [
      "Unlimited users & companies",
      "Everything in Business, plus —",
      "White-label (your own brand)",
      "Dedicated database & SSO",
      "AI anomaly & forecasting",
      "CAPEX / AMC modules",
      "SLA + guided onboarding",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--frame)" }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 sm:px-10 h-16 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-[10px] grid place-items-center font-extrabold text-[15px]" style={{ background: "var(--primary)", color: "var(--primary-fg)" }}>P</div>
          <span className="font-semibold tracking-tight" style={{ color: "var(--text)" }}>Prathvi&apos;s ERP</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">Start free</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 sm:px-10 pb-20">
        <div className="text-center max-w-2xl mx-auto pt-8 pb-12">
          <h1 className="display text-4xl sm:text-5xl mb-3">Simple, honest pricing</h1>
          <p className="text-muted text-[15px]">
            Start free, upgrade when you grow. No card needed to begin. All plans are GST-ready and built for Indian businesses.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className="card p-6 flex flex-col h-full"
              style={p.popular ? { borderColor: "var(--primary)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent), var(--shadow-md)" } : { boxShadow: "var(--shadow-sm)" }}
            >
              {p.popular && (
                <span className="badge self-start mb-3" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>Most popular</span>
              )}
              <h3 className="font-bold text-[17px]">{p.name}</h3>
              <p className="text-[12px] text-muted mb-4 min-h-[2.5em]">{p.tagline}</p>
              <div className="flex items-baseline gap-1 mb-5">
                <span className="display text-3xl">{p.price}</span>
                {p.period && <span className="text-[12px] text-muted">{p.period}</span>}
              </div>
              <Link href={p.href} className={`btn ${p.popular ? "btn-primary" : "btn-ghost"} w-full justify-center mb-5`}>
                {p.cta}
              </Link>
              <ul className="space-y-2.5 text-[13px]">
                {p.features.map((f) => {
                  const isHeading = f.endsWith("—");
                  return (
                    <li key={f} className={isHeading ? "text-muted text-[11px] uppercase tracking-wide font-semibold pt-1" : "flex items-start gap-2"}>
                      {!isHeading && <Icon name="Check" size={15} style={{ color: "var(--primary)", marginTop: 1, flexShrink: 0 }} />}
                      <span>{f}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center text-muted text-[12.5px] mt-12">
          Prices in INR, exclusive of GST. Annual billing saves ~2 months. Need something specific?{" "}
          <Link href="/signup" className="font-semibold" style={{ color: "var(--primary)" }}>Get in touch</Link>.
        </p>
      </main>
    </div>
  );
}
