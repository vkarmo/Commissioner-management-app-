# Commissioner's Office — Neo4j Graph Schema

Auto-generated from `server/src/schema/resources.ts` (single source of
truth for the API). Regenerate this file whenever that file changes —
per the schema-patch spec's acceptance criteria, at the end of every
phase, even phases (like Phase 0) that don't touch it.

**Phase 0** (2026-09-25) added a read-only analysis layer
(`GET /api/analysis/*`, `server/src/routes/analysis.routes.ts`) with no
schema changes — the tables below are unchanged from before it landed.

This is a **property graph** (Neo4j), not a relational schema — nodes
carry properties directly (no separate columns/tables), and relationships
are typed, directed edges between node labels. Every property is stored
as a string/number/boolean/ISO-date on the node; there are no foreign
keys, only graph relationships.

## Conventions

- **Scoped resources** carry `county` (required) and `district`
  (required) properties for multi-tenant filtering — every query is
  scoped by the caller's assigned county/district.
- **Unscoped resources** either *define* scope (County/District/Quarter)
  or are admin/system bookkeeping (WhitelistEntry, User, SyncConflict).
- Every resource also carries these **common properties**, omitted from
  the tables below for brevity:

| Property | Type | Required |
|---|---|---|
| `id` | string | yes |
| `created_at` | date | yes |
| `updated_at` | date | yes |
| `created_by` | string | no |
| `updated_by` | string | no |
| `archived` | boolean | yes |
| `archived_at` | date | no |

- **Scoped resources** additionally carry:

| Property | Type | Required |
|---|---|---|
| `county` | string | yes |
| `district` | string | yes |

---

## Nodes

### Governance hierarchy (unscoped — defines scope)

**County**
| Property | Type | Required |
|---|---|---|
| `name` | string | yes |

**District**
| Property | Type | Required |
|---|---|---|
| `name` | string | yes |
| `county` | string | yes |

**Quarter**
| Property | Type | Required |
|---|---|---|
| `name` | string | yes |
| `district` | string | yes |
| `county` | string | yes |
| `chief_name` | string | no |
| `chief_phone` | string | no |
| `population` | number | no |

### Admin / auth (unscoped)

**WhitelistEntry**
| Property | Type | Required |
|---|---|---|
| `email` | string | yes |
| `role` | string | yes |
| `county` | string | yes |
| `district` | string | no |
| `active` | boolean | yes |
| `invited_by` | string | no |

**User**
| Property | Type | Required |
|---|---|---|
| `email` | string | yes |
| `google_sub` | string | no |
| `name` | string | no |
| `picture` | string | no |
| `role` | string | yes |
| `county` | string | yes |
| `district` | string | no |
| `last_login_at` | date | no |

### Core modules (scoped: county + district)

**Person**
| Property | Type | Required | Notes |
|---|---|---|---|
| `full_name` | string | yes | |
| `phone` | string | no | |
| `quarter` | string | no | |
| `role` | string | no | citizen \| official \| clerk |
| `is_quarter_chief` | boolean | no | |
| `notes` | string | no | |

**Case**
| Property | Type | Required | Notes |
|---|---|---|---|
| `case_number` | string | yes | |
| `type` | string | yes | land \| family \| debt \| chieftaincy \| criminal-referral \| other |
| `status` | string | yes | intake_pending \| open \| mediation \| resolved \| referred |
| `quarter` | string | no | |
| `summary` | string | no | |
| `filed_date` | date | no | |
| `reporter_name` | string | no | populated by SMS/WhatsApp intake stub |
| `reporter_phone` | string | no | |
| `respondent_name` | string | no | |

**Parcel**
| Property | Type | Required | Notes |
|---|---|---|---|
| `parcel_ref` | string | no | |
| `quarter` | string | no | |
| `location_desc` | string | no | |
| `status` | string | no | |
| `acreage` | number | no | |
| `land_use` | string | no | |
| `geometry_geojson` | string | no | optional metes-and-bounds GeoJSON |

**PublicWorksItem**
| Property | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | |
| `category` | string | no | road \| water_point \| school \| clinic \| other |
| `quarter` | string | no | |
| `status` | string | yes | |
| `target_date` | date | no | |
| `gps_lat` | number | no | |
| `gps_lng` | number | no | |
| `photo_reference` | string | no | URL/reference only, no upload pipeline yet |

