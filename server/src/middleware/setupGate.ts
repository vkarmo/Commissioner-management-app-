import type { NextFunction, Request, Response } from "express";
import { isConfigured } from "../config/runtimeConfig.js";

/**
 * Blocks every route it's mounted in front of until the Setup Wizard has
 * saved the credentials the app needs to run (app.ts mounts this on /api,
 * with /api/setup itself mounted separately, ahead of the gate). The
 * client uses the 503 + setupRequired flag to redirect to the wizard
 * instead of the login screen.
 */
export function setupGate(_req: Request, res: Response, next: NextFunction) {
  if (isConfigured()) {
    next();
    return;
  }
  res.status(503).json({
    error: "Server setup is not complete yet.",
    setupRequired: true,
  });
}
