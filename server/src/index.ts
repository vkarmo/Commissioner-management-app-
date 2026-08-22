import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { verifyConnectivity } from "./db/neo4j.js";

async function main() {
  try {
    await verifyConnectivity();
    // eslint-disable-next-line no-console
    console.log("Connected to Neo4j");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Neo4j connectivity check failed at startup (will retry on first query):", err);
  }

  const app = createApp();
  app.listen(env.server.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Commissioner's Office server listening on port ${env.server.port}`);
  });
}

main();
