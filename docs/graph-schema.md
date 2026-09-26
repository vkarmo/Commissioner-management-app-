# Commissioner's Office — Neo4j Graph Schema

Auto-generated from `server/src/schema/resources.ts` (single source of
truth for the API). Regenerate this file whenever that file changes —
per the schema-patch spec's acceptance criteria, at the end of every
phase, even phases (like Phase 0) that don't touch it.

**Phase 0** (2026-09-25) added a read-only analysis layer
(`GET /api/analysis/*`, `server/src/routes/analysis.routes.ts`) with no
schema changes.

**Phase 1** (2026-09-25) added the `LIVES_IN` and `CHIEF_OF` relationships,
deprecated three now-derived properties, and added a same-scope guard plus
two derived-field syncs to `graphService.relate()` — see "Migrations"
and "Case Party Review (Phase 1.4)" below.

**Phase 1.5** (2026-09-26) — the office decided to retire `Dispute` in
favor of `Case{type:'land'}`. `Dispute` and `SUBJECT_OF` stay in the
schema/allowlist (existing data stays readable) but creating a new
Dispute is disabled; see "Migrations" below for M4.

**Phase 2** (2026-09-26) added `Contractor` and the project money trail
(`BUILT_BY`/`PAID_TO`/`FOR`), normalized `PublicWorksItem.status` onto
five canonical values, and added migration M5 (the contractor-review
queue for Expenditure payees) — see "Migrations" and "Contractor Review
(Phase 2, M5)" below.

**Phase 3** (2026-09-26) added `Family` and witnesses (`MEMBER_OF`,
`PARTY_TO`, `LIVES_IN` from Family, `WITNESS_IN`), and replaced the
basic `repeat-land-cases` check with the full version (families +
repeat witnesses) — see "Family & Witness Links (Phase 3)" below. No
migration: these are new resources/relationships with no legacy data to
reconcile.

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
| Property | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | |
| `district` | string | yes | |
| `county` | string | yes | |
| `chief_name` | string | no | **deprecated** — derived from the quarter's `CHIEF_OF` Person once that edge exists (Phase 1 M2) |
| `chief_phone` | string | no | **deprecated** — same as `chief_name` |
| `population` | number | no | |

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
| `is_quarter_chief` | boolean | no | **deprecated** — derived from a `CHIEF_OF` edge to a Quarter once that edge exists (Phase 1 M2) |
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
| `legacy_dispute_id` | string | no | set by migration M4 on a Case created to replace a retired Dispute (Phase 1.5) |

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
| `status` | string | yes | planned \| in_progress \| stalled \| completed \| cancelled (Phase 2 — older records may still carry a pre-Phase-2 value like "funded" until reviewed, see `migrations/normalizePublicWorksStatus.ts`) |
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

**Family** (Phase 3)
| Property | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | e.g. "Zinnah family" |
| `quarter` | string | no | cache of the `LIVES_IN` Quarter's name — same rule as 1.3, edge is authoritative once set |
| `notes` | string | no | |

**Dispute** — **retired** (Phase 1.5): migration M4 replaces each with a
`Case{type:'land'}` and archives it; creating a new one is disabled
(`server/src/routes/index.ts`, `client/src/modules.ts`). Stays defined,
and `SUBJECT_OF` stays in the allowlist, so existing/legacy Disputes
remain readable until a real-database check confirms none are left
unarchived — see M4's `remainingUnarchivedDisputes` count below.
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
| Property | Type | Required | Notes |
|---|---|---|---|
| `amount` | number | yes | |
| `date` | date | yes | |
| `payee` | string | yes | |
| `receipt_reference` | string | no | |
| `contractor_review_status` | string | no | pending (unset) \| linked \| not_contractor — internal bookkeeping for migration M5 (Phase 2), not a client form field |

**ApprovalAction**
| Property | Type | Required | Notes |
|---|---|---|---|
| `date` | date | yes | |
| `decision` | string | yes | approved \| rejected \| pending \| revised |
| `approving_body` | string | yes | County Council \| Superintendent \| Finance Officer |
| `notes` | string | no | |

**Contractor** (Phase 2 — scoped per office; matching the same company
across districts by `registration_number` is a later county-level
feature, not attempted here)
| Property | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | |
| `registration_number` | string | no | Liberia Business Registry number |
| `phone` | string | no | |
| `owner_name` | string | no | |
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
| `LIVES_IN` | Person | Quarter |
| `CHIEF_OF` | Person | Quarter |
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
| `MEMBER_OF` | Person | Family |
| `PARTY_TO` | Family | Case |
| `LIVES_IN` | Family | Quarter |
| `WITNESS_IN` | Person | Hearing |
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
| `BUILT_BY` | PublicWorksItem | Contractor |
| `PAID_TO` | Expenditure | Contractor |
| `FOR` | Expenditure | PublicWorksItem |

