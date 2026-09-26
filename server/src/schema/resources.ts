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
  /**
   * Kept for backward compatibility (older clients, existing data) but no
   * longer the source of truth — the server derives it from a relationship
   * on write (see graphService.relate()) and it can be overwritten there.
   */
  deprecated?: boolean;
  deprecatedNote?: string;
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
    // Community Registry (build prompt §3): basic per-quarter directory data.
    // Deprecated by Phase 1 M2 (schema-patch spec, 2026-09-25): once a
    // CHIEF_OF edge exists for this quarter, these are derived from it on
    // every write, so they can no longer drift from Person data.
    {
      key: "chief_name",
      type: "string",
      deprecated: true,
      deprecatedNote: "Derived from the quarter's CHIEF_OF Person once that edge exists.",
    },
    {
      key: "chief_phone",
      type: "string",
      deprecated: true,
      deprecatedNote: "Derived from the quarter's CHIEF_OF Person once that edge exists.",
    },
    { key: "population", type: "number" },
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
    { key: "role", type: "string" }, // citizen | official | clerk
    // Deprecated by Phase 1 M2 (schema-patch spec, 2026-09-25): set from the
    // CHIEF_OF edge on write instead of edited directly, once that edge
    // exists — see graphService.relate().
    {
      key: "is_quarter_chief",
      type: "boolean",
      deprecated: true,
      deprecatedNote: "Derived from a CHIEF_OF edge to a Quarter once that edge exists.",
    },
    { key: "notes", type: "string" },
  ]),
  Case: resource("Case", true, [
    { key: "case_number", type: "string", required: true },
    { key: "type", type: "string", required: true }, // land | family | debt | chieftaincy | criminal-referral | other
    { key: "status", type: "string", required: true }, // intake_pending | open | mediation | resolved | referred
    { key: "quarter", type: "string" },
    { key: "summary", type: "string" },
    { key: "filed_date", type: "date" },
    // Populated when filed via the SMS/WhatsApp intake stub, before a clerk
    // has linked a real Person record for reporter/respondent.
    { key: "reporter_name", type: "string" },
    { key: "reporter_phone", type: "string" },
    { key: "respondent_name", type: "string" },
    // Set by migration M4 (Phase 1.5, schema-patch spec, 2026-09-25) on a
    // Case created to replace a retired Dispute — see m4RetireDisputes.ts.
    { key: "legacy_dispute_id", type: "string" },
  ]),
  Parcel: resource("Parcel", true, [
    { key: "parcel_ref", type: "string" },
    { key: "quarter", type: "string" },
    { key: "location_desc", type: "string" },
    { key: "status", type: "string" },
    { key: "acreage", type: "number" },
    { key: "land_use", type: "string" },
    // Metes-and-bounds geometry, stored as a GeoJSON string (build prompt §Land
    // Records "stretch goal"); parsed client-side only where present, never
    // required — most offices won't have surveyed geometry to enter.
    { key: "geometry_geojson", type: "string" },
  ]),
  PublicWorksItem: resource("PublicWorksItem", true, [
    { key: "title", type: "string", required: true },
    { key: "category", type: "string" }, // road | water_point | school | clinic | other
    { key: "quarter", type: "string" },
    { key: "status", type: "string", required: true },
    { key: "target_date", type: "date" },
    { key: "gps_lat", type: "number" },
    { key: "gps_lng", type: "number" },
    { key: "photo_reference", type: "string" },
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

  // --- Case Tracker / Land Records support entities ---
  Official: resource("Official", true, [
    { key: "full_name", type: "string", required: true },
    { key: "role", type: "string", required: true }, // commissioner | clerk | chief | other
    { key: "office_title", type: "string" },
    { key: "phone", type: "string" },
  ]),
  Hearing: resource("Hearing", true, [
    { key: "date", type: "date", required: true },
    { key: "location", type: "string" },
    { key: "outcome_notes", type: "string" },
  ]),
  Deed: resource("Deed", true, [
    { key: "deed_number", type: "string", required: true },
    { key: "issue_date", type: "date" },
    { key: "type", type: "string" }, // tribal_certificate | deed_of_gift | lease
  ]),
  // Retired (Phase 1.5, schema-patch spec, 2026-09-25 — office decision:
  // retire Dispute). Migration M4 (m4RetireDisputes.ts) replaces each with
  // a Case{type:'land'} and archives it; the resource stays defined, and
  // SUBJECT_OF stays in the allowlist below, so existing/legacy Disputes
  // remain readable until a real-database check confirms none are left
  // unarchived — see the migration's `remainingUnarchivedDisputes` count.
  // Creating a new one is disabled in the API (routes/index.ts) and the
  // client (modules.ts) — this resource takes no new data going forward.
  Dispute: resource("Dispute", true, [
    { key: "status", type: "string", required: true }, // open | resolved
    { key: "notes", type: "string" },
  ]),

  // --- Fire Incident Reporting (build prompt module 8) ---
  FireIncident: resource("FireIncident", true, [
    { key: "incident_type", type: "string", required: true }, // structure | market | bush | electrical | other
    { key: "quarter", type: "string" },
    { key: "date_reported", type: "date", required: true },
    // reported | responding | contained | resolved | referred_to_lnfs
    { key: "status", type: "string", required: true },
    { key: "casualties", type: "string" },
    { key: "estimated_damage", type: "string" },
    // Set by the scout-report action (minor | moderate | severe), or
    // editable by hand; visible on the incident so a clerk can triage
    // without opening every linked CommunicationLog entry.
    { key: "severity", type: "string" },
    { key: "description", type: "string" },
    { key: "photo_reference", type: "string" },
    { key: "gps_lat", type: "number" },
    { key: "gps_lng", type: "number" },
    { key: "reporter_name", type: "string" },
    { key: "reporter_phone", type: "string" },
  ]),
  // Optional per office — most Commissioner's Offices have no local station
  // and rely entirely on FireAgency referral (build prompt module 8).
  FireStation: resource("FireStation", true, [
    { key: "name", type: "string" },
    { key: "status", type: "string", required: true }, // operational | under_construction
    { key: "gps_lat", type: "number" },
    { key: "gps_lng", type: "number" },
  ]),
  FireApparatus: resource("FireApparatus", true, [
    { key: "type", type: "string", required: true }, // truck
    { key: "status", type: "string", required: true }, // operational | maintenance | out_of_service
    { key: "acquisition_date", type: "date" },
  ]),
  // Not an app user/role — an external body (e.g. LNFS), same treatment as
  // County Council in the ApprovalAction/RECORDED_VIA pattern.
  FireAgency: resource("FireAgency", true, [
    { key: "name", type: "string", required: true },
    { key: "contact", type: "string" },
    { key: "station_location", type: "string" },
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

  // Phase 1 (schema-patch spec, 2026-09-25): 1.1 makes the existing
  // Person.quarter string an edge; 1.2 makes chief data an edge instead of
  // duplicated Quarter/Person properties. Both are derived/kept consistent
  // by graphService.relate() rather than left to callers.
  { type: "LIVES_IN", from: "Person", to: "Quarter" },
  { type: "CHIEF_OF", from: "Person", to: "Quarter" },

  { type: "FILED", from: "Person", to: "Case" },
  { type: "NAMED_IN", from: "Person", to: "Case" },
  { type: "INVOLVES", from: "Case", to: "Person" },
  { type: "CONCERNS", from: "Case", to: "Parcel" },
  { type: "HEARD_AT", from: "Case", to: "Hearing" },
  { type: "PRESIDED_OVER", from: "Official", to: "Hearing" },
  { type: "REFERRED_TO", from: "Case", to: "Official" },
  { type: "LOCATED_IN", from: "Case", to: "Quarter" },
  { type: "LOCATED_IN", from: "Parcel", to: "Quarter" },
  { type: "LOCATED_IN", from: "PublicWorksItem", to: "Quarter" },
  { type: "HOLDS", from: "Person", to: "Deed" },
  { type: "COVERS", from: "Deed", to: "Parcel" },
  { type: "ADJACENT_TO", from: "Parcel", to: "Parcel" },
  // Retired (Phase 1.5): stays allowlisted only so existing Dispute data
  // remains readable — remove once no unarchived Disputes remain (see the
  // Dispute resource def above and m4RetireDisputes.ts).
  { type: "SUBJECT_OF", from: "Parcel", to: "Dispute" },
  { type: "PAID_BY", from: "RevenueRecord", to: "Person" },
  { type: "CONCERNS", from: "Meeting", to: "Case" },
  { type: "REGARDING_PERSON", from: "CommunicationLog", to: "Person" },
  { type: "REGARDING_CASE", from: "CommunicationLog", to: "Case" },

  { type: "REPORTED", from: "Person", to: "FireIncident" },
  { type: "LOCATED_IN", from: "FireIncident", to: "Quarter" },
  { type: "NEAR", from: "FireIncident", to: "PublicWorksItem" },
  { type: "PART_OF", from: "FireStation", to: "Official" },
  { type: "STATIONED_AT", from: "FireApparatus", to: "FireStation" },
  { type: "RESPONDED_BY", from: "FireIncident", to: "FireStation" },
  { type: "REFERRED_TO", from: "FireIncident", to: "FireAgency" },
  { type: "LINKED_TO", from: "FireIncident", to: "CommunicationLog" },
  { type: "LOGGED", from: "Official", to: "FireIncident" },
  { type: "SCOUTED", from: "Person", to: "FireIncident" },
  { type: "SCOUTED", from: "Official", to: "FireIncident" },

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
