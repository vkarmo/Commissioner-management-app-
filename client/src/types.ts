export const OFFICE_ROLES = ["Clerk", "Official", "Commissioner", "SuperAdmin"] as const;
export const COUNTY_ROLES = [
  "CountyFinanceOfficer",
  "CountySuperintendentOffice",
  "CountySuperAdmin",
] as const;
export const ALL_ROLES = [...OFFICE_ROLES, ...COUNTY_ROLES] as const;
export type Role = (typeof ALL_ROLES)[number];

export interface SessionUser {
  email: string;
  name?: string;
  picture?: string;
  role: Role;
  county: string;
  district?: string;
}

/** Every module resource extends this shape (see server/src/schema/resources.ts). */
export interface BaseRecord {
  id: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  archived: boolean;
  archived_at?: string;
  county?: string;
  district?: string;
  [key: string]: unknown;
}

export interface ResourceModule {
  key: string; // API path segment, e.g. "cases"
  resource: string; // graph label, e.g. "Case"
  label: string; // human-readable, e.g. "Cases"
  fields: FieldConfig[];
  titleField: string; // which field to show as the row title
  group: string; // sidebar section heading, e.g. "Case & Land"
}

export interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  required?: boolean;
  options?: string[];
}
