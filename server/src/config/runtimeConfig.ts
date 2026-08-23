import fs from "node:fs";
import path from "node:path";
import { rawEnv } from "./env.js";

/**
 * Credentials the app needs to run (Neo4j connection, Google OAuth client
 * ID, JWT signing secret, the bootstrap Super Admin) can come from either
 * `.env` (for operators who prefer that) or the in-app Setup Wizard
 * (server/src/routes/setup.routes.ts), which persists them here instead.
 * A value already set in `.env` still works untouched — this file only
 * fills in whatever `.env` left blank, and values saved through the
 * wizard take precedence once they exist.
 */
export interface RuntimeConfig {
  neo4jUri: string;
  neo4jUsername: string;
  neo4jPassword: string;
  neo4jDatabase: string;
  googleClientId: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  bootstrapSuperAdmins: string[];
  bootstrapSuperAdminCounty: string;
  corsOrigin: string;
}

const CONFIG_DIR = path.resolve(process.cwd(), "data");
const CONFIG_PATH = path.join(CONFIG_DIR, "runtime-config.json");

function readFile(): Partial<RuntimeConfig> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

let cache: RuntimeConfig | null = null;

function computeConfig(): RuntimeConfig {
  const file = readFile();
  return {
    neo4jUri: file.neo4jUri || rawEnv.neo4jUri,
    neo4jUsername: file.neo4jUsername || rawEnv.neo4jUsername,
    neo4jPassword: file.neo4jPassword || rawEnv.neo4jPassword,
    neo4jDatabase: file.neo4jDatabase || rawEnv.neo4jDatabase,
    googleClientId: file.googleClientId || rawEnv.googleClientId,
    jwtSecret: file.jwtSecret || rawEnv.jwtSecret,
    jwtExpiresIn: file.jwtExpiresIn || rawEnv.jwtExpiresIn,
    bootstrapSuperAdmins: file.bootstrapSuperAdmins?.length ? file.bootstrapSuperAdmins : rawEnv.bootstrapSuperAdmins,
    bootstrapSuperAdminCounty: file.bootstrapSuperAdminCounty || rawEnv.bootstrapSuperAdminCounty,
    corsOrigin: file.corsOrigin || rawEnv.corsOrigin,
  };
}

/** Current merged config (file overrides env). Cached until saveConfig() invalidates it. */
export function getConfig(): RuntimeConfig {
  if (!cache) cache = computeConfig();
  return cache;
}

const REQUIRED_KEYS: (keyof RuntimeConfig)[] = [
  "neo4jUri",
  "neo4jUsername",
  "neo4jPassword",
  "jwtSecret",
  "googleClientId",
];

export function missingFields(): string[] {
  const c = getConfig();
  const missing = REQUIRED_KEYS.filter((k) => !c[k]);
  if (c.bootstrapSuperAdmins.length === 0) missing.push("bootstrapSuperAdmins");
  return missing;
}

/** True once the app has everything it needs to run without the Setup Wizard. */
export function isConfigured(): boolean {
  return missingFields().length === 0;
}

export function saveConfig(partial: Partial<RuntimeConfig>): RuntimeConfig {
  const current = readFile();
  const merged = { ...current, ...partial };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // best-effort on platforms that don't support chmod
  }
  cache = null;
  return getConfig();
}
