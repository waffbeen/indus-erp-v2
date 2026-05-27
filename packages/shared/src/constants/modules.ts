/**
 * Module catalog — master list of features super-admin can toggle per tenant.
 * Adding a new module here is step 1; adding routes + UI follows.
 *
 * The `mvp` flag = ships in v0.1 and is auto-activated for every new tenant.
 * The `gated` flag = built but disabled by default; super-admin activates after payment.
 *
 * `path` is appended to the tenant URL prefix `/t/<slug>` — e.g. "pr" → /t/acme/pr.
 * `icon` is a Lucide icon name in PascalCase (matches `lucide-react` exports).
 * `shortLabel` is the compact label used in the narrow sidebar (max ~7 chars).
 */

export interface ModuleDef {
  key: string;
  name: string;
  shortLabel: string;
  description: string;
  icon: string;     // Lucide icon name (PascalCase)
  path: string;     // route under /t/<slug>
  mvp: boolean;
  gated: boolean;
  group: "core" | "procurement" | "inventory" | "finance" | "intelligence" | "admin";
  /** Show in sidebar? Some modules (e.g. admin-only) won't appear in main nav. */
  showInSidebar: boolean;
  /** Order in sidebar (lower = first). Items with the same group cluster together. */
  sortOrder: number;
}

export const MODULES: ModuleDef[] = [
  // ---- CORE ----
  { key: "dashboard", shortLabel: "Home",   name: "Dashboard", description: "Overview & KPIs",                icon: "LayoutDashboard", path: "/dashboard",  mvp: true,  gated: false, group: "core",         showInSidebar: true,  sortOrder: 10 },

  // ---- PROCUREMENT (MVP) ----
  { key: "pr",        shortLabel: "PRs",    name: "Requisitions",    description: "Raise & approve purchase requisitions", icon: "FileText",     path: "/pr",         mvp: true,  gated: false, group: "procurement",  showInSidebar: true,  sortOrder: 20 },
  { key: "po",        shortLabel: "POs",    name: "Purchase Orders", description: "Convert PRs into orders to vendors",    icon: "ShoppingCart", path: "/po",         mvp: true,  gated: false, group: "procurement",  showInSidebar: true,  sortOrder: 21 },
  { key: "approvals", shortLabel: "Approve",name: "Approvals",       description: "Pending items needing your decision",   icon: "CheckCircle2", path: "/approvals",  mvp: true,  gated: false, group: "procurement",  showInSidebar: true,  sortOrder: 22 },

  // ---- INVENTORY ----
  { key: "gate_entry",shortLabel: "Gate",   name: "Gate Entry",    description: "Track inward/outward at gate", icon: "DoorOpen",    path: "/gate-entry", mvp: true,  gated: false, group: "inventory",    showInSidebar: true,  sortOrder: 30 },
  { key: "grn",       shortLabel: "GRN",    name: "Goods Receipt", description: "Receive items against POs",    icon: "PackageCheck",path: "/grn",        mvp: true,  gated: false, group: "inventory",    showInSidebar: true,  sortOrder: 31 },
  { key: "inventory", shortLabel: "Stock",  name: "Inventory",     description: "Stock ledger & transfers",      icon: "Warehouse",   path: "/inventory",  mvp: true,  gated: false, group: "inventory",    showInSidebar: true,  sortOrder: 32 },

  // ---- MASTERS ----
  { key: "vendors",   shortLabel: "Vendors",name: "Vendors",     description: "Vendor master & rating", icon: "Users",   path: "/vendors", mvp: true,  gated: false, group: "procurement", showInSidebar: true, sortOrder: 40 },
  { key: "items",     shortLabel: "Items",  name: "Items",       description: "Item master & UOM",      icon: "Package", path: "/items",   mvp: true,  gated: false, group: "procurement", showInSidebar: true, sortOrder: 41 },
  { key: "masters",   shortLabel: "Masters",name: "Masters",     description: "HSN, UoM, payment terms, taxonomy & more", icon: "Database", path: "/masters", mvp: true,  gated: false, group: "procurement", showInSidebar: true, sortOrder: 42 },

  // ---- FINANCE (post-MVP) ----
  { key: "capex",     shortLabel: "CAPEX",  name: "CAPEX",       description: "Capital expense tracking",     icon: "TrendingUp",   path: "/capex",     mvp: false, gated: true, group: "finance", showInSidebar: true, sortOrder: 50 },
  { key: "amc",       shortLabel: "AMC",    name: "AMC",         description: "Annual maintenance contracts", icon: "Wrench",       path: "/amc",       mvp: false, gated: true, group: "finance", showInSidebar: true, sortOrder: 51 },
  { key: "payments",  shortLabel: "Pay",    name: "Payments",    description: "Vendor payments & invoices",   icon: "IndianRupee",  path: "/payments",  mvp: false, gated: true, group: "finance", showInSidebar: true, sortOrder: 52 },

  // ---- INTELLIGENCE ----
  { key: "reports",   shortLabel: "Reports",name: "Reports",        description: "Standard & custom reports",      icon: "BarChart3", path: "/reports",  mvp: true,  gated: false, group: "intelligence", showInSidebar: true,  sortOrder: 60 },
  { key: "ai_assist", shortLabel: "AI",     name: "AI Assistant",   description: "Procurement chat assistant",    icon: "Sparkles",  path: "/ai",       mvp: false, gated: true,  group: "intelligence", showInSidebar: true,  sortOrder: 61 },
  { key: "ai_predict",shortLabel: "Predict",name: "AI Predictions", description: "Stock & vendor risk forecasts", icon: "Brain",     path: "/ai/predict", mvp: false, gated: true,  group: "intelligence", showInSidebar: false, sortOrder: 62 },

  // ---- ADMIN (always at bottom) ----
  { key: "users",     shortLabel: "Team",   name: "Team",       description: "Members & invitations",      icon: "UsersRound", path: "/users",    mvp: true,  gated: false, group: "admin", showInSidebar: true, sortOrder: 98 },
  { key: "settings",  shortLabel: "Settings",name: "Settings",  description: "Workspace & user settings", icon: "Settings",   path: "/settings", mvp: true,  gated: false, group: "admin", showInSidebar: true, sortOrder: 99 },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);
export type ModuleKey = (typeof MODULES)[number]["key"];

export function findModule(key: string): ModuleDef | undefined {
  return MODULES.find((m) => m.key === key);
}

/** Sidebar items for a tenant — filtered to enabled modules + sorted. */
export function sidebarModulesFor(enabledKeys: string[]): ModuleDef[] {
  const set = new Set(enabledKeys);
  return MODULES
    .filter((m) => m.showInSidebar && set.has(m.key))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
