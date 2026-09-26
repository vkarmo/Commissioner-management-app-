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

## Modules

| Module | Nodes | Notes |
|---|---|---|
| Case Tracker | `Case`, `Hearing`, `Official` | `Case` links to `Person` (`FILED`/`NAMED_IN`), `Parcel` (`CONCERNS`), `Quarter`, and can be `REFERRED_TO` an `Official`; `Hearing`s are `PRESIDED_OVER` by an `Official`. |
| Land Records | `Parcel`, `Deed`, `Dispute` | Deed history (`HOLDS`/`COVERS`), `ADJACENT_TO` parcel links for boundary queries without full geometry, and a `SUBJECT_OF` dispute flag. Optional GeoJSON boundary per parcel. |
| Community Registry | `Person`, `Quarter` | Household/citizen directory plus a per-quarter chief/population/contact directory. |
| Revenue & Market | `RevenueRecord` | Dues/levies with source, amount, date, receipt reference. |
| Public Works | `PublicWorksItem` | Roads/water points/schools/clinics with status, optional GPS and photo reference. |
| Communications | `CommunicationLog` | Correspondence with County/line ministries; also used by the fire-referral workflow below. |
| Meetings | `Meeting` | Palava hut / community meeting minutes. |
| **Fire Incident Reporting** | `FireIncident`, `FireStation`, `FireApparatus`, `FireAgency` | See below. |
| Admin | `WhitelistEntry`, `User`, `SyncConflict` | Whitelist management, roles, sync conflict review. |

Plus a Budget/Approval layer (`Budget`, `BudgetLineItem`, `Disbursement`,
`Expenditure`, `ApprovalAction`) that records — rather than hosts —
county-level approval decisions, linked to a `CommunicationLog` entry via
`RECORDED_VIA` so every approval has a traceable paper/verbal trail even
before county staff have their own logins.

### Fire Incident Reporting

A `FireStation`/`FireApparatus` pair is **optional per office** — most
Commissioner's Offices have neither and rely entirely on referral. Where
one exists (Johnsonville has an on-site truck and a station under
construction — see the seed script), the incident detail screen offers
two actions instead of one:

- **Respond Locally** — only shown if an *operational* `FireStation`
  exists; creates `RESPONDED_BY` and advances status to `responding`.
- **Refer to LNFS** — always available (the default path for offices
  without a station, and for Johnsonville's mutual-aid cases beyond local
  capacity); creates `REFERRED_TO` a `FireAgency` plus a `CommunicationLog`
  entry linked via `LINKED_TO`, and advances status to `referred_to_lnfs`.

A third, always-available action sits alongside those two:

- **Dispatch Scout** — sends a specific `Person` or `Official` (e.g. a
  motorbike scout) to confirm what's actually happening before a truck
  rolls or a referral is made; creates a `SCOUTED` relationship and
  advances status to `scout_dispatched`. It's optional and doesn't gate
  the other two — a clerk can still Respond Locally or Refer to LNFS at
  any time regardless of whether a scout was sent.
- **Log Scout Report** — once the scout calls in (radio or WhatsApp),
  records the result (confirmed/false alarm), an optional severity, and
  notes as a `CommunicationLog` entry linked via `LINKED_TO`. A false
  alarm auto-resolves the incident; a confirmed severity is written back
  onto `FireIncident.severity` so it's visible without opening the log.

Intake also suggests the nearest known water point (`NEAR` a
`PublicWorksItem` of category `water_point`) for community bucket-brigade
guidance — by GPS distance where both records have coordinates, falling
back to same-quarter matching otherwise
(`server/src/routes/fireIncidentActions.routes.ts`).

### Analysis layer

A read-only, schema-free layer of checks over the existing graph
(`GET /api/analysis/*`, `server/src/routes/analysis.routes.ts`) — no new
nodes or relationships, just Cypher queries surfaced as an **Analysis**
screen (Commissioner/Official/SuperAdmin only, since findings can name
specific people). This is being built out in phases from a separate
schema-patch spec; Phase 0 covers:

| Check | What it flags |
|---|---|
| `quarters-left-out` | Quarters with no public works item in 3 years and no budget line targeting them |
| `line-item-drift` | Budget lines over-disbursed, over-spent, or disbursed but never spent |
| `unapproved-disbursements` | Disbursements from a budget with no approved `ApprovalAction` |
| `repeat-land-cases` | Parcels with more than one land case against them |

**Phase 1** (current) added one more check plus two clerk-facing cleanup
tools:

| Check | What it flags |
|---|---|
| `location-mismatches` | Case/Parcel/PublicWorksItem/FireIncident whose `quarter` string and linked Quarter disagree, or where only one of the two is set |

- **Migrations** (`server/src/migrations/`, `npm run migrate:m1` /
  `migrate:m2`): non-destructive, idempotent scripts that link
  `Person.quarter` strings to real Quarter nodes (`LIVES_IN`) and dedupe
  quarter chiefs onto a single `CHIEF_OF` edge, reporting anything
  ambiguous instead of guessing. Run against a seeded local database
  first — never against production without asking.
