import { createApp } from "./app.js";
import { port } from "./config/env.js";
import { isConfigured } from "./config/runtimeConfig.js";
import { verifyConnectivity } from "./db/neo4j.js";

async function main() {
  if (isConfigured()) {
    try {
      await verifyConnectivity();
      // eslint-disable-next-line no-console
      console.log("Connected to Neo4j");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Neo4j connectivity check failed at startup (will retry on first query):", err);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log("Setup incomplete — visit the app and complete the Setup Wizard, or fill in server/.env");
  }

  const app = createApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Commissioner's Office server listening on port ${port}`);
  });
}

main();
