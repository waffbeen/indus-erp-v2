import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index";

export const healthRoutes: Router = Router();

healthRoutes.get("/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

healthRoutes.get("/readyz", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ready", db: "connected" });
  } catch (err) {
    res.status(503).json({
      status: "not_ready",
      db: "disconnected",
      error: (err as Error).message,
    });
  }
});
