import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.server.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "commissioners-office-server" });
  });

  app.use("/api", apiRouter);

  app.use(errorHandler);

  return app;
}
