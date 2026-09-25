import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, skipReason } from "./testEnv.js";

if (!hasTestDb) {
  // eslint-disable-next-line no-console
  console.warn(`[analysis.phase0.test] ${skipReason}`);
}

const describeIfDb = hasTestDb ? describe : describe.skip;

describeIfDb("Phase 0 analysis checks", () => {
  // Imported inside the guarded describe block, not at module top level,
  // so an unconfigured run never even touches the Neo4j driver singleton.
  let createApp: typeof import("../src/app.js").createApp;
  let closeDriver: typeof import("../src/db/neo4j.js").closeDriver;
  let getSession: typeof import("../src/db/neo4j.js").getSession;
  let issueSessionToken: typeof import("../src/auth/session.js").issueSessionToken;

  const runId = randomUUID();
  const COUNTY = "TestCounty";
  const DISTRICT_A = `TestDistrictA-${runId.slice(0, 8)}`;
  const DISTRICT_B = `TestDistrictB-${runId.slice(0, 8)}`;

  let baseUrl: string;
  let server: import("node:http").Server;
  let tokenCommissionerA: string;
  let tokenClerkA: string;
  let tokenCommissionerB: string;

  const ids = {
    quarterLeftOutA: randomUUID(),
    quarterServedA: randomUUID(),
    liOverA: randomUUID(),
    liNormalA: randomUUID(),
    budgetUnapprovedA: randomUUID(),
    budgetApprovedA: randomUUID(),
    parcelRepeatA: randomUUID(),
    parcelSingleA: randomUUID(),
    quarterLeftOutB: randomUUID(),
    liOverB: randomUUID(),
    budgetUnapprovedB: randomUUID(),
    parcelRepeatB: randomUUID(),
  };

  async function seedDistrict(session: import("neo4j-driver").Session, district: string, d: typeof ids) {
    const now = new Date().toISOString();
    const props = (extra: Record<string, unknown>) => ({
      test_run_id: runId,
      county: COUNTY,
      district,
      created_at: now,
      updated_at: now,
      archived: false,
      ...extra,
    });

    // --- quarters-left-out fixture ---
    await session.run(`CREATE (q:Quarter $props)`, {
      props: props({ id: d.quarterLeftOutA, name: `Left Out Quarter ${d.quarterLeftOutA.slice(0, 6)}`, population: 500 }),
    });
    if (district === DISTRICT_A) {
      await session.run(`CREATE (q:Quarter $props)`, {
        props: props({ id: d.quarterServedA, name: "Served Quarter", population: 300 }),
      });
      await session.run(
        `MATCH (q:Quarter {id: $qid}) CREATE (w:PublicWorksItem $props)-[:LOCATED_IN]->(q)`,
        { qid: d.quarterServedA, props: props({ id: randomUUID(), title: "Recent road works", status: "in_progress" }) },
      );
    }

    // --- line-item-drift fixture ---
    const budgetForLi = randomUUID();
    await session.run(`CREATE (b:Budget $props)`, {
      props: props({ id: budgetForLi, fiscal_year: "2026", source: "County", total_amount: 5000, status: "active" }),
    });
    await session.run(
      `MATCH (b:Budget {id: $bid})
       CREATE (li:BudgetLineItem $liProps)<-[:ALLOCATED_TO]-(b)
       CREATE (dd:Disbursement $ddProps)<-[:DISBURSED_AS]-(li)`,
      {
        bid: budgetForLi,
        liProps: props({ id: d.liOverA, category: "Roads", allocated_amount: 1000 }),
        ddProps: props({ id: randomUUID(), amount: 1500, date: now, purpose: "over-disbursed test fixture" }),
      },
    );
    if (district === DISTRICT_A) {
      await session.run(
        `MATCH (b:Budget {id: $bid})
         CREATE (li:BudgetLineItem $liProps)<-[:ALLOCATED_TO]-(b)
         CREATE (dd:Disbursement $ddProps)<-[:DISBURSED_AS]-(li)
         CREATE (e:Expenditure $eProps)<-[:SPENT_AS]-(dd)`,
        {
          bid: budgetForLi,
          liProps: props({ id: d.liNormalA, category: "Water", allocated_amount: 1000 }),
          ddProps: props({ id: randomUUID(), amount: 500, date: now, purpose: "normal fixture" }),
          eProps: props({ id: randomUUID(), amount: 500, date: now, payee: "Test Vendor" }),
        },
      );
    }

    // --- unapproved-disbursements fixture ---
    await session.run(
      `CREATE (b:Budget $bProps)
       CREATE (li:BudgetLineItem $liProps)<-[:ALLOCATED_TO]-(b)
       CREATE (dd:Disbursement $ddProps)<-[:DISBURSED_AS]-(li)`,
      {
        bProps: props({ id: d.budgetUnapprovedA, fiscal_year: "2026", source: "County", total_amount: 2000, status: "active" }),
        liProps: props({ id: randomUUID(), category: "Unapproved test", allocated_amount: 2000 }),
        ddProps: props({ id: randomUUID(), amount: 300, date: now, purpose: "unapproved fixture" }),
      },
    );
    if (district === DISTRICT_A) {
      await session.run(
        `CREATE (b:Budget $bProps)
         CREATE (li:BudgetLineItem $liProps)<-[:ALLOCATED_TO]-(b)
         CREATE (dd:Disbursement $ddProps)<-[:DISBURSED_AS]-(li)
         CREATE (a:ApprovalAction $aProps)-[:ON]->(b)`,
        {
          bProps: props({ id: d.budgetApprovedA, fiscal_year: "2026", source: "County", total_amount: 2000, status: "active" }),
          liProps: props({ id: randomUUID(), category: "Approved test", allocated_amount: 2000 }),
          ddProps: props({ id: randomUUID(), amount: 300, date: now, purpose: "approved fixture" }),
          aProps: props({ id: randomUUID(), date: now, decision: "approved", approving_body: "County Council" }),
        },
      );
    }

    // --- repeat-land-cases fixture ---
    await session.run(
      `CREATE (p:Parcel $pProps)
       CREATE (c1:Case $c1Props)-[:CONCERNS]->(p)
       CREATE (c2:Case $c2Props)-[:CONCERNS]->(p)`,
      {
        pProps: props({ id: d.parcelRepeatA, parcel_ref: `REPEAT-${district.slice(-4)}` }),
        c1Props: props({ id: randomUUID(), case_number: "C1", type: "land", status: "open" }),
        c2Props: props({ id: randomUUID(), case_number: "C2", type: "land", status: "open" }),
      },
    );
    if (district === DISTRICT_A) {
      await session.run(
        `CREATE (p:Parcel $pProps)
         CREATE (c1:Case $c1Props)-[:CONCERNS]->(p)`,
        {
          pProps: props({ id: d.parcelSingleA, parcel_ref: "SINGLE" }),
          c1Props: props({ id: randomUUID(), case_number: "C3", type: "land", status: "open" }),
        },
      );
    }
  }

  beforeAll(async () => {
    const mod = await import("../src/app.js");
    createApp = mod.createApp;
    const dbMod = await import("../src/db/neo4j.js");
    closeDriver = dbMod.closeDriver;
    getSession = dbMod.getSession;
    issueSessionToken = (await import("../src/auth/session.js")).issueSessionToken;

    const session = getSession("WRITE");
    try {
      await seedDistrict(session, DISTRICT_A, ids);
      await seedDistrict(session, DISTRICT_B, {
        ...ids,
        quarterLeftOutA: ids.quarterLeftOutB,
        liOverA: ids.liOverB,
        budgetUnapprovedA: ids.budgetUnapprovedB,
        parcelRepeatA: ids.parcelRepeatB,
      });
    } finally {
      await session.close();
    }

    tokenCommissionerA = issueSessionToken({ email: "test-commissioner@example.com", role: "Commissioner", county: COUNTY, district: DISTRICT_A });
    tokenClerkA = issueSessionToken({ email: "test-clerk@example.com", role: "Clerk", county: COUNTY, district: DISTRICT_A });
    tokenCommissionerB = issueSessionToken({ email: "test-commissioner-b@example.com", role: "Commissioner", county: COUNTY, district: DISTRICT_B });

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

  it("rejects Clerk (role-gated to Commissioner/Official/SuperAdmin)", async () => {
    const { status } = await get("/analysis/quarters-left-out", tokenClerkA);
    expect(status).toBe(403);
  });

  it("quarters-left-out: flags the unserved quarter, not the served one", async () => {
    const { status, body } = await get("/analysis/quarters-left-out", tokenCommissionerA);
    expect(status).toBe(200);
    const foundIds = body.findings.map((f: any) => f.quarter_id);
    expect(foundIds).toContain(ids.quarterLeftOutA);
    expect(foundIds).not.toContain(ids.quarterServedA);
  });

  it("line-item-drift: flags the over-disbursed line, not the normal one", async () => {
    const { status, body } = await get("/analysis/line-item-drift", tokenCommissionerA);
    expect(status).toBe(200);
    const byId = new Map<string, any>(body.findings.map((f: any) => [f.line_item_id, f]));
    expect(byId.get(ids.liOverA)?.flag).toBe("over_disbursed");
    expect(byId.has(ids.liNormalA)).toBe(false);
  });

  it("unapproved-disbursements: flags the unapproved budget, not the approved one", async () => {
    const { status, body } = await get("/analysis/unapproved-disbursements", tokenCommissionerA);
    expect(status).toBe(200);
    const foundIds = body.findings.map((f: any) => f.budget_id);
    expect(foundIds).toContain(ids.budgetUnapprovedA);
    expect(foundIds).not.toContain(ids.budgetApprovedA);
  });

  it("repeat-land-cases: flags the parcel with 2 cases, not the one with 1", async () => {
    const { status, body } = await get("/analysis/repeat-land-cases", tokenCommissionerA);
    expect(status).toBe(200);
    const foundIds = body.findings.map((f: any) => f.parcel_id);
    expect(foundIds).toContain(ids.parcelRepeatA);
    expect(foundIds).not.toContain(ids.parcelSingleA);
  });

  it("scope isolation: district A's results never include district B's fixture", async () => {
    const [quartersA, budgetsA, parcelsA] = await Promise.all([
      get("/analysis/quarters-left-out", tokenCommissionerA),
      get("/analysis/unapproved-disbursements", tokenCommissionerA),
      get("/analysis/repeat-land-cases", tokenCommissionerA),
    ]);
    expect(quartersA.body.findings.map((f: any) => f.quarter_id)).not.toContain(ids.quarterLeftOutB);
    expect(budgetsA.body.findings.map((f: any) => f.budget_id)).not.toContain(ids.budgetUnapprovedB);
    expect(parcelsA.body.findings.map((f: any) => f.parcel_id)).not.toContain(ids.parcelRepeatB);
  });

  it("scope isolation: district B sees its own fixture, not district A's", async () => {
    const { status, body } = await get("/analysis/quarters-left-out", tokenCommissionerB);
    expect(status).toBe(200);
    const foundIds = body.findings.map((f: any) => f.quarter_id);
    expect(foundIds).toContain(ids.quarterLeftOutB);
    expect(foundIds).not.toContain(ids.quarterLeftOutA);
  });
});
