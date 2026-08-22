import type { Role } from "./resources.js";

/** Day-to-day office staff — the primary users of this system today. */
export const OFFICE_STAFF: Role[] = ["Clerk", "Official", "Commissioner", "SuperAdmin"];

/** County-level finance/admin roles — schema-only until a second district goes live. */
export const COUNTY_FINANCE: Role[] = ["CountyFinanceOfficer", "CountySuperAdmin"];

/** Everyone who may read aggregated county-level fund status. */
export const COUNTY_AGGREGATE_READERS: Role[] = [
  "CountyFinanceOfficer",
  "CountySuperintendentOffice",
  "CountySuperAdmin",
];

export const ANY_ADMIN: Role[] = ["SuperAdmin", "CountySuperAdmin"];
