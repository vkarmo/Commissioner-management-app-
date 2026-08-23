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
npm install
npm run dev             # http://localhost:4000
```

No `.env` needed to get started — see **Setup Wizard** below. If you'd
rather configure it by file instead, `cp .env.example .env` and fill it
in before starting the server; the wizard then just won't appear, since
whatever it needs to check will already be complete.

### Client

```bash
cd client
cp .env.example .env   # only needs VITE_API_BASE_URL if the server isn't at localhost:4000
npm install
npm run dev              # http://localhost:5173
```

### Setup Wizard

On first load, the client checks `GET /api/setup/status`. Until the server
has everything it needs — Neo4j connection, a Google OAuth Client ID, and
at least one bootstrap Super Admin email — every other `/api/*` route
returns `503 { setupRequired: true }` and the client shows a setup form
instead of the login screen (`server/src/routes/setup.routes.ts`,
`client/src/pages/SetupWizard.tsx`). The form:

1. Takes your Neo4j/AuraDB URI, username, password, and database, with a
   **Test connection** button that verifies them before anything is saved.
2. Takes your Google OAuth Client ID (create one at
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   — OAuth client ID, type "Web application").
3. Takes the email(s) that should be Super Admin on first login — there's
   no `WhitelistEntry` yet, so this is the only way in.
4. Auto-generates a JWT signing secret if you don't supply one.

Submitting writes these to `server/data/runtime-config.json` (gitignored,
`0600` permissions) rather than `.env`, so it survives without any file
editing. A signed-in Super Admin can revisit the same form later at
**Settings** in the sidebar to rotate credentials — the Neo4j password and
JWT secret are never echoed back to the browser; leaving them blank on a
resubmit keeps the current value rather than clearing it.

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
