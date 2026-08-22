import neo4j, { Driver, Session } from "neo4j-driver";
import { env } from "../config/env.js";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      env.neo4j.uri,
      neo4j.auth.basic(env.neo4j.username, env.neo4j.password),
    );
  }
  return driver;
}

export function getSession(mode: "READ" | "WRITE" = "WRITE"): Session {
  return getDriver().session({
    database: env.neo4j.database,
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
