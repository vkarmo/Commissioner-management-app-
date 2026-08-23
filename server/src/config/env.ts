import "dotenv/config";

/**
 * Raw process-env values, read once at boot. This is only the *seed* layer
 * for runtimeConfig.ts — nothing here throws on a missing value, because a
 * fresh deployment is allowed to have none of this set and instead
 * complete the in-app Setup Wizard (see runtimeConfig.ts). Anything that
 * actually needs a config value at request time should import from
 * runtimeConfig.ts's `getConfig()`, not from here.
 */
export const rawEnv = {
  neo4jUri: process.env.NEO4J_URI || "",
  neo4jUsername: process.env.NEO4J_USERNAME || "",
  neo4jPassword: process.env.NEO4J_PASSWORD || "",
  neo4jDatabase: process.env.NEO4J_DATABASE || "neo4j",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  bootstrapSuperAdmins: (process.env.BOOTSTRAP_SUPER_ADMINS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  bootstrapSuperAdminCounty: process.env.BOOTSTRAP_SUPER_ADMIN_COUNTY || "",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
};

/** Port is a deployment-time concern (the process must already be listening
 *  somewhere before a Setup Wizard request could ever reach it), so unlike
 *  everything else above it is never runtime-configurable. */
export const port = Number(process.env.PORT || 4000);