This list is an **allowlist** enforced server-side (`isRelationshipAllowed`
in `resources.ts`) — the API rejects any relationship type/from/to
combination not in this table, so it's exhaustive; nothing else can
exist in the live database via the API.

**Same-scope rule** (Phase 1): `graphService.relate()` rejects any
relationship whose two endpoints have different `county`/`district`
values — Quarter/District/County count as in-scope purely by matching
property values, since they aren't `scoped` resources themselves.

**Derived fields on write** (Phase 1): `relate()` also keeps two things in
sync so they can't drift, no matter which route creates the edge:
- `LOCATED_IN` to a Quarter (Case/Parcel/PublicWorksItem/FireIncident) sets
  the node's `quarter` string from the Quarter's `name`, and drops any
  previous `LOCATED_IN` edge to a different Quarter — the edge is
  authoritative, the string is a read-only cache.
- `CHIEF_OF` (Person → Quarter) sets `Quarter.chief_name`/`chief_phone`
  from the Person, sets `Person.is_quarter_chief = true`, and un-sets the
  previous chief's flag if there was one — a Quarter has at most one
  current `CHIEF_OF` Person.

**Single-target relationships** (Phase 2): `PAID_TO` and `FOR` are also
single-target — an Expenditure is one transaction, so relating it to a
different Contractor/PublicWorksItem replaces the previous edge rather
than adding a second one. `BUILT_BY` is deliberately **not**
single-target: a PublicWorksItem can legitimately have more than one
Contractor over its lifetime.

