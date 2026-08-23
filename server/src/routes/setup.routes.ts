import crypto from "node:crypto";
import { Router } from "express";
import neo4j from "neo4j-driver";
import { z } from "zod";
import { getConfig, isConfigured, missingFields, saveConfig } from "../config/runtimeConfig.js";
import { resetDriver } from "../db/neo4j.js";
import { verifySessionToken } from "../auth/session.js";
import { ANY_ADMIN } from "../schema/roleGroups.js";

export const setupRouter = Router();

/**
 * Before initial setup this endpoint is intentionally open (there is no
 * whitelist, no admin, nothing to authenticate against yet — this is the
 * same first-run bootstrap tradeoff as any self-hosted app installer).
 * Once isConfigured() is true, further changes require a signed-in
 * SuperAdmin/CountySuperAdmin, checked here directly since this router is
 * mounted ahead of the normal requireAuth/setupGate chain in app.ts.
 */
function isCallerAdmin(req: import("express").Request): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  try {
    const user = verifySessionToken(header.slice("Bearer ".length));
    return (ANY_ADMIN as string[]).includes(user.role);
  } catch {
    return false;
  }
}

function requireAdminIfAlreadyConfigured(req: import("express").Request, res: import("express").Response): boolean {
  if (!isConfigured()) return true;
  if (!isCallerAdmin(req)) {
    res.status(401).json({ error: "Sign in as a Super Admin to change setup after initial configuration" });
    return false;
  }
  return true;
}

setupRouter.get("/status", (req, res) => {
  const config = getConfig();
  const configured = isConfigured();

  // Before initial setup, prefill values (e.g. from .env) are safe to
  // return since there's no admin account yet to protect them from. Once
  // configured, only an authenticated admin gets the reconfigure prefill —
  // everyone else just needs `configured` (for routing) and the Google
  // client ID (not a secret; the Login page's Sign-In button needs it).
  const canSeeDetails = !configured || isCallerAdmin(req);

  res.json({
    configured,
    missing: missingFields(),
    googleClientId: config.googleClientId,
    hasNeo4jPassword: Boolean(config.neo4jPassword),
    hasJwtSecret: Boolean(config.jwtSecret),
    ...(canSeeDetails
      ? {
          neo4jUri: config.neo4jUri,
          neo4jDatabase: config.neo4jDatabase,
          neo4jUsername: config.neo4jUsername,
          corsOrigin: config.corsOrigin,
          bootstrapSuperAdminCounty: config.bootstrapSuperAdminCounty,
          bootstrapSuperAdmins: config.bootstrapSuperAdmins,
        }
      : {}),
  });
});

const connectionSchema = z.object({
  neo4jUri: z.string().min(1),
  neo4jUsername: z.string().min(1),
  neo4jPassword: z.string().min(1),
  neo4jDatabase: z.string().min(1).default("neo4j"),
});

async function testNeo4jConnection(creds: z.infer<typeof connectionSchema>): Promise<{ ok: boolean; error?: string }> {
  // A short connectionTimeout so a typo'd/unreachable host fails the
  // wizard in seconds instead of the driver's ~30s default.
  const driver = neo4j.driver(creds.neo4jUri, neo4j.auth.basic(creds.neo4jUsername, creds.neo4jPassword), {
    connectionTimeout: 8000,
  });
  try {
    await driver.verifyConnectivity({ database: creds.neo4jDatabase });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not connect to Neo4j" };
  } finally {
    await driver.close();
  }
}

setupRouter.post("/test-connection", async (req, res) => {
  const parsed = connectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const result = await testNeo4jConnection(parsed.data);
  res.json(result);
});

const configureSchema = z.object({
  neo4jUri: z.string().min(1),
  neo4jUsername: z.string().min(1),
  neo4jPassword: z.string().min(1),
  neo4jDatabase: z.string().min(1).default("neo4j"),
  googleClientId: z.string().min(1),
  jwtSecret: z.string().min(16).optional(),
  bootstrapSuperAdmins: z.array(z.string().email()).min(1),
  bootstrapSuperAdminCounty: z.string().min(1),
  corsOrigin: z.string().min(1).optional(),
});

setupRouter.post("/configure", async (req, res) => {
  if (!requireAdminIfAlreadyConfigured(req, res)) return;

  const parsed = configureSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
    return;
  }
  const input = parsed.data;

  const connectionCheck = await testNeo4jConnection({
    neo4jUri: input.neo4jUri,
    neo4jUsername: input.neo4jUsername,
    neo4jPassword: input.neo4jPassword,
    neo4jDatabase: input.neo4jDatabase,
  });
  if (!connectionCheck.ok) {
    res.status(400).json({ error: `Could not connect to Neo4j with those credentials: ${connectionCheck.error}` });
    return;
  }

  // Preserve the existing secret on a reconfigure where the admin left it
  // blank — the field is never prefilled with the real value (see
  // /status), so an empty submit must not silently rotate it and log
  // everyone out. Only a genuinely first-time setup generates a new one.
  const jwtSecret = input.jwtSecret || getConfig().jwtSecret || crypto.randomBytes(48).toString("hex");

  const updated = saveConfig({
    neo4jUri: input.neo4jUri,
    neo4jUsername: input.neo4jUsername,
    neo4jPassword: input.neo4jPassword,
    neo4jDatabase: input.neo4jDatabase,
    googleClientId: input.googleClientId,
    jwtSecret,
    bootstrapSuperAdmins: input.bootstrapSuperAdmins.map((e) => e.toLowerCase()),
    bootstrapSuperAdminCounty: input.bootstrapSuperAdminCounty,
    ...(input.corsOrigin ? { corsOrigin: input.corsOrigin } : {}),
  });

  await resetDriver();

  res.json({
    configured: isConfigured(),
    neo4jUri: updated.neo4jUri,
    neo4jDatabase: updated.neo4jDatabase,
    googleClientId: updated.googleClientId,
    corsOrigin: updated.corsOrigin,
    bootstrapSuperAdminCounty: updated.bootstrapSuperAdminCounty,
  });
});
