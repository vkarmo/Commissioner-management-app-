import neo4j, { Driver, Session } from "neo4j-driver";
import { getConfig } from "../config/runtimeConfig.js";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    const config = getConfig();
    driver = neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword), {
      // Analysis queries (server/src/routes/analysis.routes.ts) aggregate
      // with count()/sum()/size(), which Cypher always returns as its
      // 64-bit Integer type regardless of the underlying property type.
      // Without this, those come back as neo4j-driver Integer objects
      // that don't serialize to plain numbers over JSON. Every amount in
      // this app is well within JS's safe integer range, so there's no
      // precision tradeoff in disabling lossless integers app-wide.
      disableLosslessIntegers: true,
    });
  }
  return driver;
}

export function getSession(mode: "READ" | "WRITE" = "WRITE"): Session {
  return getDriver().session({
    database: getConfig().neo4jDatabase,
    defaultAccessMode: mode === "READ" ? neo4j.session.READ : neo4j.session.WRITE,
  });
}

export async function verifyConnectivity(): Promise<void> {
  await getDriver().verifyConnectivity();
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/** Forces the next getDriver() call to build a fresh driver from the
 *  current config — call after the Setup Wizard saves new Neo4j credentials. */
export async function resetDriver(): Promise<void> {
  await closeDriver();
}
