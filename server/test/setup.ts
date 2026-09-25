import dotenv from "dotenv";

// Loads server/.env.test (never .env — that's your normal dev/prod config
// and this suite creates and deletes real graph data, so it must never
// run against a real database). If .env.test is missing, tests that need
// a live Neo4j connection skip themselves with a clear message instead of
// silently falling back to whatever .env happens to hold.
dotenv.config({ path: ".env.test" });
