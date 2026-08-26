import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { getConfig, isConfigured } from "./config/runtimeConfig.js";
import { apiRouter } from "./routes/index.js";
import { setupRouter } from "./routes/setup.routes.js";
import { setupGate } from "./middleware/setupGate.js";
import { errorHandler } from "./middleware/errorHandler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  // Serves the built client as a single combined deployment (see the
  // repo-root Dockerfile) when it's actually present — i.e. never during
  // local `npm run dev`, only in the combined Docker image, which copies
  // the client's build output here. The two-service split deployment
  // (server/Dockerfile + client/Dockerfile) just never populates this
  // directory, so this block is a no-op for it.
  const publicDir = path.join(__dirname, "../public");
  const indexHtmlPath = path.join(publicDir, "index.html");
  if (fs.existsSync(indexHtmlPath)) {
    app.use(express.static(publicDir));
    // Client-side routing (react-router-dom's BrowserRouter) needs every
    // non-API, non-static path to fall back to index.html.
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(indexHtmlPath);
    });
  }

  app.use(errorHandler);

  return app;
}
