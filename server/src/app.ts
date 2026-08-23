import express from "express";
import cors from "cors";
import { getConfig, isConfigured } from "./config/runtimeConfig.js";
import { apiRouter } from "./routes/index.js";
import { setupRouter } from "./routes/setup.routes.js";
import { setupGate } from "./middleware/setupGate.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  // Evaluated per-request (not captured once at boot) so a CORS origin
  // saved later via the Setup Wizard takes effect without a restart.
  app.use(
    cors({
      origin: (_origin, callback) => callback(null, getConfig().corsOrigin),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "commissioners-office-server", configured: isConfigured() });
  });

  app.use("/api/setup", setupRouter);
  app.use("/api", setupGate, apiRouter);

  app.use(errorHandler);

  return app;
}
