import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";

const app = createApp();

const server = app.listen(env.API_PORT, () => {
  logger.info(
    { port: env.API_PORT, env: env.NODE_ENV, origin: env.API_ORIGIN },
    "indus_api_listening",
  );
});

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info({ signal }, "shutting_down");
  server.close((err) => {
    if (err) {
      logger.error(err, "shutdown_error");
      process.exit(1);
    }
    process.exit(0);
  });
  // Force exit if not closed in 10s
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => logger.error({ reason }, "unhandled_rejection"));
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught_exception");
  process.exit(1);
});
