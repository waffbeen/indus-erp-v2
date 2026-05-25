import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { env } from "../config/env";
import * as schema from "./schema/index";

/**
 * Uses Neon's serverless WebSocket driver (port 443/HTTPS) instead of raw
 * Postgres TCP (port 5432). This works on Indian ISPs / corporate Wi-Fi /
 * anywhere that blocks 5432 outbound, which is increasingly common.
 *
 * Native WebSocket is available in Node 22+; for older Node we polyfill with `ws`.
 */
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === "production" ? 10 : 5,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected DB pool error:", err);
});

export const db = drizzle(pool, { schema, logger: env.NODE_ENV === "development" });
export type DB = typeof db;
export { schema };
