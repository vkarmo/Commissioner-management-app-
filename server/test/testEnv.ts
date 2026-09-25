/**
 * Guards the whole Phase 0 test suite on a fully-specified, standalone
 * .env.test — never partially falls through to the real .env. If any
 * required key is missing from .env.test, tests skip themselves instead
 * of silently picking up whatever the real .env happens to hold (which
 * would risk seeding fixture data into a real database, since dotenv
 * never overwrites a key that's already set — see test/setup.ts).
 */
const REQUIRED_KEYS = [
  "NEO4J_URI",
  "NEO4J_USERNAME",
  "NEO4J_PASSWORD",
  "NEO4J_DATABASE",
  "GOOGLE_CLIENT_ID",
  "JWT_SECRET",
  "BOOTSTRAP_SUPER_ADMINS",
  "BOOTSTRAP_SUPER_ADMIN_COUNTY",
] as const;

export const missingTestEnvKeys = REQUIRED_KEYS.filter((k) => !process.env[k]);
export const hasTestDb = missingTestEnvKeys.length === 0;

export const skipReason = hasTestDb
  ? ""
  : `Skipping — server/.env.test is missing: ${missingTestEnvKeys.join(", ")}. ` +
    "Copy .env.test.example, point it at a disposable/test Neo4j instance (never production), then re-run.";
