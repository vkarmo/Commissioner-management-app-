/**
 * Sample data for the Johnsonville Commissioner's Office, so the app has
 * something to click through without waiting on real intake (build
 * prompt deliverable 7). Re-running this creates duplicates — it's meant
 * for a fresh dev/demo database, not a migration.
 *
 * Usage: npm run seed   (server must already be configured — .env or the
 * Setup Wizard's data/runtime-config.json — since this talks to Neo4j
 * directly via the same runtime config the API server uses.)
 */
import { createNode, relate } from "./services/graphService.js";
import { closeDriver } from "./db/neo4j.js";
import type { ResourceName } from "./schema/resources.js";

const ACTOR = "seed-script";
const COUNTY = "Bomi";
const DISTRICT = "Johnsonville";
const scope = { county: COUNTY, district: DISTRICT };

async function create<T extends Record<string, unknown>>(resource: ResourceName, props: T) {
  return createNode({ resource, props, scope, actorEmail: ACTOR }) as Promise<T & { id: string }>;
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`Seeding sample data for ${DISTRICT}, ${COUNTY}...`);

  const county = await createNode({ resource: "County", props: { name: COUNTY }, scope, actorEmail: ACTOR });
  const district = await createNode({
    resource: "District",
    props: { name: DISTRICT, county: COUNTY },
    scope,
    actorEmail: ACTOR,
  });
  await relate("WITHIN", "District", (district as any).id, "County", (county as any).id, scope);

  const quarterDefs = [
    { name: "Gono Town", chief_name: "Chief Momolu Kollie", chief_phone: "+231770000001", population: 1240 },
    { name: "Kpo Town", chief_name: "Chief Sarah Toe", chief_phone: "+231770000002", population: 860 },
    { name: "Suehn Quarter", chief_name: "Chief Varney Dahn", chief_phone: "+231770000003", population: 2100 },
    { name: "Tarr Town", chief_name: "Chief Yah Sirleaf", chief_phone: "+231770000004", population: 540 },
  ];
  const quarters: Record<string, any> = {};
  for (const q of quarterDefs) {
    const quarter = await createNode({
      resource: "Quarter",
      props: { ...q, district: DISTRICT, county: COUNTY },
      scope,
      actorEmail: ACTOR,
    });
    await relate("WITHIN", "Quarter", (quarter as any).id, "District", (district as any).id, scope);
    quarters[q.name] = quarter;
  }

  // --- Officials ---
  const commissioner = await create("Official", {
    full_name: "Hon. Emmanuel B. Kollie",
    role: "commissioner",
    office_title: "District Commissioner",
    phone: "+231770100001",
  });
  await create("Official", {
    full_name: "Martha Fahnbulleh",
    role: "clerk",
    office_title: "Records Clerk",
    phone: "+231770100002",
  });

  // --- Community Registry: people, some flagged as quarter chiefs ---
  const citizen1 = await create("Person", {
    full_name: "Joseph Kpaka",
    phone: "+231776100001",
    quarter: "Gono Town",
    role: "citizen",
  });
  const citizen2 = await create("Person", {
    full_name: "Comfort Weah",
    phone: "+231776100002",
    quarter: "Kpo Town",
    role: "citizen",
  });
  await create("Person", {
    full_name: "Chief Momolu Kollie",
    phone: "+231770000001",
    quarter: "Gono Town",
    role: "official",
    is_quarter_chief: true,
  });

  // --- Land Records: parcels, deed, adjacency, a dispute ---
  const parcelA = await create("Parcel", {
    parcel_ref: "JVL-001",
    quarter: "Gono Town",
    location_desc: "Behind the Gono Town market, along the main road",
    status: "registered",
    acreage: 1.5,
    land_use: "residential",
  });
  const parcelB = await create("Parcel", {
    parcel_ref: "JVL-002",
    quarter: "Gono Town",
    location_desc: "Adjacent to JVL-001, toward the stream",
    status: "disputed",
    acreage: 0.8,
    land_use: "residential",
  });
  await relate("ADJACENT_TO", "Parcel", (parcelA as any).id, "Parcel", (parcelB as any).id, scope);
  await relate("LOCATED_IN", "Parcel", (parcelA as any).id, "Quarter", quarters["Gono Town"].id, scope);
  await relate("LOCATED_IN", "Parcel", (parcelB as any).id, "Quarter", quarters["Gono Town"].id, scope);

  const deed = await create("Deed", {
    deed_number: "TC-1988-0451",
    issue_date: "1988-06-12",
    type: "tribal_certificate",
  });
  await relate("HOLDS", "Person", (citizen1 as any).id, "Deed", (deed as any).id, scope);
  await relate("COVERS", "Deed", (deed as any).id, "Parcel", (parcelA as any).id, scope);

  const dispute = await create("Dispute", { status: "open", notes: "Boundary disagreement over the stream-side line" });
  await relate("SUBJECT_OF", "Parcel", (parcelB as any).id, "Dispute", (dispute as any).id, scope);

  // --- Case Tracker ---
  const landCase = await create("Case", {
    case_number: "JVL-CASE-2026-001",
    type: "land",
    status: "mediation",
    quarter: "Gono Town",
    summary: "Boundary dispute between JVL-001 and JVL-002",
    filed_date: "2026-07-02",
  });
  await relate("FILED", "Person", (citizen1 as any).id, "Case", (landCase as any).id, scope);
  await relate("NAMED_IN", "Person", (citizen2 as any).id, "Case", (landCase as any).id, scope);
  await relate("CONCERNS", "Case", (landCase as any).id, "Parcel", (parcelB as any).id, scope);
  await relate("LOCATED_IN", "Case", (landCase as any).id, "Quarter", quarters["Gono Town"].id, scope);

  const hearing = await create("Hearing", {
    date: "2026-08-10",
    location: "Commissioner's Office, Johnsonville",
    outcome_notes: "Both parties agreed to a joint boundary walk with the surveyor; follow-up hearing scheduled.",
  });
  await relate("HEARD_AT", "Case", (landCase as any).id, "Hearing", (hearing as any).id, scope);
  await relate("PRESIDED_OVER", "Official", (commissioner as any).id, "Hearing", (hearing as any).id, scope);

  await create("Case", {
    case_number: "JVL-CASE-2026-002",
    type: "family",
    status: "intake_pending",
    quarter: "Kpo Town",
    summary: "Reported via WhatsApp intake — child support dispute",
    filed_date: "2026-08-18",
    reporter_name: "Comfort Weah",
    reporter_phone: "+231776100002",
  });

  // --- Public Works (incl. water points for fire-response suggestions) ---
  const waterPoint1 = await create("PublicWorksItem", {
    title: "Gono Town Hand Pump",
    category: "water_point",
    quarter: "Gono Town",
    status: "in_progress",
    gps_lat: 6.9524,
    gps_lng: -10.7975,
  });
  await create("PublicWorksItem", {
    title: "Kpo Town Well",
    category: "water_point",
    quarter: "Kpo Town",
    status: "completed",
    gps_lat: 6.949,
    gps_lng: -10.804,
  });
  await create("PublicWorksItem", {
    title: "Suehn Road (laterite)",
    category: "road",
    quarter: "Suehn Quarter",
    status: "planned",
  });
  await create("PublicWorksItem", {
    title: "Tarr Town Clinic",
    category: "clinic",
    quarter: "Tarr Town",
    status: "stalled",
  });

  // --- Fire Incident Reporting: Johnsonville has an on-site station under
  // construction plus one operational truck (build prompt deliverable 7) ---
  const station = await create("FireStation", {
    name: "Johnsonville Fire Station",
    status: "under_construction",
  });
  await relate("PART_OF", "FireStation", (station as any).id, "Official", (commissioner as any).id, scope);

  const apparatus = await create("FireApparatus", {
    type: "truck",
    status: "operational",
    acquisition_date: "2025-03-01",
  });
  await relate("STATIONED_AT", "FireApparatus", (apparatus as any).id, "FireStation", (station as any).id, scope);

  await create("FireAgency", {
    name: "Liberia National Fire Service (LNFS)",
    contact: "+231770900000",
    station_location: "Monrovia",
  });

  const fireIncident1 = await create("FireIncident", {
    incident_type: "market",
    quarter: "Gono Town",
    date_reported: "2026-08-20",
    status: "reported",
    description: "Small fire at the Gono Town market, cooking stall — contained by vendors before arrival",
    reporter_name: "Joseph Kpaka",
    reporter_phone: "+231776100001",
    gps_lat: 6.9526,
    gps_lng: -10.7978,
  });
  await relate("REPORTED", "Person", (citizen1 as any).id, "FireIncident", (fireIncident1 as any).id, scope);
  await relate("LOCATED_IN", "FireIncident", (fireIncident1 as any).id, "Quarter", quarters["Gono Town"].id, scope);
  await relate("NEAR", "FireIncident", (fireIncident1 as any).id, "PublicWorksItem", (waterPoint1 as any).id, scope);

  await create("FireIncident", {
    incident_type: "bush",
    quarter: "Suehn Quarter",
    date_reported: "2026-08-15",
    status: "resolved",
    description: "Bush fire near farmland, contained by community brigade",
    reporter_name: "Varney Dahn",
    reporter_phone: "+231770000003",
  });

  // --- Revenue, Meetings, Communications ---
  await create("RevenueRecord", {
    amount: 1500,
    source: "Gono Town market dues",
    date: "2026-08-01",
    receipt_reference: "RCPT-2026-08-001",
  });
  await create("Meeting", {
    title: "Palava Hut — Gono Town boundary matter",
    date: "2026-08-10",
    location: "Gono Town palava hut",
    minutes: "Elders and both families present; agreed to await surveyor before further mediation.",
  });
  await create("CommunicationLog", {
    channel: "letter",
    direction: "outbound",
    date: "2026-08-05",
    contact_name: "Bomi County Superintendent's Office",
    summary: "Notified County of the Gono Town boundary dispute per standard referral procedure.",
  });

  // eslint-disable-next-line no-console
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDriver();
  });
