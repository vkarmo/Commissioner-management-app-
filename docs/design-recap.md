# Commissioner's Office Management System — Design Recap
### Johnsonville → Bomi County → Multi-County Harmonization

---

## 1. Foundational Architecture (unchanged, still the backbone)

- **Frontend**: React PWA, TypeScript, Dexie/IndexedDB offline queue, client-generated UUIDs
- **Backend**: Node/Express, Neo4j/AuraDB graph store
- **Auth**: Google OAuth, whitelist-gated
- **Intake**: WhatsApp-first, SMS fallback via Africa's Talking
- **Modeling philosophy**: graph relationships (person → parcel → case), same pattern as NMK Farm Tracker (employee → field → harvest)
- **Offline-first**: non-negotiable given connectivity realities; queue-then-commit, SyncConflict flagging, last-write-wins with clerk review

This layer does not change across scenarios. What changes is **scope and role structure** — who the whitelist admits, and what level of the graph a given account can see.

---

## 2. The Governance Structure This System Sits Inside

Confirmed from current Bomi County sourcing:

| Level | Role | Appointment | Function relevant to this app |
|---|---|---|---|
| County | **Superintendent** (currently Haja Washington) | Presidential appointment, Senate consent | Chief administrator; proposes county development budget |
| County | **County Council** | Statutory body | Formal budget approval authority |
| County | **County Finance Officer** | County administration | Disbursement, financial oversight |
| County | **County Development Officer** | County administration | Development project oversight |
| County | **Legislative Caucus (Senators)** | Elected | Consulted/updated on budget priorities, not a formal approval step in most counties |
| District | **District Commissioner** (e.g., Johnsonville) | Presidential appointment | Executes county-approved funds locally; files cases, tracks land, runs public works — this is your primary user |

Bomi has **5 administrative districts**: Dowein, Klay, Suehn Mecca, Senjeh, and **Tehr** (note: prior notes list "Johnsonville" as the initial deployment — confirm whether Johnsonville is a township within one of these five districts, since Bomi's official administrative-district list doesn't include a "Johnsonville" district by that exact name; it may be a town/city seat within Klay or another district. Worth verifying with the office before hardcoding district names).

**Key implication**: budget *approval* happens above the Commissioner's level. This app is built for the **District Commissioner's office**, so it should *record* approval decisions made elsewhere, not attempt to host the approval workflow itself.

---

## 3. Updated Graph Model — Budget/Fund Tracking Layer

Added on top of the original 7-module schema:

**New nodes:**
- `Budget` — fiscal_year, source, total_amount, status
- `BudgetLineItem` — category, allocated_amount, quarter_target
- `Disbursement` — amount, date, purpose, reference_number
- `Expenditure` — amount, date, vendor/payee, receipt_reference
- `ApprovalAction` — date, decision, notes, **approving_body** (County Council / Superintendent / Finance Officer)

**New relationships:**
- `(Budget)-[:ALLOCATED_TO]->(BudgetLineItem)`
- `(BudgetLineItem)-[:FUNDS]->(PublicWorksItem)`
- `(ApprovalAction)-[:ON]->(Budget)`
- `(BudgetLineItem)-[:DISBURSED_AS]->(Disbursement)-[:SPENT_AS]->(Expenditure)`
- `(BudgetLineItem)-[:TARGETS]->(Quarter)`
- `(ApprovalAction)-[:RECORDED_VIA]->(CommunicationLog)` — **this is the load-bearing link for Bomi's real-world process**

### Why `RECORDED_VIA` matters
Because county-level approvers (Superintendent, County Council, Finance Officer) are **not** Johnsonville app users in the MVP, every `ApprovalAction` needs a paper/verbal trail: a letter, a phone call, an email from the Finance Officer. A Johnsonville Clerk logs the decision as a `CommunicationLog` entry and links it to the `ApprovalAction`. This gives you:
- A legally traceable record of who approved what, when, on whose authority
- No need to provision county-level Google accounts in MVP
- A clean upgrade path: if county staff later want direct login, `ApprovalAction` already exists as a first-class node — you just add a `created_by` pointing to a real county-level `Official` account instead of a Clerk transcribing it

---

## 4. Role Model — Two Scopes, Not One

This is the key harmonization decision. Roles now split into **office-scoped** and **county-scoped**:

**Office-scoped roles** (exist today, per-district):
- `Clerk` — intake, data entry, logs `ApprovalAction` on county's behalf via `CommunicationLog`
- `Official` — case hearings, referrals
- `Commissioner` — district dashboard, oversight of their own office only
- `Super Admin` — whitelist management (currently office-level; see §5 for county-level implications)

**County-scoped roles** (design for now, provision later):
- `County Finance Officer` — would see `Budget`/`Disbursement`/`Expenditure` across all districts in their county, not case/land detail
- `County Superintendent's Office` — would see aggregated dashboards (all districts' open cases, public works needing attention, fund utilization) without necessarily touching case-level detail
- `County Super Admin` — manages whitelist and role assignment *across* districts, not just one office

You don't need to build county-scoped accounts now. You need the **whitelist and role schema to support a `county` and `district` field per user from day one**, even if every current user has `county: Bomi, district: Johnsonville`. Retrofitting a scope field onto users later is much more painful than including it now and ignoring it until needed.

---

## 5. Multi-Tenancy: Harmonizing Across Districts and Counties

Your stated goal — redeploy to Dowein, Klay, Suehn Mecca, Senjeh, Tehr, and potentially other counties — means the schema needs a **tenant boundary** baked in now, even while you only operate one instance.

**Recommended approach: single codebase, county-configurable, district as a tenant key**

- Every node that's district-specific (`Case`, `Parcel`, `PublicWorksItem`, `RevenueRecord`, `Meeting`) carries a `district` property, and every district carries a `county` property via `(District)-[:WITHIN]->(County)`
- `Quarter`/`Town` nodes nest under `District`, `District` nests under `County` — this mirrors Bomi's real structure (5 administrative districts, each with chiefdoms/clans/quarters underneath) and generalizes to any of Liberia's 15 counties without schema changes
- Whitelist entries carry `county` + `district` + `role`, so a Clerk whitelisted for Johnsonville simply can't query Klay's cases — this is an authorization filter on existing queries, not a new subsystem
- Configuration (quarter names, district names, admin district list) lives in a per-county config table/node set, **not hardcoded** — this was already a stated requirement ("quarters/towns should be configurable, not hardcoded"); extending that same principle one level up to counties/districts costs little now and saves a rebuild later
- One Neo4j instance can hold multiple counties' data safely as long as every query is scoped by `district`/`county` — you do **not** need separate databases per office. This keeps AuraDB Free viable for a multi-office pilot and keeps infra cost low, consistent with your budget constraint

**What stays office-specific regardless of scale:**
- Local intake channel numbers (WhatsApp/SMS lines) — each district likely wants its own number so citizens reach their own office
- Day-to-day dashboards — a Klay clerk should never need to see Johnsonville's queue by default

**What becomes shared/aggregate once you have 2+ districts:**
- County-level fund tracking (§3) — a Finance Officer view spanning districts is *only* useful once more than one district's `Budget` data exists in the graph
- Cross-district `PARCEL ADJACENT_TO` queries at the boundary between two districts, if that ever becomes relevant

---

## 6. Build Sequencing Update

Original sequence (scaffold → auth → Case/Land → remaining modules → offline sync → admin) still holds. Layer in:

1. Add `county`/`district` scoping fields to `Person`, `Case`, `Parcel`, whitelist entries — do this **before** seeding more data, since retrofitting scope onto existing records is more work than including it from the start
2. Build the Budget/Approval nodes and the `CommunicationLog`-linked `ApprovalAction` pattern into the existing Communications module rather than as a separate module — it reuses UI you're already building
3. Keep county-scoped roles (`County Finance Officer`, etc.) as schema-only for now — don't build their UI until an actual second district or county-level user is in scope
4. When redeployment to a second district becomes real, the work is: whitelist entries for the new district, a config record for its quarters, and a new WhatsApp/SMS number — not a new codebase or schema migration

---

## 7. Open Questions Worth Resolving With the Office

- Confirm Johnsonville's exact administrative placement within Bomi's 5 districts (Dowein/Klay/Suehn Mecca/Senjeh/Tehr) — needed before hardcoding any district-level config
- Confirm whether county sign-off in practice comes via letter, phone, or in-person visit — determines whether `CommunicationLog`-linked approval recording is sufficient or whether a county login is needed sooner than expected
- Confirm whether the Commissioner's office wants visibility into county-level budget status at all, or only their own disbursed/spent totals — affects whether `Budget`/`BudgetLineItem` need to be readable (not just writable) by Johnsonville staff
