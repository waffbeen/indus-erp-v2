/**
 * Seed script — populates initial data so the app is usable on first run:
 *   1. Module catalog (mirrors @indus/shared/constants/modules)
 *   2. Pricing plans (free / starter / business / enterprise — prices empty,
 *      super-admin sets later)
 *   3. Super-admin user (us, the SaaS operator)
 *   4. Demo tenant + admin + procurement user (for instant testing)
 *
 * Idempotent — safe to re-run.
 */

import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import {
  tenants,
  tenantModules,
} from "./schema/tenants";
import { users } from "./schema/users";
import { roles } from "./schema/roles";
import { memberships } from "./schema/memberships";
import { companies } from "./schema/companies";
import { units } from "./schema/units";
import { modules, pricingPlans, tenantSubscriptions } from "./schema/modules";
import { vendors } from "./schema/vendors";
import { items } from "./schema/items";
import { hashPassword } from "../lib/password";
import { MODULES, SYSTEM_ROLES } from "@indus/shared";
import { logger } from "../lib/logger";

async function upsertModules() {
  for (const m of MODULES) {
    const existing = await db.select().from(modules).where(eq(modules.key, m.key)).limit(1);
    if (existing.length === 0) {
      await db.insert(modules).values({
        key: m.key,
        name: m.name,
        description: m.description,
        icon: m.icon,
        group: m.group,
        isMvp: m.mvp,
        isGated: m.gated,
      });
    }
  }
  logger.info({ count: MODULES.length }, "modules_seeded");
}

async function upsertPricingPlans() {
  const plans = [
    { key: "free", name: "Free", description: "For solo shops trying it out", monthlyPricePaise: "0", limits: { maxUsers: 2, maxCompanies: 1, maxUnits: 1, storageMB: 500 } },
    { key: "starter", name: "Starter", description: "Chhota dukaan", monthlyPricePaise: "0", limits: { maxUsers: 10, maxCompanies: 1, maxUnits: 3, storageMB: 5120 } },
    { key: "business", name: "Business", description: "Multi-company businesses", monthlyPricePaise: "0", limits: { maxUsers: 50, maxCompanies: 3, maxUnits: 10, storageMB: 51200 } },
    { key: "enterprise", name: "Enterprise", description: "Dedicated DB + SSO + white-label", monthlyPricePaise: "0", limits: { maxUsers: 999999, maxCompanies: 999999, maxUnits: 999999, storageMB: 512000 } },
  ];
  for (const p of plans) {
    const existing = await db.select().from(pricingPlans).where(eq(pricingPlans.key, p.key)).limit(1);
    if (existing.length === 0) {
      await db.insert(pricingPlans).values({
        key: p.key,
        name: p.name,
        description: p.description,
        monthlyPricePaise: p.monthlyPricePaise,
        limits: p.limits,
        includedModules: MODULES.filter((m) => m.mvp).map((m) => m.key),
      });
    }
  }
  logger.info({ count: plans.length }, "plans_seeded");
}

async function seedSuperAdmin() {
  const email = "admin@indus.app";
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    logger.info({ email }, "super_admin_exists");
    return existing[0]!.id;
  }
  const [u] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword("ChangeMe!2026"),
      fullName: "Super Admin",
      isSuperAdmin: true,
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });
  logger.warn({ email, password: "ChangeMe!2026" }, "super_admin_created_change_password_immediately");
  return u!.id;
}

