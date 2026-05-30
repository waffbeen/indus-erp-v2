import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema, refreshSchema, registerSchema } from "@indus/shared";
import * as authService from "../services/auth.service";
import { requireAuth } from "../middleware/auth";
import { verifyRefreshToken } from "../lib/jwt";

export const authRoutes: Router = Router();

// Tight rate limit on auth — defends against brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 attempts / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: "rate_limited", message: "Too many auth requests. Try again later." },
});

authRoutes.post("/login", authLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRoutes.post("/register", authLimiter, async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRoutes.post("/refresh", authLimiter, async (req, res, next) => {
  try {
    const input = refreshSchema.parse(req.body);
    const result = await authService.refresh(input.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRoutes.post("/logout", async (req, res, next) => {
  try {
    const refreshToken = req.body?.refreshToken;
    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        await authService.logout(payload.sid);
      } catch {
        // Already expired/invalid — treat as already logged out
      }
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRoutes.get("/me", requireAuth, async (req, res, next) => {
  try {
    const me = await authService.getMe(req.auth!.sub);
    res.json(me);
  } catch (err) {
    next(err);
  }
});
