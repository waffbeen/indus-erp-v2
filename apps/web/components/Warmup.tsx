"use client";
import { useEffect } from "react";

/**
 * Render free tier sleeps after 15 minutes idle; the first request then takes
 * ~30 seconds to wake the dyno. By firing /api/healthz the moment the page
 * loads (before the user clicks anything), the cold-start happens in the
 * background while they're still reading the login screen — so by the time
 * they actually need an API response, the server is warm.
 *
 * Safe to fire on every page navigation — the call is cheap and Render
 * doesn't count it against any quota that matters here.
 */
export function Warmup() {
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "";
    if (!base) return;
    // Fire-and-forget — we don't care about the response, only that the
    // request lands and warms the instance.
    fetch(`${base}/api/healthz`, { method: "GET", credentials: "omit" }).catch(() => {
      /* network errors are expected during cold start; ignore */
    });
  }, []);
  return null;
}