async function seedDemoTenant(): Promise<string | null> {
  const slug = "acme";
  const existing = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (existing.length > 0) {
    logger.info({ slug }, "demo_tenant_exists");
    return existing[0]!.id;
  }

  // Tenant
  const [tenant] = await db
    .insert(tenants)
    .values({ slug, name: "Acme Industries", status: "trial", themeKey: "circle" })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error("Failed to create demo tenant");

  // Trial subscription
  await db.insert(tenantSubscriptions).values({
    tenantId: tenant.id,
    status: "trial",
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  // Activate MVP modules for this tenant
  for (const m of MODULES.filter((m) => m.mvp)) {
    await db.insert(tenantModules).values({
      tenantId: tenant.id,
      moduleKey: m.key,
      enabled: true,
      activatedAt: new Date(),
    });
  }

  // Seed system roles for this tenant
  const roleIds: Record<string, string> = {};
  for (const r of SYSTEM_ROLES) {
    const [created] = await db
      .insert(roles)
      .values({
        tenantId: tenant.id,
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: true,
        permissions: r.permissions,
        moduleKeys: MODULES.filter((m) => m.mvp).map((m) => m.key),
      })
      .returning({ id: roles.id });
    if (created) roleIds[r.key] = created.id;
  }

  // Company + unit
  const [company] = await db
    .insert(companies)
    .values({
      tenantId: tenant.id,
      name: "Acme Industries Pvt Ltd",
      legalName: "Acme Industries Private Limited",
      city: "Mumbai",
      state: "Maharashtra",
      country: "IN",
      isPrimary: true,
    })
    .returning({ id: companies.id });

  const [unit] = await db
    .insert(units)
    .values({
      tenantId: tenant.id,
      companyId: company!.id,
      name: "Mumbai Plant",
      code: "MUM-01",
      city: "Mumbai",
      state: "Maharashtra",
      type: "plant",
    })
    .returning({ id: units.id });

  // Demo admin user
  const [admin] = await db
    .insert(users)
    .values({
      email: "ramesh@acme.in",
      passwordHash: await hashPassword("Demo!2026"),
      fullName: "Ramesh Kumar",
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });

  await db.insert(memberships).values({
    tenantId: tenant.id,
    userId: admin!.id,
    roleId: roleIds.tenant_admin!,
    companyId: company!.id,
    unitId: unit!.id,
    isTenantAdmin: true,
    status: "active",
    acceptedAt: new Date(),
  });

  // Demo procurement user
  const [procUser] = await db
    .insert(users)
    .values({
      email: "suresh@acme.in",
      passwordHash: await hashPassword("Demo!2026"),
      fullName: "Suresh K.",
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });

  await db.insert(memberships).values({
    tenantId: tenant.id,
    userId: procUser!.id,
    roleId: roleIds.procurement!,
    companyId: company!.id,
    unitId: unit!.id,
    status: "active",
    acceptedAt: new Date(),
  });

  logger.warn(
    {
      tenant: slug,
      adminLogin: { email: "ramesh@acme.in", password: "Demo!2026" },
      procurementLogin: { email: "suresh@acme.in", password: "Demo!2026" },
    },
    "demo_tenant_created_change_passwords_in_prod",
  );

  return tenant.id;
}

/**
 * Sample vendor + item master data for the demo tenant.
 * Idempotent — only adds rows that don't already exist (matched by name).
 */
const DEMO_VENDORS: Array<{
  name: string; legalName: string; gstin: string; pan: string;
  contactPerson: string; email: string; phone: string;
  city: string; state: string; pincode: string; paymentTerms: string;
}> = [
  {
    name: "Acme Steel Pvt Ltd", legalName: "Acme Steel Private Limited",
    gstin: "27AABCA1234M1ZX", pan: "AABCA1234M",
    contactPerson: "Mahesh Patil", email: "sales@acmesteel.in", phone: "+91 9820012345",
    city: "Mumbai", state: "Maharashtra", pincode: "400001", paymentTerms: "Net 30",
  },
  {
    name: "Bharat Forge Industries", legalName: "Bharat Forge Industries Pvt Ltd",
    gstin: "27BFGCA5678N1ZY", pan: "BFGCA5678N",
    contactPerson: "Anita Sharma", email: "purchase@bharatforge.in", phone: "+91 9820098765",
    city: "Pune", state: "Maharashtra", pincode: "411001", paymentTerms: "Net 45",
  },
  {
    name: "Reliance Polymers Ltd", legalName: "Reliance Polymers Limited",
    gstin: "24RLNPL9876P1ZQ", pan: "RLNPL9876P",
    contactPerson: "Rakesh Mehta", email: "rakesh@reliancepoly.in", phone: "+91 9876543210",
    city: "Ahmedabad", state: "Gujarat", pincode: "380001", paymentTerms: "50% advance, 50% before dispatch",
  },
  {
    name: "Surya Roshni Electricals", legalName: "Surya Roshni Limited",
    gstin: "07SURRC3456L1ZP", pan: "SURRC3456L",
    contactPerson: "Vikram Singh", email: "orders@suryaroshni.in", phone: "+91 9810234567",
    city: "New Delhi", state: "Delhi", pincode: "110001", paymentTerms: "Net 30",
  },
  {
    name: "TVS Logistics Services", legalName: "TVS Logistics Services Ltd",
    gstin: "33TVSLS2345K1ZN", pan: "TVSLS2345K",
    contactPerson: "Karthik R.", email: "service@tvslogistics.com", phone: "+91 9445678901",
    city: "Chennai", state: "Tamil Nadu", pincode: "600001", paymentTerms: "Net 15",
  },
];

const DEMO_ITEMS: Array<{
  name: string; description: string; category: string;
  itemGroupName: string; itemSubGroupName: string;
  uom: string; hsnCode: string; defaultTaxRate: number;
  isStocked: boolean; isAsset?: boolean; isService?: boolean;
}> = [
  // Bearings
  { name: "Deep Groove Ball Bearing 6204-ZZ", description: "SKF / FAG equivalent, single row, sealed both sides", category: "Spares", itemGroupName: "Spares", itemSubGroupName: "Bearings", uom: "nos", hsnCode: "84821000", defaultTaxRate: 18, isStocked: true },
  { name: "Deep Groove Ball Bearing 6205-2RS", description: "Rubber sealed both sides, 25×52×15mm", category: "Spares", itemGroupName: "Spares", itemSubGroupName: "Bearings", uom: "nos", hsnCode: "84821000", defaultTaxRate: 18, isStocked: true },
  { name: "Taper Roller Bearing 30206", description: "Single row, 30×62×17.25mm", category: "Spares", itemGroupName: "Spares", itemSubGroupName: "Bearings", uom: "nos", hsnCode: "84823000", defaultTaxRate: 18, isStocked: true },
  // Lubricants
  { name: "Engine Oil SAE 20W-40 (1L)", description: "Multi-grade mineral engine oil, API SL", category: "Consumables", itemGroupName: "Consumables", itemSubGroupName: "Lubricants", uom: "ltr", hsnCode: "27101981", defaultTaxRate: 18, isStocked: true },
  { name: "Lithium Grease (500g tube)", description: "EP-2 multi-purpose lithium grease", category: "Consumables", itemGroupName: "Consumables", itemSubGroupName: "Lubricants", uom: "nos", hsnCode: "34031900", defaultTaxRate: 18, isStocked: true },
  // Electrical
  { name: "LED Tube Light 18W (4ft)", description: "Cool daylight 6500K, Surya brand", category: "Electrical", itemGroupName: "Electrical", itemSubGroupName: "Lighting", uom: "nos", hsnCode: "85395000", defaultTaxRate: 12, isStocked: true },
  { name: "MCB 32A Single Pole", description: "C-curve, 10kA breaking capacity", category: "Electrical", itemGroupName: "Electrical", itemSubGroupName: "Switchgear", uom: "nos", hsnCode: "85362020", defaultTaxRate: 18, isStocked: true },
  { name: "Copper Cable 2.5sqmm (per metre)", description: "PVC insulated, ISI marked", category: "Electrical", itemGroupName: "Electrical", itemSubGroupName: "Cables", uom: "mtr", hsnCode: "85444930", defaultTaxRate: 18, isStocked: true },
  // Raw materials
  { name: "Mild Steel Round Bar 12mm", description: "Per kg, Fe-410 grade", category: "Raw Material", itemGroupName: "Raw Material", itemSubGroupName: "Steel", uom: "kg", hsnCode: "72142090", defaultTaxRate: 18, isStocked: true },
  { name: "Galvanized Steel Sheet 1mm (8x4ft)", description: "Zinc coated, 1mm thickness", category: "Raw Material", itemGroupName: "Raw Material", itemSubGroupName: "Steel", uom: "nos", hsnCode: "72104900", defaultTaxRate: 18, isStocked: true },
  // Office
  { name: "A4 Photocopier Paper (75 GSM, 500 sheets)", description: "JK Easy Copier or equivalent", category: "Office", itemGroupName: "Office Supplies", itemSubGroupName: "Stationery", uom: "ream", hsnCode: "48025690", defaultTaxRate: 12, isStocked: true },
  { name: "Annual AMC – Air Conditioner servicing", description: "Per AC unit per year, includes 4 visits", category: "Services", itemGroupName: "Services", itemSubGroupName: "AMC", uom: "year", hsnCode: "998739", defaultTaxRate: 18, isStocked: false, isService: true },
];

async function seedDemoMasterData(tenantId: string) {
  // Vendors
  let createdVendors = 0;
  for (let i = 0; i < DEMO_VENDORS.length; i++) {
    const v = DEMO_VENDORS[i]!;
    const exists = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.tenantId, tenantId), eq(vendors.name, v.name), isNull(vendors.deletedAt)))
      .limit(1);
    if (exists.length > 0) continue;
    await db.insert(vendors).values({
      tenantId,
      code: `V-${String(i + 1).padStart(4, "0")}`,
      name: v.name, legalName: v.legalName, gstin: v.gstin, pan: v.pan,
      contactPerson: v.contactPerson, email: v.email, phone: v.phone,
      city: v.city, state: v.state, pincode: v.pincode,
      country: "IN", paymentTerms: v.paymentTerms, isActive: true,
    });
    createdVendors++;
  }
  logger.info({ created: createdVendors, skipped: DEMO_VENDORS.length - createdVendors }, "vendors_seeded");

  // Items
  let createdItems = 0;
  for (let i = 0; i < DEMO_ITEMS.length; i++) {
    const it = DEMO_ITEMS[i]!;
    const exists = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.tenantId, tenantId), eq(items.name, it.name), isNull(items.deletedAt)))
      .limit(1);
    if (exists.length > 0) continue;
    await db.insert(items).values({
      tenantId,
      code: `I-${String(i + 1).padStart(4, "0")}`,
      name: it.name, description: it.description, category: it.category,
      itemGroupName: it.itemGroupName, itemSubGroupName: it.itemSubGroupName,
      uom: it.uom, hsnCode: it.hsnCode, defaultTaxRate: it.defaultTaxRate,
      isStocked: it.isStocked, isService: it.isService ?? false,
      isAsset: it.isAsset ?? false,
      isActive: true,
    });
    createdItems++;
  }
  logger.info({ created: createdItems, skipped: DEMO_ITEMS.length - createdItems }, "items_seeded");
}

async function main() {
  logger.info("seeding_start");
  await upsertModules();
  await upsertPricingPlans();
  await seedSuperAdmin();
  const tenantId = await seedDemoTenant();
  if (tenantId) {
    await seedDemoMasterData(tenantId);
  }
  logger.info("seeding_complete");
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, "seed_failed");
  process.exit(1);
});
