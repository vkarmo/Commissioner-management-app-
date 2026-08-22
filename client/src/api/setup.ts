import { api } from "./client";

export interface SetupStatus {
  configured: boolean;
  missing: string[];
  googleClientId: string;
  hasNeo4jPassword: boolean;
  hasJwtSecret: boolean;
  neo4jUri?: string;
  neo4jDatabase?: string;
  neo4jUsername?: string;
  corsOrigin?: string;
  bootstrapSuperAdminCounty?: string;
  bootstrapSuperAdmins?: string[];
}

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
}

export interface SetupPayload {
  neo4jUri: string;
  neo4jUsername: string;
  neo4jPassword: string;
  neo4jDatabase: string;
  googleClientId: string;
  jwtSecret?: string;
  bootstrapSuperAdmins: string[];
  bootstrapSuperAdminCounty: string;
  corsOrigin?: string;
}

export function getSetupStatus() {
  return api.get<SetupStatus>("/setup/status");
}

export function testNeo4jConnection(payload: {
  neo4jUri: string;
  neo4jUsername: string;
  neo4jPassword: string;
  neo4jDatabase: string;
}) {
  return api.post<ConnectionTestResult>("/setup/test-connection", payload);
}

export function submitSetup(payload: SetupPayload) {
  return api.post<SetupStatus>("/setup/configure", payload);
}
