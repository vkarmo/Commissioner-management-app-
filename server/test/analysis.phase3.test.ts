import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, skipReason } from "./testEnv.js";

if (!hasTestDb) {
  // eslint-disable-next-line no-console
  console.warn(`[analysis.phase3.test] ${skipReason}`);
}

const describeIfDb = hasTestDb ? describe : describe.skip;

/**
 * Phase 3 (schema-patch spec, 2026-09-26): Family + MEMBER_OF/PARTY_TO/
 * LIVES_IN/WITNESS_IN, the family/witness link read endpoints, and the
 * full repeat-land-cases check. Fixture mirrors the spec's own Tests
 * section: "a parcel with three land cases between the same two families
 * and a repeat witness."
 */
describeIfDb("Phase 3: families, witnesses, full repeat-land-cases", () => {
  let createApp: typeof import("../src/app.js").createApp;
  let closeDriver: typeof import("../src/db/neo4j.js").closeDriver;
  let getSession: typeof import("../src/db/neo4j.js").getSession;
  let issueSessionToken: typeof import("../src/auth/session.js").issueSessionToken;

  const runId = randomUUID();
  const suffix = runId.slice(0, 8);
  const COUNTY = "TestCounty";
  const DISTRICT_A = `TestDistrictA-${suffix}`;

  let baseUrl: string;
  let server: import("node:http").Server;
  let tokenClerkA: string;
  let tokenCommissionerA: string;

  const ids = {
    quarterFoo: randomUUID(),
    quarterBar: randomUUID(),
    parcelRepeat: randomUUID(),
    parcelSingle: randomUUID(),
    case1: randomUUID(),
    case2: randomUUID(),
    case3: randomUUID(),
    caseSingle: randomUUID(),
    familyA: randomUUID(),
    familyB: randomUUID(),
    party1: randomUUID(),
    hearing1: randomUUID(),
    hearing2: randomUUID(),
    witnessRepeat: randomUUID(),
    witnessOnce: randomUUID(),
    familySync: randomUUID(),
    familyMemberTest: randomUUID(),
    personMemberTest: randomUUID(),
    caseFamilyTest: randomUUID(),
    hearingWitnessTest: randomUUID(),
    personWitnessTest: randomUUID(),
  };

  async function seed(session: import("neo4j-driver").Session) {
    const now = new Date().toISOString();
    const p = (extra: Record<string, unknown>) => ({
      test_run_id: runId,
      county: COUNTY,
      district: DISTRICT_A,
      created_at: now,
      updated_at: now,
      archived: false,
      ...extra,
    });

    await session.run(`CREATE (q:Quarter $props)`, { props: p({ id: ids.quarterFoo, name: `Foo Quarter ${suffix}` }) });
    await session.run(`CREATE (q:Quarter $props)`, { props: p({ id: ids.quarterBar, name: `Bar Quarter ${suffix}` }) });

    // --- repeat-land-cases fixture: 3 cases, 2 families, 1 repeat witness ---
    await session.run(`CREATE (pa:Parcel $props)`, { props: p({ id: ids.parcelRepeat, parcel_ref: `REPEAT-${suffix}` }) });
    for (const [caseId, num] of [
      [ids.case1, "C1"],
      [ids.case2, "C2"],
      [ids.case3, "C3"],
    ] as const) {
      await session.run(`CREATE (c:Case $props)`, { props: p({ id: caseId, case_number: `${num}-${suffix}`, type: "land", status: "open" }) });
      await session.run(`MATCH (c:Case {id: $cid}), (pa:Parcel {id: $pid}) CREATE (c)-[:CONCERNS]->(pa)`, {
        cid: caseId,
        pid: ids.parcelRepeat,
      });
    }
    await session.run(`CREATE (f:Family $props)`, { props: p({ id: ids.familyA, name: `Zinnah family ${suffix}` }) });
    await session.run(`CREATE (f:Family $props)`, { props: p({ id: ids.familyB, name: `Toe family ${suffix}` }) });
    for (const familyId of [ids.familyA, ids.familyB]) {
      for (const caseId of [ids.case1, ids.case2, ids.case3]) {
        await session.run(`MATCH (f:Family {id: $fid}), (c:Case {id: $cid}) CREATE (f)-[:PARTY_TO]->(c)`, {
          fid: familyId,
          cid: caseId,
        });
      }
    }
    await session.run(`CREATE (per:Person $props)`, { props: p({ id: ids.party1, full_name: `Party One ${suffix}` }) });
    await session.run(`MATCH (c:Case {id: $cid}), (per:Person {id: $pid}) CREATE (c)-[:INVOLVES]->(per)`, {
      cid: ids.case1,
      pid: ids.party1,
    });

    await session.run(`CREATE (h:Hearing $props)`, { props: p({ id: ids.hearing1, date: now }) });
    await session.run(`CREATE (h:Hearing $props)`, { props: p({ id: ids.hearing2, date: now }) });
    await session.run(`MATCH (c:Case {id: $cid}), (h:Hearing {id: $hid}) CREATE (c)-[:HEARD_AT]->(h)`, {
      cid: ids.case1,
      hid: ids.hearing1,
    });
    await session.run(`MATCH (c:Case {id: $cid}), (h:Hearing {id: $hid}) CREATE (c)-[:HEARD_AT]->(h)`, {
      cid: ids.case2,
      hid: ids.hearing2,
    });
    await session.run(`CREATE (per:Person $props)`, { props: p({ id: ids.witnessRepeat, full_name: `Repeat Witness ${suffix}` }) });
    await session.run(`CREATE (per:Person $props)`, { props: p({ id: ids.witnessOnce, full_name: `Once Witness ${suffix}` }) });
    await session.run(`MATCH (per:Person {id: $pid}), (h:Hearing {id: $hid}) CREATE (per)-[:WITNESS_IN]->(h)`, {
      pid: ids.witnessRepeat,
      hid: ids.hearing1,
    });
    await session.run(`MATCH (per:Person {id: $pid}), (h:Hearing {id: $hid}) CREATE (per)-[:WITNESS_IN]->(h)`, {
      pid: ids.witnessRepeat,
      hid: ids.hearing2,
    });
    await session.run(`MATCH (per:Person {id: $pid}), (h:Hearing {id: $hid}) CREATE (per)-[:WITNESS_IN]->(h)`, {
      pid: ids.witnessOnce,
      hid: ids.hearing1,
    });

    // --- negative control: a parcel with only one land case ---
    await session.run(`CREATE (pa:Parcel $props)`, { props: p({ id: ids.parcelSingle, parcel_ref: `SINGLE-${suffix}` }) });
    await session.run(`CREATE (c:Case $props)`, {
      props: p({ id: ids.caseSingle, case_number: `SINGLE-${suffix}`, type: "land", status: "open" }),
    });
    await session.run(`MATCH (c:Case {id: $cid}), (pa:Parcel {id: $pid}) CREATE (c)-[:CONCERNS]->(pa)`, {
      cid: ids.caseSingle,
      pid: ids.parcelSingle,
    });

    // --- LIVES_IN sync fixture ---
    await session.run(`CREATE (f:Family $props)`, { props: p({ id: ids.familySync, name: `Sync Family ${suffix}` }) });

    // --- link read-endpoint fixtures ---
    await session.run(`CREATE (f:Family $props)`, { props: p({ id: ids.familyMemberTest, name: `Member Test Family ${suffix}` }) });
    await session.run(`CREATE (per:Person $props)`, { props: p({ id: ids.personMemberTest, full_name: `Member Test Person ${suffix}` }) });
    await session.run(`CREATE (c:Case $props)`, {
      props: p({ id: ids.caseFamilyTest, case_number: `FAMTEST-${suffix}`, type: "land", status: "open" }),
    });
    await session.run(`CREATE (h:Hearing $props)`, { props: p({ id: ids.hearingWitnessTest, date: now }) });
    await session.run(`CREATE (per:Person $props)`, {
      props: p({ id: ids.personWitnessTest, full_name: `Witness Test Person ${suffix}` }),
    });
  }

  beforeAll(async () => {
    const appMod = await import("../src/app.js");
    createApp = appMod.createApp;
    const dbMod = await import("../src/db/neo4j.js");
    closeDriver = dbMod.closeDriver;
    getSession = dbMod.getSession;
    issueSessionToken = (await import("../src/auth/session.js")).issueSessionToken;

    const session = getSession("WRITE");
    try {
      await seed(session);
    } finally {
      await session.close();
    }

    tokenClerkA = issueSessionToken({ email: "phase3-clerk@example.com", role: "Clerk", county: COUNTY, district: DISTRICT_A });
    tokenCommissionerA = issueSessionToken({
      email: "phase3-commissioner@example.com",
      role: "Commissioner",
      county: COUNTY,
      district: DISTRICT_A,
    });

    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  afterAll(async () => {
    const session = getSession("WRITE");
    try {
      await session.run(`MATCH (n {test_run_id: $runId}) DETACH DELETE n`, { runId });
    } finally {
      await session.close();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDriver();
  });

  async function get(path: string, token: string) {
    const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status, body: await res.json() };
  }
  async function post(path: string, token: string, body: unknown) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  it("repeat-land-cases (full): flags the 3-case parcel with both families and the repeat witness, not the single-case parcel", async () => {
    const { status, body } = await get("/analysis/repeat-land-cases", tokenCommissionerA);
    expect(status).toBe(200);

    const foundIds = body.findings.map((f: any) => f.parcel_id);
    expect(foundIds).toContain(ids.parcelRepeat);
    expect(foundIds).not.toContain(ids.parcelSingle);

    const finding = body.findings.find((f: any) => f.parcel_id === ids.parcelRepeat);
    expect(finding.case_count).toBe(3);
    expect(finding.families.sort()).toEqual([`Toe family ${suffix}`, `Zinnah family ${suffix}`].sort());
    expect(finding.parties).toContain(`Party One ${suffix}`);
    expect(finding.repeat_witnesses).toContain(`Repeat Witness ${suffix}`);
    expect(finding.repeat_witnesses).not.toContain(`Once Witness ${suffix}`);
  });

  it("relate(): Family LIVES_IN syncs the quarter string and is single-target", async () => {
    let res = await post("/relate", tokenClerkA, {
      type: "LIVES_IN",
      from: { resource: "Family", id: ids.familySync },
      to: { resource: "Quarter", id: ids.quarterFoo },
    });
    expect(res.status).toBe(200);

    let family = await get(`/families/${ids.familySync}`, tokenClerkA);
    expect(family.body.item.quarter).toBe(`Foo Quarter ${suffix}`);

    res = await post("/relate", tokenClerkA, {
      type: "LIVES_IN",
      from: { resource: "Family", id: ids.familySync },
      to: { resource: "Quarter", id: ids.quarterBar },
    });
    expect(res.status).toBe(200);

    family = await get(`/families/${ids.familySync}`, tokenClerkA);
    expect(family.body.item.quarter).toBe(`Bar Quarter ${suffix}`);

    const session = getSession("READ");
    try {
      const result = await session.run(`MATCH (f:Family {id: $id})-[:LIVES_IN]->(q:Quarter) RETURN count(*) AS c`, {
        id: ids.familySync,
      });
      expect(result.records[0].get("c")).toBe(1);
    } finally {
      await session.close();
    }
  });

  it("MEMBER_OF / PARTY_TO / WITNESS_IN: the link read endpoints reflect what relate() creates", async () => {
    let res = await post("/relate", tokenClerkA, {
      type: "MEMBER_OF",
      from: { resource: "Person", id: ids.personMemberTest },
      to: { resource: "Family", id: ids.familyMemberTest },
    });
    expect(res.status).toBe(200);
    let listing = await get(`/families/${ids.familyMemberTest}/members`, tokenClerkA);
    expect(listing.body.items.map((i: any) => i.id)).toContain(ids.personMemberTest);

    res = await post("/relate", tokenClerkA, {
      type: "PARTY_TO",
      from: { resource: "Family", id: ids.familyMemberTest },
      to: { resource: "Case", id: ids.caseFamilyTest },
    });
    expect(res.status).toBe(200);
    listing = await get(`/cases/${ids.caseFamilyTest}/families`, tokenClerkA);
    expect(listing.body.items.map((i: any) => i.id)).toContain(ids.familyMemberTest);

    res = await post("/relate", tokenClerkA, {
      type: "WITNESS_IN",
      from: { resource: "Person", id: ids.personWitnessTest },
      to: { resource: "Hearing", id: ids.hearingWitnessTest },
    });
    expect(res.status).toBe(200);
    listing = await get(`/hearings/${ids.hearingWitnessTest}/witnesses`, tokenClerkA);
    expect(listing.body.items.map((i: any) => i.id)).toContain(ids.personWitnessTest);
  });
});
