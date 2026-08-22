/**
 * Central graph schema definition.
 *
 * This is the single source of truth for every node label the API will
 * create/read/update, and doubles as an allowlist so raw user input can
 * never control a Cypher label or property name (labels/keys are always
 * chosen from this file server-side; only values are parameterized).
 *
 * `scoped: true` means the node carries denormalized `county` + `district`
 * properties (per the design recap §5/§6) so every query can be filtered
 * by tenant without a graph traversal. Hierarchy nodes (County/District/
 * Quarter) and admin nodes (WhitelistEntry/User) are not themselves scoped
 * this way — they *define* scope instead.
 */

export type PropertyType = "string" | "number" | "boolean" | "date";

export interface PropertyDef {
  key: string;
  type: PropertyType;
  required?: boolean;
}

export interface ResourceDef {
  /** Neo4j node label */
  label: string;
  /** Carries county/district scoping properties */
  scoped: boolean;
  properties: PropertyDef[];
}

const common: PropertyDef[] = [
  { key: "id", type: "string", required: true },
  { key: "created_at", type: "date", required: true },
  { key: "updated_at", type: "date", required: true },
  { key: "created_by", type: "string" },
  { key: "updated_by", type: "string" },
  { key: "archived", type: "boolean", required: true },
  { key: "archived_at", type: "date" },
];

const scopeProps: PropertyDef[] = [
  { key: "county", type: "string", required: true },
  { key: "district", type: "string", required: true },
];

function resource(
  label: string,
  scoped: boolean,
  properties: PropertyDef[],
): ResourceDef {
  return {
    label,
    scoped,
    properties: [...common, ...(scoped ? scopeProps : []), ...properties],
  };
}

export const RESOURCES: Record<string, ResourceDef> = {
  // --- Governance hierarchy (defines scope, not scoped itself) ---
  County: resource("County", false, [{ key: "name", type: "string", required: true }]),
  District: resource("District", false, [
    { key: "name", type: "string", required: true },
    { key: "county", type: "string", required: true },
  ]),
  Quarter: resource("Quarter", false, [
    { key: "name", type: "string", required: true },
    { key: "district", type: "string", required: true },
    { key: "county", type: "string", required: true },
  ]),

  // --- Admin / auth ---
  WhitelistEntry: resource("WhitelistEntry", false, [
    { key: "email", type: "string", required: true },
    { key: "role", type: "string", required: true },
    { key: "county", type: "string", required: true },
    { key: "district", type: "string" },
    { key: "active", type: "boolean", required: true },
    { key: "invited_by", type: "string" },
  ]),
  User: resource("User", false, [
    { key: "email", type: "string", required: true },
    { key: "google_sub", type: "string" },
    { key: "name", type: "string" },
    { key: "picture", type: "string" },
    { key: "role", type: "string", required: true },
    { key: "county", type: "string", required: true },
    { key: "district", type: "string" },
    { key: "last_login_at", type: "date" },
  ]),

  // --- Original 7-module schema ---
  Person: resource("Person", true, [
    { key: "full_name", type: "string", required: true },
    { key: "phone", type: "string" },
    { key: "quarter", type: "string" },
    { key: "notes", type: "string" },
  ]),
  Case: resource("Case", true, [
    { key: "case_number", type: "string", required: true },
    { key: "type", type: "string", required: true },
    { key: "status", type: "string", required: true },
    { key: "summary", type: "string" },
    { key: "filed_date", type: "date" },
  ]),
  Parcel: resource("Parcel", true, [
    { key: "parcel_ref", type: "string" },
    { key: "quarter", type: "string" },
    { key: "location_desc", type: "string" },
    { key: "status", type: "string" },
  ]),
  PublicWorksItem: resource("PublicWorksItem", true, [
    { key: "title", type: "string", required: true },
    { key: "category", type: "string" },
    { key: "quarter", type: "string" },
    { key: "status", type: "string", required: true },
    { key: "target_date", type: "date" },
  ]),
  RevenueRecord: resource("RevenueRecord", true, [
    { key: "amount", type: "number", required: true },
    { key: "source", type: "string", required: true },
    { key: "date", type: "date", required: true },
    { key: "receipt_reference", type: "string" },
  ]),
  Meeting: resource("Meeting", true, [
    { key: "title", type: "string", required: true },
    { key: "date", type: "date", required: true },
    { key: "location", type: "string" },
    { key: "minutes", type: "string" },
  ]),
  CommunicationLog: resource("CommunicationLog", true, [
    { key: "channel", type: "string", required: true }, // whatsapp | sms | phone | letter | in_person | email
    { key: "direction", type: "string" }, // inbound | outbound
    { key: "summary", type: "string", required: true },
    { key: "date", type: "date", required: true },
    { key: "contact_name", type: "string" },
    { key: "contact_phone", type: "string" },
  ]),

  // --- Budget / fund-tracking layer (design recap §3) ---
  Budget: resource("Budget", true, [
    { key: "fiscal_year", type: "string", required: true },
    { key: "source", type: "string", required: true },
    { key: "total_amount", type: "number", required: true },
    { key: "status", type: "string", required: true },
  ]),
  BudgetLineItem: resource("BudgetLineItem", true, [
    { key: "category", type: "string", required: true },
    { key: "allocated_amount", type: "number", required: true },
    { key: "quarter_target", type: "string" },
  ]),
  Disbursement: resource("Disbursement", true, [
    { key: "amount", type: "number", required: true },
    { key: "date", type: "date", required: true },
    { key: "purpose", type: "string" },
    { key: "reference_number", type: "string" },
  ]),
  Expenditure: resource("Expenditure", true, [
    { key: "amount", type: "number", required: true },
    { key: "date", type: "date", required: true },
    { key: "payee", type: "string", required: true },
    { key: "receipt_reference", type: "string" },
  ]),
  ApprovalAction: resource("ApprovalAction", true, [
    { key: "date", type: "date", required: true },
    { key: "decision", type: "string", required: true }, // approved | rejected | pending | revised
    { key: "approving_body", type: "string", required: true }, // County Council | Superintendent | Finance Officer
    { key: "notes", type: "string" },
  ]),

  // --- Offline sync bookkeeping ---
  SyncConflict: resource("SyncConflict", false, [
    { key: "entity_label", type: "string", required: true },
    { key: "entity_id", type: "string", required: true },
    { key: "county", type: "string", required: true },
    { key: "district", type: "string" },
    { key: "client_value", type: "string", required: true },
    { key: "server_value", type: "string", required: true },
    { key: "client_updated_at", type: "date", required: true },
    { key: "server_updated_at", type: "date", required: true },
    { key: "resolved", type: "boolean", required: true },
    { key: "resolved_by", type: "string" },
    { key: "resolved_at", type: "date" },
  ]),
};