**RevenueRecord**
| Property | Type | Required |
|---|---|---|
| `amount` | number | yes |
| `source` | string | yes |
| `date` | date | yes |
| `receipt_reference` | string | no |

**Meeting**
| Property | Type | Required |
|---|---|---|
| `title` | string | yes |
| `date` | date | yes |
| `location` | string | no |
| `minutes` | string | no |

**CommunicationLog**
| Property | Type | Required | Notes |
|---|---|---|---|
| `channel` | string | yes | whatsapp \| sms \| phone \| radio \| letter \| in_person \| email |
| `direction` | string | no | inbound \| outbound |
| `summary` | string | yes | |
| `date` | date | yes | |
| `contact_name` | string | no | |
| `contact_phone` | string | no | |

### Case Tracker / Land Records support entities (scoped)

**Official**
| Property | Type | Required | Notes |
|---|---|---|---|
| `full_name` | string | yes | |
| `role` | string | yes | commissioner \| clerk \| chief \| other |
| `office_title` | string | no | |
| `phone` | string | no | |

**Hearing**
| Property | Type | Required |
|---|---|---|
| `date` | date | yes |
| `location` | string | no |
| `outcome_notes` | string | no |

**Deed**
| Property | Type | Required | Notes |
|---|---|---|---|
| `deed_number` | string | yes | |
| `issue_date` | date | no | |
| `type` | string | no | tribal_certificate \| deed_of_gift \| lease |

**Dispute**
| Property | Type | Required | Notes |
|---|---|---|---|
| `status` | string | yes | open \| resolved |
| `notes` | string | no | |

### Fire Incident Reporting (scoped)

**FireIncident**
| Property | Type | Required | Notes |
|---|---|---|---|
| `incident_type` | string | yes | structure \| market \| bush \| electrical \| other |
| `quarter` | string | no | |
| `date_reported` | date | yes | |
| `status` | string | yes | reported \| scout_dispatched \| responding \| contained \| resolved \| referred_to_lnfs |
| `casualties` | string | no | |
| `estimated_damage` | string | no | |
| `severity` | string | no | minor \| moderate \| severe — set by scout-report action or by hand |
| `description` | string | no | |
| `photo_reference` | string | no | |
| `gps_lat` | number | no | |
| `gps_lng` | number | no | |
| `reporter_name` | string | no | |
| `reporter_phone` | string | no | |

**FireStation** (optional per office)
| Property | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | |
| `status` | string | yes | operational \| under_construction |
| `gps_lat` | number | no | |
| `gps_lng` | number | no | |

**FireApparatus**
| Property | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | e.g. truck |
| `status` | string | yes | operational \| maintenance \| out_of_service |
| `acquisition_date` | date | no | |

**FireAgency** (external body, e.g. LNFS — not an app user/role)
| Property | Type | Required |
|---|---|---|
| `name` | string | yes |
| `contact` | string | no |
| `station_location` | string | no |

### Budget / fund-tracking layer (scoped)

**Budget**
| Property | Type | Required |
|---|---|---|
| `fiscal_year` | string | yes |
| `source` | string | yes |
| `total_amount` | number | yes |
| `status` | string | yes |

**BudgetLineItem**
| Property | Type | Required |
|---|---|---|
| `category` | string | yes |
| `allocated_amount` | number | yes |
| `quarter_target` | string | no |

**Disbursement**
| Property | Type | Required |
|---|---|---|
| `amount` | number | yes |
| `date` | date | yes |
| `purpose` | string | no |
| `reference_number` | string | no |

**Expenditure**
| Property | Type | Required |
|---|---|---|
| `amount` | number | yes |
| `date` | date | yes |
| `payee` | string | yes |
| `receipt_reference` | string | no |

**ApprovalAction**
| Property | Type | Required | Notes |
|---|---|---|---|
| `date` | date | yes | |
| `decision` | string | yes | approved \| rejected \| pending \| revised |
| `approving_body` | string | yes | County Council \| Superintendent \| Finance Officer |
| `notes` | string | no | |

### Offline sync bookkeeping (unscoped, but carries county/district manually)

