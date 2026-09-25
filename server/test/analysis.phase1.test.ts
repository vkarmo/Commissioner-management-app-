import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, skipReason } from "./testEnv.js";

if (!hasTestDb) {
  // eslint-disable-next-line no-console
  console.warn(`[analysis.phase1.test] ${skipReason}`);
}

const describeIfDb = hasTestDb ? describe : describe.skip;

/**
 * Phase 1 (schema-patch spec, 2026-09-25): 1.1 (Person -> Quarter LIVES_IN,
 * migration M1), 1.2 (chief dedup via CHIEF_OF, migration M2), 1.3
 * (location-string/edge consistency) and 1.4 (case-party review queue).
 *
 * M1/M2 are NOT scoped to county/district — they scan every Person/Quarter
 * in the database by design (see their file comments) — so, like the rest
 * of this suite, this must run against an empty, disposable database (see
 * server/.env.test.example). Fixtures are still tagged with test_run_id so
 * teardown only ever removes what this run created.
 */
describeIfDb("Phase 1: LIVES_IN/CHIEF_OF sync, migrations, location-mismatches, case-party-review", () => {
  let createApp: typeof import("../src/app.js").createApp;
  let closeDriver: typeof import("../src/db/neo4j.js").closeDriver;
  let getSession: typeof import("../src/db/neo4j.js").getSession;
  let issueSessionToken: typeof import("../src/auth/session.js").issueSessionToken;
  let runM1: typeof import("../src/migrations/m1PersonLivesInQuarter.js").runM1;
  let runM2: typeof import("../src/migrations/m2QuarterChiefs.js").runM2;

  const runId = randomUUID();
  const suffix = runId.slice(0, 8);
  const COUNTY = "TestCounty";
  const DISTRICT_A = `TestDistrictA-${suffix}`;
  const DISTRICT_B = `TestDistrictB-${suffix}`;

  let baseUrl: string;
  let server: import("node:http").Server;
  let tokenCommissionerA: string;
  let tokenClerkA: string;

  const ids = {
    quarterFoo: randomUUID(),
    quarterBar: randomUUID(), // different district (B), used for the cross-scope rejection test
    quarterDupA: randomUUID(),
    quarterDupB: randomUUID(),
    quarterMismatchChief: randomUUID(),
    personMatched: randomUUID(),
    personUnmatched: randomUUID(),
    personAmbiguous: randomUUID(),
    personChiefViaLivesIn: randomUUID(),
    personChiefNoMatch: randomUUID(),
    personSyncA: randomUUID(), // for the direct relate() LOCATED_IN/CHIEF_OF sync tests
    personSyncB: randomUUID(),
    caseConsistent: randomUUID(),
    caseMismatchString: randomUUID(),
    caseMissingEdge: randomUUID(),
    caseMissingString: randomUUID(),
    parcelConsistent: randomUUID(),
    parcelMismatch: randomUUID(),
    caseReporterPhoneMatch: randomUUID(),
    caseRespondentNameMatch: randomUUID(),
    caseNoMatch: randomUUID(),
    caseAlreadyLinked: randomUUID(),
    personReporterCandidate: randomUUID(),
    personRespondentCandidate: randomUUID(),
    personAlreadyFiled: randomUUID(),
  };

  async function seed(session: import("neo4j-driver").Session) {
    const now = new Date().toISOString();
    const p = (extra: Record<string, unknown>) => ({
      test_run_id: runId,
      county: COUNTY,
      created_at: now,
      updated_at: now,
      archived: false,
      ...extra,
    });

    // --- Quarters ---
    await session.run(`CREATE (q:Quarter $props)`, {
      props: p({ id: ids.quarterFoo, name: `Foo Quarter ${suffix}`, district: DISTRICT_A }),
    });
    await session.run(`CREATE (q:Quarter $props)`, {
      props: p({ id: ids.quarterBar, name: `Bar Quarter ${suffix}`, district: DISTRICT_B }),
    });
    await session.run(`CREATE (q:Quarter $props)`, {
      props: p({ id: ids.quarterDupA, name: `Dup Quarter ${suffix}`, district: DISTRICT_A }),
    });
    await session.run(`CREATE (q:Quarter $props)`, {
      props: p({ id: ids.quarterDupB, name: `Dup Quarter ${suffix}`, district: DISTRICT_A }),
    });
    await session.run(`CREATE (q:Quarter $props)`, {
      props: p({
        id: ids.quarterMismatchChief,
        name: `Mismatch Chief Quarter ${suffix}`,
        district: DISTRICT_A,
        chief_name: `Nobody Linked ${suffix}`,
      }),
    });

    // --- M1 fixtures ---
    await session.run(`CREATE (per:Person $props)`, {
      props: p({
        id: ids.personMatched,
        district: DISTRICT_A,
        full_name: `Matched Person ${suffix}`,
        quarter: `  FOO quarter ${suffix}  `,
      }),
    });
    await session.run(`CREATE (per:Person $props)`, {
      props: p({
        id: ids.personUnmatched,
        district: DISTRICT_A,
        full_name: `Unmatched Person ${suffix}`,
        quarter: `Nonexistent Quarter ${suffix}`,
      }),
    });
    await session.run(`CREATE (per:Person $props)`, {
      props: p({
        id: ids.personAmbiguous,
        district: DISTRICT_A,
        full_name: `Ambiguous Person ${suffix}`,
        quarter: `Dup Quarter ${suffix}`,
      }),
    });

    // --- M2 fixtures ---
    await session.run(`CREATE (per:Person $props)`, {
      props: p({
        id: ids.personChiefViaLivesIn,
        district: DISTRICT_A,
        full_name: `Chief Via LivesIn ${suffix}`,
        quarter: `FOO quarter ${suffix}`,
        is_quarter_chief: true,
      }),
    });
    await session.run(`CREATE (per:Person $props)`, {
      props: p({
        id: ids.personChiefNoMatch,
        district: DISTRICT_A,
        full_name: `Chief No Match ${suffix}`,
        quarter: `Totally Missing Quarter ${suffix}`,
        is_quarter_chief: true,
      }),
    });

    // --- relate() sync-test fixtures ---
    await session.run(`CREATE (per:Person $props)`, {
      props: p({ id: ids.personSyncA, district: DISTRICT_A, full_name: `Sync Person A ${suffix}` }),
    });
    await session.run(`CREATE (per:Person $props)`, {
      props: p({ id: ids.personSyncB, district: DISTRICT_A, full_name: `Sync Person B ${suffix}` }),
    });

    // --- 1.3 location-mismatch fixtures (edges created via raw Cypher, not
    // relate(), so the deliberately-inconsistent state survives) ---
    await session.run(`CREATE (c:Case $props)`, {
      props: p({
        id: ids.caseConsistent,
        district: DISTRICT_A,
        case_number: `LOC-CONSISTENT-${suffix}`,
        type: "land",
        status: "open",
        quarter: `Foo Quarter ${suffix}`,
      }),
    });
    await session.run(`MATCH (c:Case {id: $id}), (q:Quarter {id: $qid}) CREATE (c)-[:LOCATED_IN]->(q)`, {
      id: ids.caseConsistent,
      qid: ids.quarterFoo,
    });

    await session.run(`CREATE (c:Case $props)`, {
      props: p({
        id: ids.caseMismatchString,
        district: DISTRICT_A,
        case_number: `LOC-MISMATCH-${suffix}`,
        type: "land",
        status: "open",
        quarter: `Some Other Text ${suffix}`,
      }),
    });
    await session.run(`MATCH (c:Case {id: $id}), (q:Quarter {id: $qid}) CREATE (c)-[:LOCATED_IN]->(q)`, {
      id: ids.caseMismatchString,
      qid: ids.quarterFoo,
    });

    await session.run(`CREATE (c:Case $props)`, {
      props: p({
        id: ids.caseMissingEdge,
        district: DISTRICT_A,
        case_number: `LOC-NOEDGE-${suffix}`,
        type: "land",
        status: "open",
        quarter: `Foo Quarter ${suffix}`,
      }),
    });

    await session.run(`CREATE (c:Case $props)`, {
      props: p({
        id: ids.caseMissingString,
        district: DISTRICT_A,
        case_number: `LOC-NOSTRING-${suffix}`,
        type: "land",
        status: "open",
      }),
    });
    await session.run(`MATCH (c:Case {id: $id}), (q:Quarter {id: $qid}) CREATE (c)-[:LOCATED_IN]->(q)`, {
      id: ids.caseMissingString,
      qid: ids.quarterFoo,
    });

    await session.run(`CREATE (pa:Parcel $props)`, {
      props: p({ id: ids.parcelConsistent, district: DISTRICT_A, parcel_ref: `PARCEL-OK-${suffix}`, quarter: `Foo Quarter ${suffix}` }),
    });
    await session.run(`MATCH (pa:Parcel {id: $id}), (q:Quarter {id: $qid}) CREATE (pa)-[:LOCATED_IN]->(q)`, {
      id: ids.parcelConsistent,
      qid: ids.quarterFoo,
    });
    await session.run(`CREATE (pa:Parcel $props)`, {
      props: p({ id: ids.parcelMismatch, district: DISTRICT_A, parcel_ref: `PARCEL-BAD-${suffix}`, quarter: `Wrong ${suffix}` }),
    });
    await session.run(`MATCH (pa:Parcel {id: $id}), (q:Quarter {id: $qid}) CREATE (pa)-[:LOCATED_IN]->(q)`, {
      id: ids.parcelMismatch,
      qid: ids.quarterFoo,
    });

    // --- 1.4 case-party-review fixtures ---
    await session.run(`CREATE (per:Person $props)`, {
      props: p({
        id: ids.personReporterCandidate,
        district: DISTRICT_A,
        full_name: `Reporter Candidate ${suffix}`,
        phone: `+1000${suffix}`,
      }),
    });
    await session.run(`CREATE (per:Person $props)`, {
      props: p({ id: ids.personRespondentCandidate, district: DISTRICT_A, full_name: `Respondent Candidate ${suffix}` }),
    });
    await session.run(`CREATE (per:Person $props)`, {
      props: p({ id: ids.personAlreadyFiled, district: DISTRICT_A, full_name: `Already Filed ${suffix}` }),
    });

    await session.run(`CREATE (c:Case $props)`, {
      props: p({
        id: ids.caseReporterPhoneMatch,
        district: DISTRICT_A,
        case_number: `REVIEW-PHONE-${suffix}`,
        type: "family",
        status: "open",
        reporter_name: `Reporter Candidate ${suffix}`,
        reporter_phone: `+1000${suffix}`,
      }),
    });
    await session.run(`CREATE (c:Case $props)`, {
      props: p({
        id: ids.caseRespondentNameMatch,
        district: DISTRICT_A,
        case_number: `REVIEW-NAME-${suffix}`,
        type: "family",
        status: "open",
        respondent_name: `Respondent Candidate ${suffix}`,
      }),
    });
    await session.run(`CREATE (c:Case $props)`, {
      props: p({
        id: ids.caseNoMatch,
        district: DISTRICT_A,
        case_number: `REVIEW-NOMATCH-${suffix}`,
        type: "family",
        status: "intake_pending",
        reporter_name: `Nobody Known ${suffix}`,
      }),
    });
    await session.run(`CREATE (c:Case $props)`, {
      props: p({
        id: ids.caseAlreadyLinked,
        district: DISTRICT_A,
        case_number: `REVIEW-LINKED-${suffix}`,
        type: "family",
        status: "open",
        reporter_name: `Already Filed ${suffix}`,
      }),
    });
    await session.run(`MATCH (per:Person {id: $pid}), (c:Case {id: $cid}) CREATE (per)-[:FILED]->(c)`, {
      pid: ids.personAlreadyFiled,
      cid: ids.caseAlreadyLinked,
    });
  }

  beforeAll(async () => {
    const appMod = await import("../src/app.js");
    createApp = appMod.createApp;
    const dbMod = await import("../src/db/neo4j.js");
    closeDriver = dbMod.closeDriver;
    getSession = dbMod.getSession;
    issueSessionToken = (await import("../src/auth/session.js")).issueSessionToken;
    runM1 = (await import("../src/migrations/m1PersonLivesInQuarter.js")).runM1;
    runM2 = (await import("../src/migrations/m2QuarterChiefs.js")).runM2;

    const session = getSession("WRITE");
    try {
      await seed(session);
    } finally {
      await session.close();
    }

    tokenCommissionerA = issueSessionToken({ email: "phase1-commissioner@example.com", role: "Commissioner", county: COUNTY, district: DISTRICT_A });
    tokenClerkA = issueSessionToken({ email: "phase1-clerk@example.com", role: "Clerk", county: COUNTY, district: DISTRICT_A });

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

  // --- relate() same-scope guard + derived-field sync -------------------

  it("relate(): rejects a relationship whose endpoints are in different districts", async () => {
    const { status } = await post("/relate", tokenCommissionerA, {
      type: "LIVES_IN",
      from: { resource: "Person", id: ids.personSyncA },
      to: { resource: "Quarter", id: ids.quarterBar }, // district B
    });
    expect(status).toBe(404);
  });

  it("relate(): LOCATED_IN to a Quarter syncs the node's quarter string", async () => {
    const parcelId = randomUUID();
    const now = new Date().toISOString();
    const session = getSession("WRITE");
    try {
      await session.run(`CREATE (pa:Parcel $props)`, {
        props: {
          id: parcelId,
          test_run_id: runId,
          county: COUNTY,
          district: DISTRICT_A,
          created_at: now,
          updated_at: now,
          archived: false,
          parcel_ref: `SYNC-${suffix}`,
        },
      });
    } finally {
      await session.close();
    }

    const { status } = await post("/relate", tokenCommissionerA, {
      type: "LOCATED_IN",
      from: { resource: "Parcel", id: parcelId },
      to: { resource: "Quarter", id: ids.quarterFoo },
    });
    expect(status).toBe(200);

    const { body } = await get(`/parcels/${parcelId}`, tokenCommissionerA);
    expect(body.item.quarter).toBe(`Foo Quarter ${suffix}`);
  });

  it("relate(): CHIEF_OF derives Quarter.chief_name/chief_phone and Person.is_quarter_chief, replacing the previous chief", async () => {
    let res = await post("/relate", tokenCommissionerA, {
      type: "CHIEF_OF",
      from: { resource: "Person", id: ids.personSyncA },
      to: { resource: "Quarter", id: ids.quarterDupA },
    });
    expect(res.status).toBe(200);

    let personA = await get(`/people/${ids.personSyncA}`, tokenCommissionerA);
    expect(personA.body.item.is_quarter_chief).toBe(true);

    let quarters = await get(`/community/quarters?district=${encodeURIComponent(DISTRICT_A)}`, tokenCommissionerA);
    let quarterDupA = quarters.body.items.find((q: any) => q.id === ids.quarterDupA);
    expect(quarterDupA.chief_name).toBe(`Sync Person A ${suffix}`);

    // Replace the chief with a different Person.
    res = await post("/relate", tokenCommissionerA, {
      type: "CHIEF_OF",
      from: { resource: "Person", id: ids.personSyncB },
      to: { resource: "Quarter", id: ids.quarterDupA },
    });
    expect(res.status).toBe(200);

    personA = await get(`/people/${ids.personSyncA}`, tokenCommissionerA);
    expect(personA.body.item.is_quarter_chief).toBe(false);

    const personB = await get(`/people/${ids.personSyncB}`, tokenCommissionerA);
    expect(personB.body.item.is_quarter_chief).toBe(true);

    quarters = await get(`/community/quarters?district=${encodeURIComponent(DISTRICT_A)}`, tokenCommissionerA);
    quarterDupA = quarters.body.items.find((q: any) => q.id === ids.quarterDupA);
    expect(quarterDupA.chief_name).toBe(`Sync Person B ${suffix}`);
  });

  // --- M1 -----------------------------------------------------------------

  it("M1: links the matched Person, leaves unmatched/ambiguous for review, and is idempotent", async () => {
    const first = await runM1();
    expect(first.unmatched.some((r) => r.personId === ids.personUnmatched)).toBe(true);
    expect(first.ambiguous.some((r) => r.personId === ids.personAmbiguous)).toBe(true);
    expect(first.unmatched.some((r) => r.personId === ids.personMatched)).toBe(false);
    expect(first.ambiguous.some((r) => r.personId === ids.personMatched)).toBe(false);

    const linkedCheck = await get(`/people/${ids.personMatched}`, tokenCommissionerA);
    expect(linkedCheck.status).toBe(200);

    const session = getSession("READ");
    try {
      const result = await session.run(
        `MATCH (p:Person {id: $id})-[:LIVES_IN]->(q:Quarter {id: $qid}) RETURN count(*) AS c`,
        { id: ids.personMatched, qid: ids.quarterFoo },
      );
      expect(result.records[0].get("c")).toBe(1);
    } finally {
      await session.close();
    }

    const second = await runM1();
    expect(second.unmatched.some((r) => r.personId === ids.personUnmatched)).toBe(true);
    expect(second.ambiguous.some((r) => r.personId === ids.personAmbiguous)).toBe(true);
    // Already-linked on the first run, so excluded from the second scan entirely.
    expect(second.unmatched.some((r) => r.personId === ids.personMatched)).toBe(false);
    expect(second.ambiguous.some((r) => r.personId === ids.personMatched)).toBe(false);

    const session2 = getSession("READ");
    try {
      const result = await session2.run(
        `MATCH (p:Person {id: $id})-[:LIVES_IN]->(q:Quarter) RETURN count(*) AS c`,
        { id: ids.personMatched },
      );
      expect(result.records[0].get("c")).toBe(1); // still exactly one edge, not duplicated
    } finally {
      await session2.close();
    }
  });

  // --- M2 -----------------------------------------------------------------

  it("M2: links a chief via their LIVES_IN edge, flags an unresolved chief, and flags a Quarter with no matching CHIEF_OF Person", async () => {
    const result = await runM2();

    const session = getSession("READ");
    try {
      const edge = await session.run(
        `MATCH (p:Person {id: $id})-[:CHIEF_OF]->(q:Quarter {id: $qid}) RETURN count(*) AS c`,
        { id: ids.personChiefViaLivesIn, qid: ids.quarterFoo },
      );
      expect(edge.records[0].get("c")).toBe(1);
    } finally {
      await session.close();
    }

    expect(result.personReview.some((r) => r.personId === ids.personChiefNoMatch)).toBe(true);
    expect(result.quarterMismatches.some((r) => r.quarterId === ids.quarterMismatchChief)).toBe(true);

    // Idempotent: running again links nothing new for the already-linked chief.
    const second = await runM2();
    const session2 = getSession("READ");
    try {
      const edge = await session2.run(
        `MATCH (p:Person {id: $id})-[:CHIEF_OF]->(q:Quarter) RETURN count(*) AS c`,
        { id: ids.personChiefViaLivesIn },
      );
      expect(edge.records[0].get("c")).toBe(1);
    } finally {
      await session2.close();
    }
    expect(second.quarterMismatches.some((r) => r.quarterId === ids.quarterMismatchChief)).toBe(true);
  });

  // --- 1.3 location-mismatches ---------------------------------------------

  it("location-mismatches: flags mismatched/missing string-or-edge, not the consistent record", async () => {
    const { status, body } = await get("/analysis/location-mismatches", tokenCommissionerA);
    expect(status).toBe(200);
    const foundIds = body.findings.map((f: any) => f.node_id);
    expect(foundIds).toContain(ids.caseMismatchString);
    expect(foundIds).toContain(ids.caseMissingEdge);
    expect(foundIds).toContain(ids.caseMissingString);
    expect(foundIds).toContain(ids.parcelMismatch);
    expect(foundIds).not.toContain(ids.caseConsistent);
    expect(foundIds).not.toContain(ids.parcelConsistent);
  });

  it("location-mismatches: rejects Clerk (analysis roles only)", async () => {
    const { status } = await get("/analysis/location-mismatches", tokenClerkA);
    expect(status).toBe(403);
  });

  // --- 1.4 case-party-review -----------------------------------------------

  it("case-party-review: lists unresolved cases with candidates, excludes an already-linked one", async () => {
    const { status, body } = await get("/case-party-review", tokenClerkA);
    expect(status).toBe(200);
    const byId = new Map<string, any>(body.items.map((i: any) => [i.case.id, i]));

    expect(byId.get(ids.caseReporterPhoneMatch)?.reporterCandidates.some((c: any) => c.id === ids.personReporterCandidate)).toBe(
      true,
    );
    expect(byId.get(ids.caseRespondentNameMatch)?.respondentCandidates.some((c: any) => c.id === ids.personRespondentCandidate)).toBe(
      true,
    );
    expect(byId.get(ids.caseNoMatch)?.reporterCandidates).toEqual([]);
    expect(byId.has(ids.caseAlreadyLinked)).toBe(false);
  });

  it("case-party-review: confirm creates a FILED edge", async () => {
    const { status } = await post(`/case-party-review/${ids.caseReporterPhoneMatch}/confirm`, tokenClerkA, {
      field: "reporter",
      personId: ids.personReporterCandidate,
    });
    expect(status).toBe(200);

    const session = getSession("READ");
    try {
      const result = await session.run(`MATCH (:Person {id: $pid})-[:FILED]->(:Case {id: $cid}) RETURN count(*) AS c`, {
        pid: ids.personReporterCandidate,
        cid: ids.caseReporterPhoneMatch,
      });
      expect(result.records[0].get("c")).toBe(1);
    } finally {
      await session.close();
    }

    const after = await get("/case-party-review", tokenClerkA);
    expect(after.body.items.some((i: any) => i.case.id === ids.caseReporterPhoneMatch)).toBe(false);
  });

  it("case-party-review: new-person creates a Person and links it as the respondent", async () => {
    const { status, body } = await post(`/case-party-review/${ids.caseNoMatch}/new-person`, tokenClerkA, {
      field: "reporter",
      full_name: `Freshly Created ${suffix}`,
    });
    expect(status).toBe(201);
    expect(body.person.full_name).toBe(`Freshly Created ${suffix}`);

    const session = getSession("WRITE"); // tag the just-created Person for cleanup
    try {
      await session.run(`MATCH (p:Person {id: $id}) SET p.test_run_id = $runId`, { id: body.person.id, runId });
      const result = await session.run(`MATCH (:Person {id: $pid})-[:FILED]->(:Case {id: $cid}) RETURN count(*) AS c`, {
        pid: body.person.id,
        cid: ids.caseNoMatch,
      });
      expect(result.records[0].get("c")).toBe(1);
    } finally {
      await session.close();
    }
  });
});
