import type { NextFunction, Request, Response } from "express";
import { verifySessionToken } from "../auth/session.js";
import type { Role } from "../schema/resources.js";
import type { Scope } from "../types/index.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  try {
    req.user = verifySessionToken(header.slice("Bearer ".length));
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient role for this action" });
      return;
    }
    next();
  };
}

/** Derives the tenant scope from the authenticated user. */
export function scopeFromRequest(req: Request): Scope {
  if (!req.user) {
    throw new Error("scopeFromRequest called without an authenticated user");
  }
  return { county: req.user.county, district: req.user.district };
}