**Family.quarter** (Phase 3) follows the same rule as `LOCATED_IN` above,
but via `LIVES_IN` (Family → Quarter) to match Family's own semantics —
single-target, syncs the string, gated specifically to Family so it
doesn't change Person's existing `LIVES_IN` behavior from Phase 1 (M1
links it but doesn't keep it in sync afterward). `MEMBER_OF`,
`PARTY_TO`, and `WITNESS_IN` are ordinary multi-target relationships — a
family has several members, a case can have several parties, a hearing
can have several witnesses.

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
| `repeat-land-cases` | Parcels with more than one `Case{type:'land'}` against them, the families and parties involved, and any witness repeated across more than one of those cases (full version, Phase 3 — replaced the basic version on the same route) |
| `location-mismatches` | Case/Parcel/PublicWorksItem/FireIncident whose `quarter` string and `LOCATED_IN` Quarter disagree, or where only one of the two is set (Phase 1.3) |
| `stalled-contractors` | Contractors with 2+ overdue `PublicWorksItem`s (`planned`/`in_progress`/`stalled` past `target_date`), and how much has already been paid on those items (Phase 2) |

Tests: `server/test/analysis.phase0.test.ts`,
`analysis.phase1.test.ts`, `analysis.phase1-5.test.ts`,
`analysis.phase2.test.ts`, and `analysis.phase3.test.ts` (`npm test` in
`server/`) — require `server/.env.test` pointed at a disposable Neo4j
instance (see `server/.env.test.example`); skip cleanly if not
configured.

---

## Migrations

Non-destructive, idempotent scripts under `server/src/migrations/`. Each
only adds edges (or, where the spec explicitly calls for it — the status
normalization below — maps a value onto a canonical one) and reports
anything ambiguous instead of guessing. Run against a seeded local
database first — ask before running against a real one.

| Script | npm script | What it does |
|---|---|---|
| `m1PersonLivesInQuarter.ts` | `npm run migrate:m1` | Links each `Person.quarter` string to a same-name Quarter (same county/district) via `LIVES_IN`. Unmatched/ambiguous names are reported, never guessed; Quarters are never auto-created. |
| `m2QuarterChiefs.ts` | `npm run migrate:m2` | Links each `Person.is_quarter_chief = true` to their Quarter (via an existing `LIVES_IN` edge, or M1's name-match) via `CHIEF_OF` — run M1 first. Reports a Quarter whose `chief_name` has no matching `CHIEF_OF` Person, without auto-creating one. |
| `m4RetireDisputes.ts` | `npm run migrate:m4` | Office decision (Phase 1.5): replaces each non-archived Dispute with a `Case{type:'land'}` (status mapped, summary from `notes`, `quarter`/`LOCATED_IN` copied from the Parcel if set, `legacy_dispute_id` recorded, `CONCERNS` the Parcel), then archives the Dispute. Reports — without touching either node — a Dispute whose Parcel already has an open, unlinked land Case (likely a duplicate someone already filed), and a Dispute whose `status` isn't `open`/`resolved`. |
| `normalizePublicWorksStatus.ts` | `npm run migrate:normalize-status` | Phase 2: maps an obvious `PublicWorksItem.status` synonym (`"in progress"`, `"complete"`, `"cancelled"`, `"on hold"`, `"new"`, etc.) onto the canonical five values. A value with no obvious mapping — notably `"funded"`, genuinely ambiguous between `planned`/`in_progress` — is reported, never guessed. |

Each script returns a structured report in addition to printing it (see
each file's own doc comment for its exact shape), and is covered by
`server/test/analysis.phase1.test.ts`, `analysis.phase1-5.test.ts`, or
`analysis.phase2.test.ts`.

Once a real run of M4 reports `remainingUnarchivedDisputes: 0`,
`SUBJECT_OF` can be removed from the allowlist in `resources.ts` and the
`Dispute` resource definition can be deleted — not done yet, since that
requires actually running M4 against production data, which this session
has no network path to do.

## Case Party Review (Phase 1.4)

`GET /api/case-party-review` (Clerk/Official/Commissioner/SuperAdmin) —
lists cases that are `intake_pending`, or have a `reporter_name`/
`respondent_name` from SMS/WhatsApp intake with no matching `FILED`/
`INVOLVES` edge yet, alongside candidate Person matches (same
county/district, by phone first then by name). Nothing here auto-links on
a name match — a clerk always confirms:

- `POST /:caseId/confirm` `{ field: 'reporter'|'respondent', personId }` —
  creates `FILED` (reporter) or `INVOLVES` (respondent).
- `POST /:caseId/new-person` `{ field, full_name, phone? }` — creates a
  new Person in the case's scope, then links it the same way.

## Contractor Review (Phase 2, M5)

`GET /api/contractor-review` (office roles, plus county finance/aggregate
readers) — groups unreviewed `Expenditure.payee` values by a normalized
name (lowercase, punctuation stripped, `inc`/`ltd`/`llc`/`co`/`corp`/
`company` suffixes stripped) so the same vendor spelled differently shows
up as one group. Already-linked or already-dismissed expenditures
(`contractor_review_status` set, or an existing `PAID_TO` edge) are
excluded. Nothing is ever auto-merged — a clerk always confirms:

- `POST /confirm` `{ expenditureIds, contractor: {id} | {name, ...} }` —
  links every expenditure in the group to that Contractor (creating it
  first if `contractor` has no `id`) via `PAID_TO`, and sets
  `contractor_review_status = 'linked'`.
- `POST /dismiss` `{ expenditureIds }` — sets `contractor_review_status =
  'not_contractor'` (a refund, fuel, allowances, etc.) so the group stops
  reappearing.

Setting `BUILT_BY` (PublicWorksItem → Contractor) or `FOR` (Expenditure →
PublicWorksItem) outside this flow goes through the existing generic
`POST /api/relate`, same as every other relationship in the app; read-only
convenience endpoints (`GET /api/public-works/:id/contractor`,
`GET /api/expenditures/:id/links`) let the client show what's currently
linked before offering a picker.

## Family & Witness Links (Phase 3)

Read-only convenience endpoints (`server/src/routes/familyLinks.routes.ts`,
office roles) so the client can show who/what is currently linked before
offering a picker — same pattern as the Phase 2 contractor links:

- `GET /api/families/:id/members` — Persons `MEMBER_OF` this Family.
- `GET /api/cases/:id/families` — Families `PARTY_TO` this Case.
- `GET /api/hearings/:id/witnesses` — Persons `WITNESS_IN` this Hearing.

Adding a link goes through the existing generic `POST /api/relate`
(`MEMBER_OF`/`PARTY_TO`/`WITNESS_IN` are already allowlisted) — there's
no dedicated write endpoint for any of these, unlike the Phase 1/1.4/2
review queues, since none of them need a suggestion/confirm workflow: a
clerk just picks a Person/Family directly.

---

## Roles (not graph nodes — property values on WhitelistEntry/User)

**Office-scoped** (operate within one county+district):
`Clerk`, `Official`, `Commissioner`, `SuperAdmin`

**County-scoped** (schema-only for MVP, no real accounts provisioned yet):
`CountyFinanceOfficer`, `CountySuperintendentOffice`, `CountySuperAdmin`
