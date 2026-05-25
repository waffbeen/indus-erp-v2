import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env, allowedOrigins } from "./config/env";
import { logger } from "./lib/logger";
import { apiRouter } from "./routes/index";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp(): express.Express {
  const app = express();

  app.set("trust proxy", 1); // Render/Vercel proxy

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin (no Origin header) and the configured frontend(s)
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    }),
  );

  // API routes mounted under /api
  app.use("/api", apiRouter);

  // Root for sanity
  app.get("/", (_req, res) => {
    res.json({ name: "Indus ERP API", version: "0.1.0" });
  });

  // 404 + error handlers must come last
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