**SyncConflict**
| Property | Type | Required |
|---|---|---|
| `entity_label` | string | yes |
| `entity_id` | string | yes |
| `county` | string | yes |
| `district` | string | no |
| `client_value` | string | yes |
| `server_value` | string | yes |
| `client_updated_at` | date | yes |
| `server_updated_at` | date | yes |
| `resolved` | boolean | yes |
| `resolved_by` | string | no |
| `resolved_at` | date | no |

---

## Relationships

| Type | From | To |
|---|---|---|
| `WITHIN` | District | County |
| `WITHIN` | Quarter | District |
| `FILED` | Person | Case |
| `NAMED_IN` | Person | Case |
| `INVOLVES` | Case | Person |
| `CONCERNS` | Case | Parcel |
| `HEARD_AT` | Case | Hearing |
| `PRESIDED_OVER` | Official | Hearing |
| `REFERRED_TO` | Case | Official |
| `LOCATED_IN` | Case | Quarter |
| `LOCATED_IN` | Parcel | Quarter |
| `LOCATED_IN` | PublicWorksItem | Quarter |
| `HOLDS` | Person | Deed |
| `COVERS` | Deed | Parcel |
| `ADJACENT_TO` | Parcel | Parcel |
| `SUBJECT_OF` | Parcel | Dispute |
| `PAID_BY` | RevenueRecord | Person |
| `CONCERNS` | Meeting | Case |
| `REGARDING_PERSON` | CommunicationLog | Person |
| `REGARDING_CASE` | CommunicationLog | Case |
| `REPORTED` | Person | FireIncident |
| `LOCATED_IN` | FireIncident | Quarter |
| `NEAR` | FireIncident | PublicWorksItem |
| `PART_OF` | FireStation | Official |
| `STATIONED_AT` | FireApparatus | FireStation |
| `RESPONDED_BY` | FireIncident | FireStation |
| `REFERRED_TO` | FireIncident | FireAgency |
| `LINKED_TO` | FireIncident | CommunicationLog |
| `LOGGED` | Official | FireIncident |
| `SCOUTED` | Person | FireIncident |
| `SCOUTED` | Official | FireIncident |
| `ALLOCATED_TO` | Budget | BudgetLineItem |
| `FUNDS` | BudgetLineItem | PublicWorksItem |
| `ON` | ApprovalAction | Budget |
| `DISBURSED_AS` | BudgetLineItem | Disbursement |
| `SPENT_AS` | Disbursement | Expenditure |
| `TARGETS` | BudgetLineItem | Quarter |
| `RECORDED_VIA` | ApprovalAction | CommunicationLog |

This list is an **allowlist** enforced server-side (`isRelationshipAllowed`
in `resources.ts`) — the API rejects any relationship type/from/to
combination not in this table, so it's exhaustive; nothing else can
exist in the live database via the API.

---

## Analysis layer (Phase 0, read-only, no schema changes)

`server/src/routes/analysis.routes.ts` — `GET /api/analysis/<check-name>`,
scoped to the caller's county/district, restricted to
Commissioner/Official/SuperAdmin (findings can name specific people, so
Clerk is excluded). Each check returns `{ check, generated_at, findings }`.

| Check | What it flags |
|---|---|
| `quarters-left-out` | Quarters with no `PublicWorksItem` in the last 3 years and no `BudgetLineItem` targeting them |
| `line-item-drift` | Budget lines over-disbursed, over-spent relative to disbursed, or disbursed but never spent |
| `unapproved-disbursements` | Disbursements from a budget with no approved `ApprovalAction` |
| `repeat-land-cases` | Parcels with more than one `Case{type:'land'}` against them (basic version — Phase 3 adds families/witnesses) |

Tests: `server/test/analysis.phase0.test.ts` (`npm test` in `server/`) —
requires `server/.env.test` pointed at a disposable Neo4j instance (see
`server/.env.test.example`); skips cleanly if not configured.

---

## Roles (not graph nodes — property values on WhitelistEntry/User)

**Office-scoped** (operate within one county+district):
`Clerk`, `Official`, `Commissioner`, `SuperAdmin`

**County-scoped** (schema-only for MVP, no real accounts provisioned yet):
`CountyFinanceOfficer`, `CountySuperintendentOffice`, `CountySuperAdmin`
