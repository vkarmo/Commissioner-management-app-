import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, skipReason } from "./testEnv.js";

if (!hasTestDb) {
  // eslint-disable-next-line no-console
  console.warn(`[analysis.phase1-5.test] ${skipReason}`);
}

const describeIfDb = hasTestDb ? describe : describe.skip;

/**
 * Phase 1.5 (schema-patch spec, 2026-09-25) — office decision: retire
 * Dispute. Migration M4 (m4RetireDisputes.ts) is NOT scoped to
 * county/district (scans every Dispute), so — like the rest of this
 * suite — this must run against an empty, disposable database.
 */
describeIfDb("Phase 1.5: retire Dispute (migration M4, create disabled)", () => {
  let createApp: typeof import("../src/app.js").createApp;
  let closeDriver: typeof import("../src/db/neo4j.js").closeDriver;
  let getSession: typeof import("../src/db/neo4j.js").getSession;
  let issueSessionToken: typeof import("../src/auth/session.js").issueSessionToken;
  let runM4: typeof import("../src/migrations/m4RetireDisputes.js").runM4;

  const runId = randomUUID();
  const suffix = runId.slice(0, 8);
  const COUNTY = "TestCounty";
  const DISTRICT_A = `TestDistrictA-${suffix}`;

  let baseUrl: string;
  let server: import("node:http").Server;
  let tokenCommissionerA: string;

  const ids = {
    quarter: randomUUID(),
    parcelMigrate: randomUUID(),
    disputeMigrate: randomUUID(),
    parcelDuplicate: randomUUID(),
    disputeDuplicate: randomUUID(),
    existingCase: randomUUID(),
    parcelBadStatus: randomUUID(),
    disputeBadStatus: randomUUID(),
    disputeAlreadyArchived: randomUUID(),
    parcelAlreadyArchived: randomUUID(),
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

    await session.run(`CREATE (q:Quarter $props)`, {
      props: p({ id: ids.quarter, name: `Retire Quarter ${suffix}` }),
    });

    // --- clean migration case ---
    await session.run(`CREATE (pa:Parcel $props)`, {
      props: p({ id: ids.parcelMigrate, parcel_ref: `RETIRE-OK-${suffix}`, quarter: `Retire Quarter ${suffix}` }),
    });
    await session.run(`MATCH (pa:Parcel {id: $id}), (q:Quarter {id: $qid}) CREATE (pa)-[:LOCATED_IN]->(q)`, {
      id: ids.parcelMigrate,
      qid: ids.quarter,
    });
    await session.run(`CREATE (d:Dispute $props)`, {
      props: p({ id: ids.disputeMigrate, status: "open", notes: `Boundary notes ${suffix}` }),
    });
    await session.run(`MATCH (pa:Parcel {id: $id}), (d:Dispute {id: $did}) CREATE (pa)-[:SUBJECT_OF]->(d)`, {
      id: ids.parcelMigrate,
      did: ids.disputeMigrate,
    });

    // --- likely-duplicate case: parcel already has an open land Case ---
    await session.run(`CREATE (pa:Parcel $props)`, {
      props: p({ id: ids.parcelDuplicate, parcel_ref: `RETIRE-DUP-${suffix}` }),
    });
    await session.run(`CREATE (d:Dispute $props)`, {
      props: p({ id: ids.disputeDuplicate, status: "resolved", notes: `Duplicate notes ${suffix}` }),
    });
    await session.run(`MATCH (pa:Parcel {id: $id}), (d:Dispute {id: $did}) CREATE (pa)-[:SUBJECT_OF]->(d)`, {
      id: ids.parcelDuplicate,
      did: ids.disputeDuplicate,
    });
    await session.run(`CREATE (c:Case $props)`, {
      props: p({ id: ids.existingCase, case_number: `EXISTING-${suffix}`, type: "land", status: "open" }),
    });
    await session.run(`MATCH (c:Case {id: $id}), (pa:Parcel {id: $pid}) CREATE (c)-[:CONCERNS]->(pa)`, {
      id: ids.existingCase,
      pid: ids.parcelDuplicate,
    });

    // --- unmapped status ---
    await session.run(`CREATE (pa:Parcel $props)`, {
      props: p({ id: ids.parcelBadStatus, parcel_ref: `RETIRE-BAD-${suffix}` }),
    });
    await session.run(`CREATE (d:Dispute $props)`, {
      props: p({ id: ids.disputeBadStatus, status: "pending", notes: `Bad status notes ${suffix}` }),
    });
    await session.run(`MATCH (pa:Parcel {id: $id}), (d:Dispute {id: $did}) CREATE (pa)-[:SUBJECT_OF]->(d)`, {
      id: ids.parcelBadStatus,
      did: ids.disputeBadStatus,
    });

    // --- already archived before M4 ever ran (should be left alone and not counted) ---
    await session.run(`CREATE (pa:Parcel $props)`, {
      props: p({ id: ids.parcelAlreadyArchived, parcel_ref: `RETIRE-ARCHIVED-${suffix}` }),
    });
    await session.run(`CREATE (d:Dispute $props)`, {
      props: p({ id: ids.disputeAlreadyArchived, status: "open", notes: "n/a", archived: true, archived_at: now }),
    });
    await session.run(`MATCH (pa:Parcel {id: $id}), (d:Dispute {id: $did}) CREATE (pa)-[:SUBJECT_OF]->(d)`, {
      id: ids.parcelAlreadyArchived,
      did: ids.disputeAlreadyArchived,
    });
  }

  beforeAll(async () => {
    const appMod = await import("../src/app.js");
    createApp = appMod.createApp;
    const dbMod = await import("../src/db/neo4j.js");
    closeDriver = dbMod.closeDriver;
    getSession = dbMod.getSession;
    issueSessionToken = (await import("../src/auth/session.js")).issueSessionToken;
    runM4 = (await import("../src/migrations/m4RetireDisputes.js")).runM4;

    const session = getSession("WRITE");
    try {
      await seed(session);
    } finally {
      await session.close();
    }

    tokenCommissionerA = issueSessionToken({
      email: "phase1-5-commissioner@example.com",
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
      // Migration-created Case nodes aren't tagged test_run_id by the
      // migration itself (it isn't test-aware) — sweep them up by the
      // legacy_dispute_id linking back to this run's Dispute fixtures too.
      await session.run(
        `MATCH (n) WHERE n.test_run_id = $runId OR n.legacy_dispute_id IN $disputeIds DETACH DELETE n`,
        { runId, disputeIds: [ids.disputeMigrate, ids.disputeDuplicate, ids.disputeBadStatus, ids.disputeAlreadyArchived] },
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

  it("POST /api/disputes is disabled (410) — Dispute is retired", async () => {
    const { status, body } = await post("/disputes", tokenCommissionerA, { status: "open", notes: "should be rejected" });
    expect(status).toBe(410);
    expect(body.error).toMatch(/retired/i);
  });

  it("M4: migrates the clean case, flags the duplicate and the unmapped status, leaves the already-archived one alone, and is idempotent", async () => {
    const first = await runM4();

    expect(first.duplicateCandidates.some((r) => r.disputeId === ids.disputeDuplicate && r.candidateCaseIds.includes(ids.existingCase))).toBe(
      true,
    );
    expect(first.statusReview.some((r) => r.disputeId === ids.disputeBadStatus && r.status === "pending")).toBe(true);

    const session = getSession("READ");
    let migratedCaseId: string;
    try {
      const caseResult = await session.run(
        `MATCH (c:Case {legacy_dispute_id: $disputeId})-[:CONCERNS]->(p:Parcel {id: $parcelId}) RETURN c`,
        { disputeId: ids.disputeMigrate, parcelId: ids.parcelMigrate },
      );
      expect(caseResult.records.length).toBe(1);
      const migratedCase = caseResult.records[0].get("c").properties;
      expect(migratedCase.type).toBe("land");
      expect(migratedCase.status).toBe("open");
      expect(migratedCase.quarter).toBe(`Retire Quarter ${suffix}`);
      migratedCaseId = migratedCase.id;

      const locatedInResult = await session.run(
        `MATCH (c:Case {id: $id})-[:LOCATED_IN]->(q:Quarter {id: $qid}) RETURN count(*) AS c`,
        { id: migratedCaseId, qid: ids.quarter },
      );
      expect(locatedInResult.records[0].get("c")).toBe(1);

      const disputeResult = await session.run(`MATCH (d:Dispute {id: $id}) RETURN d.archived AS archived`, {
        id: ids.disputeMigrate,
      });
      expect(disputeResult.records[0].get("archived")).toBe(true);

      const untouchedResult = await session.run(
        `MATCH (d:Dispute) WHERE d.id IN [$dup, $bad] RETURN d.id AS id, d.archived AS archived`,
        { dup: ids.disputeDuplicate, bad: ids.disputeBadStatus },
      );
      for (const record of untouchedResult.records) {
        expect(record.get("archived")).toBe(false);
      }

      const alreadyArchivedResult = await session.run(`MATCH (c:Case {legacy_dispute_id: $id}) RETURN count(*) AS c`, {
        id: ids.disputeAlreadyArchived,
      });
      expect(alreadyArchivedResult.records[0].get("c")).toBe(0); // left alone, never touched
    } finally {
      await session.close();
    }

    // Idempotent: running again creates no second Case for disputeMigrate,
    // and still reports the same unresolved items.
    const second = await runM4();
    expect(second.duplicateCandidates.some((r) => r.disputeId === ids.disputeDuplicate)).toBe(true);
    expect(second.statusReview.some((r) => r.disputeId === ids.disputeBadStatus)).toBe(true);

    const session2 = getSession("READ");
    try {
      const caseCountResult = await session2.run(`MATCH (c:Case {legacy_dispute_id: $disputeId}) RETURN count(*) AS c`, {
        disputeId: ids.disputeMigrate,
      });
      expect(caseCountResult.records[0].get("c")).toBe(1);
    } finally {
      await session2.close();
    }
  });
});
