import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  neo4j: {
    uri: required("NEO4J_URI", "neo4j://localhost:7687"),
    username: required("NEO4J_USERNAME", "neo4j"),
    password: required("NEO4J_PASSWORD", "neo4j"),
    database: process.env.NEO4J_DATABASE || "neo4j",
  },
  auth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
    bootstrapSuperAdmins: (process.env.BOOTSTRAP_SUPER_ADMINS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    bootstrapSuperAdminCounty: process.env.BOOTSTRAP_SUPER_ADMIN_COUNTY || "",
  },
  server: {
    port: Number(process.env.PORT || 4000),
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
};