export type ResourceName = keyof typeof RESOURCES;

export function getResourceDef(name: string): ResourceDef {
  const def = RESOURCES[name as ResourceName];
  if (!def) {
    throw new Error(`Unknown resource: ${name}`);
  }
  return def;
}

/**
 * Allowlisted relationship types the API can create between two resources.
 * Mirrors design recap §3 and the original person -> parcel -> case model.
 */
export interface RelationshipDef {
  type: string; // Neo4j relationship type
  from: ResourceName;
  to: ResourceName;
}

export const RELATIONSHIPS: RelationshipDef[] = [
  { type: "WITHIN", from: "District", to: "County" },
  { type: "WITHIN", from: "Quarter", to: "District" },

  { type: "INVOLVES", from: "Case", to: "Person" },
  { type: "CONCERNS", from: "Case", to: "Parcel" },
  { type: "LOCATED_IN", from: "Parcel", to: "Quarter" },
  { type: "LOCATED_IN", from: "PublicWorksItem", to: "Quarter" },
  { type: "PAID_BY", from: "RevenueRecord", to: "Person" },
  { type: "CONCERNS", from: "Meeting", to: "Case" },
  { type: "REGARDING_PERSON", from: "CommunicationLog", to: "Person" },
  { type: "REGARDING_CASE", from: "CommunicationLog", to: "Case" },

  { type: "ALLOCATED_TO", from: "Budget", to: "BudgetLineItem" },
  { type: "FUNDS", from: "BudgetLineItem", to: "PublicWorksItem" },
  { type: "ON", from: "ApprovalAction", to: "Budget" },
  { type: "DISBURSED_AS", from: "BudgetLineItem", to: "Disbursement" },
  { type: "SPENT_AS", from: "Disbursement", to: "Expenditure" },
  { type: "TARGETS", from: "BudgetLineItem", to: "Quarter" },
  { type: "RECORDED_VIA", from: "ApprovalAction", to: "CommunicationLog" },
];

export function isRelationshipAllowed(
  type: string,
  from: string,
  to: string,
): boolean {
  return RELATIONSHIPS.some(
    (r) => r.type === type && r.from === from && r.to === to,
  );
}

/** Office-scoped roles operate within a single county+district. */
export const OFFICE_ROLES = ["Clerk", "Official", "Commissioner", "SuperAdmin"] as const;

/** County-scoped roles (schema-only for MVP per design recap §4/§6). */
export const COUNTY_ROLES = [
  "CountyFinanceOfficer",
  "CountySuperintendentOffice",
  "CountySuperAdmin",
] as const;

export const ALL_ROLES = [...OFFICE_ROLES, ...COUNTY_ROLES] as const;
export type Role = (typeof ALL_ROLES)[number];
