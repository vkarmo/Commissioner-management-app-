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

Intake also suggests the nearest known water point (`NEAR` a
`PublicWorksItem` of category `water_point`) for community bucket-brigade
guidance — by GPS distance where both records have coordinates, falling
back to same-quarter matching otherwise
(`server/src/routes/fireIncidentActions.routes.ts`).

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

This is a monorepo with two independently deployable apps, so it deploys
as **two separate Cloud Run services** — each with its own `Dockerfile`
(`server/Dockerfile`, `client/Dockerfile`).

**Don't use Cloud Run's "Create Service from repository" Console
wizard for this repo.** That wizard only ever looks at the repo root for
a `Dockerfile`/`cloudbuild.yaml` and — at least as of writing — doesn't
offer a way to point it at a subdirectory, so it will always fail with
*"We could not find a valid build file"* here, no matter what's in
`server/` or `client/`. Use the `gcloud` CLI instead (below); its
`--source <dir>` flag builds from exactly the directory you name, no
Console field-hunting required, and doesn't need Docker installed
locally — Cloud Build does the build remotely.

### Two things that only matter for Cloud Run, not local dev

1. **The Setup Wizard's saved config won't survive.** It writes to
   `server/data/runtime-config.json` on local disk
   (`server/src/config/runtimeConfig.ts`) — fine for a VM or your laptop,
   but a Cloud Run container's filesystem is ephemeral and gets thrown
   away on every new revision, restart, or scale-to-zero cold start. On
   Cloud Run, **configure everything via environment variables/secrets at
   deploy time instead** (below) and skip the wizard — `.env`-style env
   vars are read as a fallback whenever the file is empty, so this just
   works.
2. **The client learns the server's URL at container startup, not at
   build time.** `docker-entrypoint.sh` writes it into
   `dist/runtime-config.js` from the `API_BASE_URL` env var when the
   container starts (`client/src/config.ts` reads it from there before
   falling back to the build-time `VITE_API_BASE_URL` used in local dev).
   That means the two services can be deployed in either order and
   re-pointed at each other later with `gcloud run services update
   --set-env-vars`, without rebuilding an image.

### Deploy

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

`--source <dir>` requires the [gcloud CLI](https://cloud.google.com/sdk/docs/install)
(`gcloud auth login`, `gcloud config set project YOUR_PROJECT` first) —
it uploads that directory and has Cloud Build build+push the image for
you, then deploys it. `NEO4J_PASSWORD` and `JWT_SECRET` above go through
[Secret Manager](https://cloud.google.com/secret-manager) rather than
plain `--set-env-vars`, since Cloud Run logs/shows env var values in
plaintext in the console; create them first with e.g.
`echo -n 'your-password' | gcloud secrets create neo4j-password --data-file=-`.

Finally, add the client's Cloud Run URL to your OAuth client's
**Authorized JavaScript origins** in
[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
— Google Sign-In will silently reject the origin otherwise.

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