- **Case Party Review** (`/case-party-review`, Clerk and up): a queue for
  turning SMS/WhatsApp intake's free-text reporter/respondent names into
  real Person links — a clerk always confirms a suggested match or adds a
  new person; nothing auto-links on name alone.

**Phase 1.5**: the office decided to retire `Dispute` in favor of
`Case{type: 'land'}`. Migration M4 (`npm run migrate:m4`) replaces each
Dispute with a Case and archives it — flagging, rather than guessing at,
a Dispute whose parcel already has an open land Case (likely a duplicate)
or whose status isn't `open`/`resolved`. Creating a *new* Dispute is now
disabled in both the UI and the API (existing ones stay viewable/
archivable); `Dispute` and `SUBJECT_OF` stay in the schema until a real
run of M4 confirms none are left unarchived.

**Phase 2** added one more check plus contractors and the project money
trail:

| Check | What it flags |
|---|---|
| `stalled-contractors` | Contractors with 2+ overdue public works items, and how much has already been paid on them |

- **Contractors** (`/contractors`): a new module, linked to a
  `PublicWorksItem` via `BUILT_BY` (a project can have more than one
  contractor) and to an `Expenditure` via `PAID_TO`/`FOR` (single-target —
  one expenditure is one transaction) — pickers for both live on the
  respective edit pages.
- **PublicWorksItem.status** is now a five-value enum (`planned` /
  `in_progress` / `stalled` / `completed` / `cancelled`). Migration
  `npm run migrate:normalize-status` maps obvious old values onto these;
  anything genuinely ambiguous (e.g. `funded`) is reported, not guessed.
- **Contractor Review** (`/contractor-review`, migration M5): groups
  `Expenditure.payee` values by a normalized spelling so a clerk can
  confirm a group as a Contractor (existing or new) or mark it not a
  contractor — never auto-merged.

See [`docs/graph-schema.md`](docs/graph-schema.md) for the full generated
schema reference (regenerated at the end of every phase).

## Architecture at a glance

- **Graph model**: Neo4j nodes per the module table above. Full schema
  and relationship allowlist: `server/src/schema/resources.ts`.
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

### Tests

```bash
cd server
cp .env.test.example .env.test   # point at a DISPOSABLE Neo4j instance — never production
npm install
npm test
```

Integration tests (`server/test/`) seed real fixture data and hit the
real API over HTTP, so they need their own database — never point
`.env.test` at the same instance as `.env`. If `.env.test` is missing or
incomplete, the suite skips itself with a clear message instead of
risking a silent fall-through to real credentials (`server/test/testEnv.ts`).

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

### Sample data

Once the Setup Wizard is done (so the server has a real Neo4j connection):

```bash
cd server
npm run seed
```

Populates Johnsonville/Bomi sample data — quarters with chiefs, a few
citizens and officials, a land dispute with a deed and an adjacent
parcel, a case with a hearing, public works including two water points
with GPS coordinates, a fire station (`under_construction`) with one
operational truck, an LNFS `FireAgency` entry, and two sample fire
incidents. Re-running it creates duplicates — it's for a fresh dev/demo
database, not a migration. It does **not** seed `WhitelistEntry`/login
access; use the Setup Wizard's bootstrap Super Admin for that.

### SMS/WhatsApp intake (stub)

`POST /api/intake/case` and `POST /api/intake/fire-incident`
(`server/src/routes/intake.routes.ts`) let a future WhatsApp Business
API / Twilio SMS webhook create `Case`/`FireIncident` nodes with
`status: intake_pending` / `reported` directly, without a signed-in
clerk — matching the payload shape a citizen-facing bot would send
(case/incident type, quarter, reporter name/phone, description, optional
photo reference). They're disabled (`501`) until you set `INTAKE_API_KEY`
in the server's environment; once set, callers must send it back as the
`X-Intake-Key` header. No bot integration is wired up yet — these are
just the receiving endpoints, ready for one.

### Adding a new district or county

Per the design recap's build sequencing: no code change is required.
1. An admin creates `County` / `District` / `Quarter` reference data via
   `POST /api/config/{counties,districts,quarters}`.
2. An admin whitelists staff for that district via `POST /api/admin/whitelist`.
3. Point that office's WhatsApp/SMS intake number at the new district's
   config.

## Deploying to Google Cloud Run

Two ways to deploy this, pick one:

- **Combined (recommended, simplest)** — one Cloud Run service. The repo-root
  `Dockerfile` builds both apps and the Express server serves the built
  React app directly (`server/src/app.ts`), so there's one URL, no CORS
  setup, and no client/server URL wiring at all.
- **Split** — two Cloud Run services (`server/Dockerfile`,
  `client/Dockerfile`), independently scalable/deployable, at the cost of
  needing to wire `CORS_ORIGIN` and `API_BASE_URL` between them. See
  **Split deploy** below if you want this instead.

