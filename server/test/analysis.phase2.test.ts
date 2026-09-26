import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, skipReason } from "./testEnv.js";

if (!hasTestDb) {
  // eslint-disable-next-line no-console
  console.warn(`[analysis.phase2.test] ${skipReason}`);
}

const describeIfDb = hasTestDb ? describe : describe.skip;

/**
 * Phase 2 (schema-patch spec, 2026-09-26): Contractor + BUILT_BY/PAID_TO/
 * FOR, the stalled-contractors check, the PublicWorksItem.status
 * normalization migration, and migration M5 (contractor-review queue).
 */
describeIfDb("Phase 2: contractors, stalled-contractors, status normalization, contractor review", () => {
  let createApp: typeof import("../src/app.js").createApp;
  let closeDriver: typeof import("../src/db/neo4j.js").closeDriver;
  let getSession: typeof import("../src/db/neo4j.js").getSession;
  let issueSessionToken: typeof import("../src/auth/session.js").issueSessionToken;
  let runNormalizePublicWorksStatus: typeof import("../src/migrations/normalizePublicWorksStatus.js").runNormalizePublicWorksStatus;

  const runId = randomUUID();
  const suffix = runId.slice(0, 8);
  const COUNTY = "TestCounty";
  const DISTRICT_A = `TestDistrictA-${suffix}`;

  let baseUrl: string;
  let server: import("node:http").Server;
  let tokenClerkA: string;

  const past = "2020-01-01";
  const future = "2099-01-01";

  const ids = {
    contractorAlpha: randomUUID(),
    contractorBeta: randomUUID(),
    contractorGamma: randomUUID(),
    pwiOverdue1: randomUUID(),
    pwiOverdue2: randomUUID(),
    pwiSingleOverdue: randomUUID(),
    pwiFuture1: randomUUID(),
    pwiFuture2: randomUUID(),
    pwiMulti: randomUUID(),
    pwiReplaceA: randomUUID(),
    pwiReplaceB: randomUUID(),
    expOverdue1: randomUUID(),
    expReplaceTarget: randomUUID(),
    pwiSynonym1: randomUUID(),
    pwiSynonym2: randomUUID(),
    pwiAmbiguousStatus: randomUUID(),
    pwiAlreadyCanonical: randomUUID(),
    expPayeeA1: randomUUID(),
    expPayeeA2: randomUUID(),
    expPayeeB: randomUUID(),
    expAlreadyLinked: randomUUID(),
    contractorAlreadyLinked: randomUUID(),
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

    for (const [id, name] of [
      [ids.contractorAlpha, `Alpha Builders ${suffix}`],
      [ids.contractorBeta, `Beta Construction ${suffix}`],
      [ids.contractorGamma, `Gamma Works ${suffix}`],
      [ids.contractorAlreadyLinked, `Already Linked Co ${suffix}`],
    ]) {
      await session.run(`CREATE (k:Contractor $props)`, { props: p({ id, name }) });
    }

    const pwi = async (id: string, title: string, status: string, targetDate: string) => {
      await session.run(`CREATE (w:PublicWorksItem $props)`, {
        props: p({ id, title, status, target_date: targetDate }),
      });
    };
    await pwi(ids.pwiOverdue1, `Overdue Road 1 ${suffix}`, "stalled", past);
    await pwi(ids.pwiOverdue2, `Overdue Road 2 ${suffix}`, "in_progress", past);
    await pwi(ids.pwiSingleOverdue, `Single Overdue ${suffix}`, "stalled", past);
    await pwi(ids.pwiFuture1, `Future Item 1 ${suffix}`, "planned", future);
    await pwi(ids.pwiFuture2, `Future Item 2 ${suffix}`, "in_progress", future);
    await pwi(ids.pwiMulti, `Multi Contractor Item ${suffix}`, "in_progress", future);
    await pwi(ids.pwiReplaceA, `Replace Target A ${suffix}`, "planned", future);
    await pwi(ids.pwiReplaceB, `Replace Target B ${suffix}`, "planned", future);

    const builtBy = async (workId: string, contractorId: string) => {
      await session.run(`MATCH (w:PublicWorksItem {id: $wid}), (k:Contractor {id: $kid}) CREATE (w)-[:BUILT_BY]->(k)`, {
        wid: workId,
        kid: contractorId,
      });
    };
    await builtBy(ids.pwiOverdue1, ids.contractorAlpha);
    await builtBy(ids.pwiOverdue2, ids.contractorAlpha);
    await builtBy(ids.pwiSingleOverdue, ids.contractorBeta);
    await builtBy(ids.pwiFuture1, ids.contractorGamma);
    await builtBy(ids.pwiFuture2, ids.contractorGamma);

    await session.run(`CREATE (e:Expenditure $props)`, {
      props: p({ id: ids.expOverdue1, amount: 500, date: now, payee: `Alpha Builders ${suffix}` }),
    });
    await session.run(`MATCH (e:Expenditure {id: $eid}), (w:PublicWorksItem {id: $wid}) CREATE (e)-[:FOR]->(w)`, {
      eid: ids.expOverdue1,
      wid: ids.pwiOverdue1,
    });

    await session.run(`CREATE (e:Expenditure $props)`, {
      props: p({ id: ids.expReplaceTarget, amount: 100, date: now, payee: `Replace Target Vendor ${suffix}` }),
    });

    // --- status normalization fixtures ---
    await pwi(ids.pwiSynonym1, `Synonym Item 1 ${suffix}`, "In-Progress", future);
    await pwi(ids.pwiSynonym2, `Synonym Item 2 ${suffix}`, "complete", future);
    await pwi(ids.pwiAmbiguousStatus, `Ambiguous Status Item ${suffix}`, "funded", future);
    await pwi(ids.pwiAlreadyCanonical, `Already Canonical Item ${suffix}`, "planned", future);

    // --- contractor-review (M5) fixtures ---
    await session.run(`CREATE (e:Expenditure $props)`, {
      props: p({ id: ids.expPayeeA1, amount: 1000, date: now, payee: "ABC Construction Inc." }),
    });
    await session.run(`CREATE (e:Expenditure $props)`, {
      props: p({ id: ids.expPayeeA2, amount: 500, date: now, payee: "abc construction" }),
    });
    await session.run(`CREATE (e:Expenditure $props)`, {
      props: p({ id: ids.expPayeeB, amount: 200, date: now, payee: `Random Vendor ${suffix}` }),
    });
    await session.run(`CREATE (e:Expenditure $props)`, {
      props: p({
        id: ids.expAlreadyLinked,
        amount: 50,
        date: now,
        payee: `Old Vendor ${suffix}`,
        contractor_review_status: "linked",
      }),
    });
    await session.run(`MATCH (e:Expenditure {id: $eid}), (k:Contractor {id: $kid}) CREATE (e)-[:PAID_TO]->(k)`, {
      eid: ids.expAlreadyLinked,
      kid: ids.contractorAlreadyLinked,
    });
  }

  beforeAll(async () => {
    const appMod = await import("../src/app.js");
    createApp = appMod.createApp;
    const dbMod = await import("../src/db/neo4j.js");
    closeDriver = dbMod.closeDriver;
    getSession = dbMod.getSession;
    issueSessionToken = (await import("../src/auth/session.js")).issueSessionToken;
    runNormalizePublicWorksStatus = (await import("../src/migrations/normalizePublicWorksStatus.js")).runNormalizePublicWorksStatus;

    const session = getSession("WRITE");
    try {
      await seed(session);
    } finally {
      await session.close();
    }

    tokenClerkA = issueSessionToken({ email: "phase2-clerk@example.com", role: "Clerk", county: COUNTY, district: DISTRICT_A });

    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  const newlyCreatedContractorIds: string[] = [];

  afterAll(async () => {
    const session = getSession("WRITE");
    try {
      await session.run(
        `MATCH (n) WHERE n.test_run_id = $runId OR n.id IN $newContractorIds DETACH DELETE n`,
        { runId, newContractorIds: newlyCreatedContractorIds },
      );
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

  it("relate(): BUILT_BY allows more than one Contractor on the same PublicWorksItem", async () => {
    let res = await post("/relate", tokenClerkA, {
      type: "BUILT_BY",
      from: { resource: "PublicWorksItem", id: ids.pwiMulti },
      to: { resource: "Contractor", id: ids.contractorAlpha },
    });
    expect(res.status).toBe(200);
    res = await post("/relate", tokenClerkA, {
      type: "BUILT_BY",
      from: { resource: "PublicWorksItem", id: ids.pwiMulti },
      to: { resource: "Contractor", id: ids.contractorBeta },
    });
    expect(res.status).toBe(200);

    const session = getSession("READ");
    try {
      const result = await session.run(`MATCH (w:PublicWorksItem {id: $id})-[:BUILT_BY]->(k:Contractor) RETURN count(*) AS c`, {
        id: ids.pwiMulti,
      });
      expect(result.records[0].get("c")).toBe(2);
    } finally {
      await session.close();
    }
  });

  it("relate(): PAID_TO and FOR are single-target — relating again replaces the previous one", async () => {
    let res = await post("/relate", tokenClerkA, {
      type: "PAID_TO",
      from: { resource: "Expenditure", id: ids.expReplaceTarget },
      to: { resource: "Contractor", id: ids.contractorAlpha },
    });
    expect(res.status).toBe(200);
    res = await post("/relate", tokenClerkA, {
      type: "PAID_TO",
      from: { resource: "Expenditure", id: ids.expReplaceTarget },
      to: { resource: "Contractor", id: ids.contractorBeta },
    });
    expect(res.status).toBe(200);

    res = await post("/relate", tokenClerkA, {
      type: "FOR",
      from: { resource: "Expenditure", id: ids.expReplaceTarget },
      to: { resource: "PublicWorksItem", id: ids.pwiReplaceA },
    });
    expect(res.status).toBe(200);
    res = await post("/relate", tokenClerkA, {
      type: "FOR",
      from: { resource: "Expenditure", id: ids.expReplaceTarget },
      to: { resource: "PublicWorksItem", id: ids.pwiReplaceB },
    });
    expect(res.status).toBe(200);

    const session = getSession("READ");
    try {
      const paidTo = await session.run(`MATCH (e:Expenditure {id: $id})-[:PAID_TO]->(k:Contractor) RETURN k.id AS id`, {
        id: ids.expReplaceTarget,
      });
      expect(paidTo.records.map((r) => r.get("id"))).toEqual([ids.contractorBeta]);

      const forResult = await session.run(`MATCH (e:Expenditure {id: $id})-[:FOR]->(w:PublicWorksItem) RETURN w.id AS id`, {
        id: ids.expReplaceTarget,
      });
      expect(forResult.records.map((r) => r.get("id"))).toEqual([ids.pwiReplaceB]);
    } finally {
      await session.close();
    }
  });

  it("stalled-contractors: flags a contractor with 2+ overdue items, not one with 1 overdue or 2 future items", async () => {
    const { status, body } = await get("/analysis/stalled-contractors", tokenClerkA);
    expect(status).toBe(200);
    const byId = new Map<string, any>(body.findings.map((f: any) => [f.contractor_id, f]));

    expect(byId.has(ids.contractorAlpha)).toBe(true);
    expect(byId.get(ids.contractorAlpha).overdue_items.length).toBe(2);
    expect(byId.get(ids.contractorAlpha).paid_on_overdue_items).toBe(500);

    expect(byId.has(ids.contractorBeta)).toBe(false);
    expect(byId.has(ids.contractorGamma)).toBe(false);
  });

  it("normalize-status: maps obvious synonyms, leaves an ambiguous value for review, and is idempotent", async () => {
    const first = await runNormalizePublicWorksStatus();
    expect(first.review.some((r) => r.id === ids.pwiAmbiguousStatus && r.status === "funded")).toBe(true);

    const session = getSession("READ");
    try {
      const result = await session.run(
        `MATCH (w:PublicWorksItem) WHERE w.id IN [$s1, $s2] RETURN w.id AS id, w.status AS status`,
        { s1: ids.pwiSynonym1, s2: ids.pwiSynonym2 },
      );
      const byId = new Map(result.records.map((r) => [r.get("id"), r.get("status")]));
      expect(byId.get(ids.pwiSynonym1)).toBe("in_progress");
      expect(byId.get(ids.pwiSynonym2)).toBe("completed");

      const untouched = await session.run(`MATCH (w:PublicWorksItem {id: $id}) RETURN w.status AS status`, {
        id: ids.pwiAlreadyCanonical,
      });
      expect(untouched.records[0].get("status")).toBe("planned");
    } finally {
      await session.close();
    }

    const second = await runNormalizePublicWorksStatus();
    expect(second.review.some((r) => r.id === ids.pwiAmbiguousStatus)).toBe(true);

    const session2 = getSession("READ");
    try {
      const result = await session2.run(`MATCH (w:PublicWorksItem {id: $id}) RETURN w.status AS status`, {
        id: ids.pwiSynonym1,
      });
      expect(result.records[0].get("status")).toBe("in_progress"); // unchanged, not re-mapped or corrupted
    } finally {
      await session2.close();
    }
  });

  it("contractor-review: groups unreviewed payees, excludes an already-linked one, confirm links a new contractor, dismiss marks not-a-contractor", async () => {
    const listing = await get("/contractor-review", tokenClerkA);
    expect(listing.status).toBe(200);

    const abcGroup = listing.body.groups.find((g: any) => g.expenditureIds.includes(ids.expPayeeA1));
    expect(abcGroup).toBeTruthy();
    expect(abcGroup.expenditureIds).toContain(ids.expPayeeA2);
    expect(abcGroup.totalAmount).toBe(1500);

    const randomGroup = listing.body.groups.find((g: any) => g.expenditureIds.includes(ids.expPayeeB));
    expect(randomGroup).toBeTruthy();

    const anyGroupHasAlreadyLinked = listing.body.groups.some((g: any) => g.expenditureIds.includes(ids.expAlreadyLinked));
    expect(anyGroupHasAlreadyLinked).toBe(false);

    const confirmRes = await post("/contractor-review/confirm", tokenClerkA, {
      expenditureIds: abcGroup.expenditureIds,
      contractor: { name: `ABC Construction ${suffix}` },
    });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.linked).toBe(2);
    newlyCreatedContractorIds.push(confirmRes.body.contractor.id);

    const dismissRes = await post("/contractor-review/dismiss", tokenClerkA, { expenditureIds: randomGroup.expenditureIds });
    expect(dismissRes.status).toBe(200);

    const session = getSession("READ");
    try {
      const linkedCheck = await session.run(
        `MATCH (e:Expenditure)-[:PAID_TO]->(k:Contractor {id: $kid}) WHERE e.id IN [$a1, $a2] RETURN count(*) AS c`,
        { kid: confirmRes.body.contractor.id, a1: ids.expPayeeA1, a2: ids.expPayeeA2 },
      );
      expect(linkedCheck.records[0].get("c")).toBe(2);

      const dismissedCheck = await session.run(`MATCH (e:Expenditure {id: $id}) RETURN e.contractor_review_status AS s`, {
        id: ids.expPayeeB,
      });
      expect(dismissedCheck.records[0].get("s")).toBe("not_contractor");
    } finally {
      await session.close();
    }

    const after = await get("/contractor-review", tokenClerkA);
    expect(after.body.groups.some((g: any) => g.expenditureIds.includes(ids.expPayeeA1))).toBe(false);
    expect(after.body.groups.some((g: any) => g.expenditureIds.includes(ids.expPayeeB))).toBe(false);
  });
});
