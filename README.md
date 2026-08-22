# Commissioner's Office Management System

Offline-first case, land, public works, revenue, and budget-tracking system
for a District Commissioner's Office (initial deployment: Johnsonville,
Bomi County, Liberia) — built to harmonize across districts and counties
without a schema rewrite. See [`docs/design-recap.md`](docs/design-recap.md)
for the full architecture rationale.

## Structure

```
server/   Node/Express + Neo4j API — auth, graph schema, offline sync endpoint
client/   React PWA (Vite) — Dexie offline queue, Google OAuth login, module UI
docs/     Design documentation
```

## Architecture at a glance

- **Graph model**: Neo4j nodes for the original 7 modules (Person, Case,
  Parcel, PublicWorksItem, RevenueRecord, Meeting, CommunicationLog) plus a
  Budget/Approval layer (Budget, BudgetLineItem, Disbursement, Expenditure,
  ApprovalAction) that records — rather than hosts — county-level approval
  decisions, linked to a `CommunicationLog` entry via `RECORDED_VIA` so
  every approval has a traceable paper/verbal trail even before county
  staff have their own logins. Full schema: `server/src/schema/resources.ts`.
- **Multi-tenancy**: every district-specific node carries denormalized
  `county` + `district` properties from day one (`server/src/schema/resources.ts`,
  `server/src/services/graphService.ts`), and every API query is filtered
  by the caller's scope — so one Neo4j instance can safely hold multiple
  districts' and counties' data without separate databases per office.
- **Roles**: office-scoped (`Clerk`, `Official`, `Commissioner`,
  `SuperAdmin`) exist today; county-scoped (`CountyFinanceOfficer`,
  `CountySuperintendentOffice`, `CountySuperAdmin`) are defined in the
  schema and role-group config now so provisioning them later needs no
  migration — just whitelist entries.
- **Auth**: Google OAuth ID tokens verified server-side, checked against a
  `WhitelistEntry` graph node, then exchanged for a JWT session
  (`server/src/auth/`).
- **Offline-first**: the client always writes through a Dexie/IndexedDB
  mutation queue with client-generated UUIDs (`client/src/db/`), which
  flushes to `POST /api/sync/batch` on reconnect. A write that collides
  with a newer server version is flagged as a `SyncConflict` node for
  clerk review rather than silently overwritten (last-write-wins only
  after review).

## Getting started

### Server

```bash
cd server
cp .env.example .env   # fill in your AuraDB / Neo4j credentials, Google client ID, JWT secret
npm install
npm run dev             # http://localhost:4000
```

Set `BOOTSTRAP_SUPER_ADMINS` (comma-separated emails) and
`BOOTSTRAP_SUPER_ADMIN_COUNTY` in `.env` so the first Super Admin can log
in and start inviting others — before any `WhitelistEntry` node exists.

### Client

```bash
cd client
cp .env.example .env   # point at the server and your Google OAuth client ID
npm install
npm run dev              # http://localhost:5173
```

### Adding a new district or county

Per the design recap's build sequencing: no code change is required.
1. An admin creates `County` / `District` / `Quarter` reference data via
   `POST /api/config/{counties,districts,quarters}`.
2. An admin whitelists staff for that district via `POST /api/admin/whitelist`.
3. Point that office's WhatsApp/SMS intake number at the new district's
   config.

## Not yet built

- WhatsApp/SMS intake wiring (Africa's Talking) — `CommunicationLog` is
  ready to receive it, but the inbound webhook isn't implemented yet.
- UI for the county-scoped roles' aggregate dashboards — the API already
  scopes reads for them (`server/src/schema/roleGroups.ts`), but no
  purpose-built screen exists yet since no real county-level users are
  provisioned in the MVP.
