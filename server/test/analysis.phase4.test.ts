import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, skipReason } from "./testEnv.js";

if (!hasTestDb) {
  // eslint-disable-next-line no-console
  console.warn(`[analysis.phase4.test] ${skipReason}`);
}

const describeIfDb = hasTestDb ? describe : describe.skip;

/**
 * Phase 4 (schema-patch spec, 2026-09-26): Concession + Commitment,
 * AFFECTS/COMMITTED/BENEFITS/ABOUT, unmet-commitments, and the extended
 * quarters-left-out. Fixture mirrors the spec's own Tests section: "two
 * quarters with no projects inside a concession area; an undelivered
 * school commitment with two complaints."
 */
describeIfDb("Phase 4: concessions, commitments, unmet-commitments, extended quarters-left-out", () => {
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

  const past = "2020-01-01";
  const future = "2099-01-01";

  const ids = {
    quarterA: randomUUID(),
    quarterB: randomUUID(),
    concession1: randomUUID(),
    commitmentSchool: randomUUID(),
    commitmentDelivered: randomUUID(),
    commitmentFuture: randomUUID(),
    commitmentNoDueDate: randomUUID(),
    complaint1: randomUUID(),
    complaint2: randomUUID(),
    aboutTestLog: randomUUID(),
    commitmentX: randomUUID(),
    commitmentY: randomUUID(),
    workItem1: randomUUID(),
    workItem2: randomUUID(),
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

    await session.run(`CREATE (q:Quarter $props)`, { props: p({ id: ids.quarterA, name: `Quarter A ${suffix}` }) });
    await session.run(`CREATE (q:Quarter $props)`, { props: p({ id: ids.quarterB, name: `Quarter B ${suffix}` }) });

    await session.run(`CREATE (cn:Concession $props)`, { props: p({ id: ids.concession1, name: `Big Concession ${suffix}` }) });
    for (const quarterId of [ids.quarterA, ids.quarterB]) {
      await session.run(`MATCH (cn:Concession {id: $cid}), (q:Quarter {id: $qid}) CREATE (cn)-[:AFFECTS]->(q)`, {
        cid: ids.concession1,
        qid: quarterId,
      });
    }

    const commitment = async (id: string, title: string, status: string, dueDate: string | null, quarterId: string) => {
      await session.run(`CREATE (m:Commitment $props)`, {
        props: p({ id, title, status, ...(dueDate ? { due_date: dueDate } : {}) }),
      });
      await session.run(`MATCH (cn:Concession {id: $cid}), (m:Commitment {id: $mid}) CREATE (cn)-[:COMMITTED]->(m)`, {
        cid: ids.concession1,
        mid: id,
      });
      await session.run(`MATCH (m:Commitment {id: $mid}), (q:Quarter {id: $qid}) CREATE (m)-[:BENEFITS]->(q)`, {
        mid: id,
        qid: quarterId,
      });
    };
    await commitment(ids.commitmentSchool, `School for Bondi Village ${suffix}`, "pending", past, ids.quarterA);
    await commitment(ids.commitmentDelivered, `Delivered Thing ${suffix}`, "delivered", past, ids.quarterB);
    await commitment(ids.commitmentFuture, `Future Thing ${suffix}`, "pending", future, ids.quarterB);
    await commitment(ids.commitmentNoDueDate, `No Due Date Thing ${suffix}`, "in_progress", null, ids.quarterA);

    await session.run(`CREATE (l:CommunicationLog $props)`, {
      props: p({ id: ids.complaint1, channel: "whatsapp", summary: `Still no school ${suffix}`, date: now }),
    });
    await session.run(`CREATE (l:CommunicationLog $props)`, {
      props: p({ id: ids.complaint2, channel: "sms", summary: `When is the school coming ${suffix}`, date: now }),
    });
    for (const logId of [ids.complaint1, ids.complaint2]) {
      await session.run(`MATCH (l:CommunicationLog {id: $lid}), (m:Commitment {id: $mid}) CREATE (l)-[:ABOUT]->(m)`, {
        lid: logId,
        mid: ids.commitmentSchool,
      });
    }

    // --- ABOUT single-target replace fixtures ---
    await session.run(`CREATE (l:CommunicationLog $props)`, {
      props: p({ id: ids.aboutTestLog, channel: "phone", summary: `About test ${suffix}`, date: now }),
    });
    await session.run(`CREATE (m:Commitment $props)`, { props: p({ id: ids.commitmentX, title: `Commitment X ${suffix}`, status: "pending" }) });
    await session.run(`CREATE (m:Commitment $props)`, { props: p({ id: ids.commitmentY, title: `Commitment Y ${suffix}`, status: "pending" }) });
    await session.run(`CREATE (w:PublicWorksItem $props)`, {
      props: p({ id: ids.workItem1, title: `Work Item 1 ${suffix}`, status: "planned" }),
    });
    await session.run(`CREATE (w:PublicWorksItem $props)`, {
      props: p({ id: ids.workItem2, title: `Work Item 2 ${suffix}`, status: "planned" }),
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

    tokenClerkA = issueSessionToken({ email: "phase4-clerk@example.com", role: "Clerk", county: COUNTY, district: DISTRICT_A });
    tokenCommissionerA = issueSessionToken({
      email: "phase4-commissioner@example.com",
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

  it("unmet-commitments: flags the pending overdue and no-due-date commitments with their complaints, not the delivered or future ones", async () => {
    const { status, body } = await get("/analysis/unmet-commitments", tokenCommissionerA);
    expect(status).toBe(200);

    const byId = new Map<string, any>(body.findings.map((f: any) => [f.commitment_id, f]));
    expect(byId.get(ids.commitmentSchool)?.complaints).toBe(2);
    expect(byId.get(ids.commitmentSchool)?.quarters).toContain(`Quarter A ${suffix}`);
    expect(byId.get(ids.commitmentSchool)?.recent_complaints.length).toBe(2);

    expect(byId.get(ids.commitmentNoDueDate)?.complaints).toBe(0);

    expect(byId.has(ids.commitmentDelivered)).toBe(false);
    expect(byId.has(ids.commitmentFuture)).toBe(false);
  });

  it("quarters-left-out (extended): both quarters show the concession, only Quarter A shows unmet commitments", async () => {
    const { status, body } = await get("/analysis/quarters-left-out", tokenCommissionerA);
    expect(status).toBe(200);

    const findingA = body.findings.find((f: any) => f.quarter_id === ids.quarterA);
    const findingB = body.findings.find((f: any) => f.quarter_id === ids.quarterB);
    expect(findingA).toBeTruthy();
    expect(findingB).toBeTruthy();

    expect(findingA.concessions).toContain(`Big Concession ${suffix}`);
    expect(findingB.concessions).toContain(`Big Concession ${suffix}`);

    expect(findingA.unmet_commitments).toContain(`School for Bondi Village ${suffix}`);
    expect(findingA.unmet_commitments).toContain(`No Due Date Thing ${suffix}`);
    expect(findingB.unmet_commitments).not.toContain(`Delivered Thing ${suffix}`);
    expect(findingB.unmet_commitments).not.toContain(`Future Thing ${suffix}`);
  });

  it("relate(): ABOUT is single-target per commitment/project, and a log can have one of each at once", async () => {
    let res = await post("/relate", tokenClerkA, {
      type: "ABOUT",
      from: { resource: "CommunicationLog", id: ids.aboutTestLog },
      to: { resource: "Commitment", id: ids.commitmentX },
    });
    expect(res.status).toBe(200);
    res = await post("/relate", tokenClerkA, {
      type: "ABOUT",
      from: { resource: "CommunicationLog", id: ids.aboutTestLog },
      to: { resource: "Commitment", id: ids.commitmentY },
    });
    expect(res.status).toBe(200);

    res = await post("/relate", tokenClerkA, {
      type: "ABOUT",
      from: { resource: "CommunicationLog", id: ids.aboutTestLog },
      to: { resource: "PublicWorksItem", id: ids.workItem1 },
    });
    expect(res.status).toBe(200);
    res = await post("/relate", tokenClerkA, {
      type: "ABOUT",
      from: { resource: "CommunicationLog", id: ids.aboutTestLog },
      to: { resource: "PublicWorksItem", id: ids.workItem2 },
    });
    expect(res.status).toBe(200);

    const about = await get(`/communications/${ids.aboutTestLog}/about`, tokenClerkA);
    expect(about.status).toBe(200);
    expect(about.body.commitment.id).toBe(ids.commitmentY);
    expect(about.body.publicWorksItem.id).toBe(ids.workItem2);

    const session = getSession("READ");
    try {
      const commitmentEdges = await session.run(`MATCH (l:CommunicationLog {id: $id})-[:ABOUT]->(m:Commitment) RETURN count(*) AS c`, {
        id: ids.aboutTestLog,
      });
      expect(commitmentEdges.records[0].get("c")).toBe(1);
      const workItemEdges = await session.run(
        `MATCH (l:CommunicationLog {id: $id})-[:ABOUT]->(w:PublicWorksItem) RETURN count(*) AS c`,
        { id: ids.aboutTestLog },
      );
      expect(workItemEdges.records[0].get("c")).toBe(1);
    } finally {
      await session.close();
    }
  });

  it("concession/commitment link read endpoints reflect what relate() creates", async () => {
    const quarters = await get(`/concessions/${ids.concession1}/quarters`, tokenClerkA);
    expect(quarters.status).toBe(200);
    expect(quarters.body.items.map((q: any) => q.id).sort()).toEqual([ids.quarterA, ids.quarterB].sort());

    const commitments = await get(`/concessions/${ids.concession1}/commitments`, tokenClerkA);
    expect(commitments.status).toBe(200);
    expect(commitments.body.items.map((m: any) => m.id)).toContain(ids.commitmentSchool);

    const benefiting = await get(`/commitments/${ids.commitmentSchool}/quarters`, tokenClerkA);
    expect(benefiting.status).toBe(200);
    expect(benefiting.body.items.map((q: any) => q.id)).toEqual([ids.quarterA]);
  });
});