**Don't use Cloud Run's "Create Service from repository" Console
wizard for either.** That wizard only ever looks at the repo root for a
`Dockerfile`/`cloudbuild.yaml` and — at least as of writing — doesn't
support a monorepo well (no reliable way to point at a subdirectory for
the split option), so it tends to fail with *"We could not find a valid
build file"*. Use the `gcloud` CLI instead (below); its `--source <dir>`
flag builds from exactly the directory you name, no Console
field-hunting required, and doesn't need Docker installed locally —
Cloud Build does the build remotely. (If a Console-created trigger/service
is already stuck on this error, either delete it and redeploy with the
command below, or fix its Cloud Build trigger's "Configuration" from
*Autodetected* to *Dockerfile* with the right directory.)

### One thing that only matters for Cloud Run, not local dev

**The Setup Wizard's saved config won't survive.** It writes to
`server/data/runtime-config.json` on local disk
(`server/src/config/runtimeConfig.ts`) — fine for a VM or your laptop,
but a Cloud Run container's filesystem is ephemeral and gets thrown away
on every new revision, restart, or scale-to-zero cold start. On Cloud
Run, **configure everything via environment variables/secrets at deploy
time instead** (below) and skip the wizard — `.env`-style env vars are
read as a fallback whenever the file is empty, so this just works.

### Combined deploy

```bash
gcloud run deploy commissionerappservice \
  --source . \
  --region YOUR_REGION \
  --allow-unauthenticated \
  --set-env-vars NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io,NEO4J_USERNAME=neo4j,NEO4J_DATABASE=neo4j,GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com,BOOTSTRAP_SUPER_ADMINS=you@example.com,BOOTSTRAP_SUPER_ADMIN_COUNTY=Bomi \
  --set-secrets NEO4J_PASSWORD=neo4j-password:latest,JWT_SECRET=jwt-secret:latest
```

That's it — one service, one URL. No `CORS_ORIGIN` or `API_BASE_URL`
needed, since the client is served from the same origin it calls
(`client/src/config.ts` defaults to a relative `/api`). Once it's up, add
its URL to your OAuth client's **Authorized JavaScript origins** in
[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
— Google Sign-In will silently reject the origin otherwise.

`--source .` requires the [gcloud CLI](https://cloud.google.com/sdk/docs/install)
(`gcloud auth login`, `gcloud config set project YOUR_PROJECT` first) —
it uploads the repo and has Cloud Build build+push the image for you,
then deploys it. `NEO4J_PASSWORD` and `JWT_SECRET` above go through
[Secret Manager](https://cloud.google.com/secret-manager) rather than
plain `--set-env-vars`, since Cloud Run logs/shows env var values in
plaintext in the console; create them first with e.g.
`echo -n 'your-password' | gcloud secrets create neo4j-password --data-file=-`.

To redeploy after a code change, just re-run the same command (add
`--set-env-vars`/`--update-env-vars` only if something changed).

### Split deploy

```bash
# --- Server ---
gcloud run deploy commissioner-server \
  --source server \
  --region YOUR_REGION \
  --allow-unauthenticated \
  --set-env-vars NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io,NEO4J_USERNAME=neo4j,NEO4J_DATABASE=neo4j,GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com,BOOTSTRAP_SUPER_ADMINS=you@example.com,BOOTSTRAP_SUPER_ADMIN_COUNTY=Bomi \
  --set-secrets NEO4J_PASSWORD=neo4j-password:latest,JWT_SECRET=jwt-secret:latest
# Note the printed Service URL — you need it below.

# --- Client ---
gcloud run deploy commissioner-client \
  --source client \
  --region YOUR_REGION \
  --allow-unauthenticated \
  --set-env-vars API_BASE_URL=https://commissioner-server-xxxx.a.run.app/api
# Note this Service URL too.

# --- Point the server back at the client (for CORS) ---
gcloud run services update commissioner-server \
  --region YOUR_REGION \
  --update-env-vars CORS_ORIGIN=https://commissioner-client-xxxx.a.run.app
```

The client learns the server's URL at container startup, not build time:
`docker-entrypoint.sh` writes it into `dist/runtime-config.js` from the
`API_BASE_URL` env var when the container starts, and `client/src/config.ts`
reads it from there. That means the two services can be deployed in
either order and re-pointed at each other later with `gcloud run
services update --update-env-vars`, without rebuilding an image. Same
Secret Manager and OAuth-origin notes as the combined deploy above apply
here too (use the *client's* URL for the OAuth origin, not the server's).

## Not yet built

- The actual WhatsApp Business API / Twilio SMS bot — the receiving
  endpoints exist (see **SMS/WhatsApp intake** above) and are shaped for
  it, but nothing calls them yet.
- A map view of parcel boundaries — `Parcel.geometry_geojson` is there to
  hold GeoJSON if you have surveyed geometry, but rendering it was called
  out as a stretch goal and isn't built.
- Photo upload — `photo_reference` fields on `PublicWorksItem` and
  `FireIncident` store a URL/reference string; there's no upload endpoint
  or object storage wired up to populate one yet.
- UI for the county-scoped roles' aggregate dashboards — the API already
  scopes reads for them (`server/src/schema/roleGroups.ts`), but no
  purpose-built screen exists yet since no real county-level users are
  provisioned in the MVP.
