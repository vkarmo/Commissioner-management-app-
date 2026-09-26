/**
 * Phase 1.5 (schema-patch spec, 2026-09-25) — office decision: retire
 * Dispute. Dispute (Parcel -[:SUBJECT_OF]-> Dispute) has no link to
 * people, cases or hearings; Case{type:'land'} does all the real work.
 *
 * For each non-archived Dispute:
 *  - If a Case already carries `legacy_dispute_id` for it, skip (already
 *    migrated — this is what makes a re-run idempotent).
 *  - Else, if the Dispute's Parcel already has an open Case{type:'land'}
 *    not yet tied to any Dispute, this is likely a duplicate someone
 *    already filed for the same underlying issue (the shipped demo data
 *    has exactly this: seed.ts's boundary-dispute Case and Dispute both
 *    concern the same parcel) — report it for a person to confirm rather
 *    than creating a second Case. Neither the Dispute nor a Case is
 *    touched.
 *  - Else, if the Dispute's status isn't one of the two the spec maps
 *    (`open`/`resolved`), report it rather than guessing a status.
 *  - Else create a Case{type:'land'} (status mapped, summary from notes,
 *    quarter/LOCATED_IN copied from the Parcel if it has them,
 *    legacy_dispute_id set) CONCERNS the Parcel, then archive the
 *    Dispute. Never deletes or overwrites anything.
 *
 * Usage: npm run migrate:m4   (dry run first against a seeded local
 * database — see the spec's "ask before running against a real database."
 * Run M1 first if you haven't — this doesn't depend on it, but M1/M2's
 * LIVES_IN/CHIEF_OF cleanup is unrelated and can happen in any order.)
 */
import { getSession, closeDriver } from "../db/neo4j.js";
import { createNode, relate } from "../services/graphService.js";
import type { Scope } from "../types/index.js";

const STATUS_MAP: Record<string, string> = { open: "open", resolved: "resolved" };

export interface M4DuplicateCandidate {
  disputeId: string;
  parcelId: string;
  candidateCaseIds: string[];
}

export interface M4StatusReview {
  disputeId: string;
  parcelId: string;
  status: string;
}

export interface M4Result {
  scanned: number;
  migrated: number;
  duplicateCandidates: M4DuplicateCandidate[];
  statusReview: M4StatusReview[];
  /** Once this reaches 0 after a real run, SUBJECT_OF can be removed from the allowlist. */
  remainingUnarchivedDisputes: number;
}

interface DisputeRow {
  disputeId: string;
  status: string;
  notes: string | null;
  county: string;
  district: string;
  parcelId: string | null;
  parcelQuarter: string | null;
  parcelLocatedInQuarterId: string | null;
  candidateCaseIds: string[];
}

export async function runM4(): Promise<M4Result> {
  const session = getSession("READ");
  let rows;
  try {
    rows = await session.run(`
      MATCH (d:Dispute)
      WHERE d.archived = false
        AND NOT EXISTS { MATCH (:Case {legacy_dispute_id: d.id}) }
      OPTIONAL MATCH (p:Parcel)-[:SUBJECT_OF]->(d)
      OPTIONAL MATCH (p)-[:LOCATED_IN]->(pq:Quarter) WHERE pq.archived = false
      OPTIONAL MATCH (cand:Case {type: 'land', archived: false})-[:CONCERNS]->(p)
      WHERE cand.legacy_dispute_id IS NULL
      RETURN d.id AS disputeId, d.status AS status, d.notes AS notes,
             d.county AS county, d.district AS district,
             p.id AS parcelId, p.quarter AS parcelQuarter, pq.id AS parcelLocatedInQuarterId,
             collect(DISTINCT cand.id) AS candidateCaseIds
    `);
  } finally {
    await session.close();
  }

  const result: M4Result = {
    scanned: rows.records.length,
    migrated: 0,
    duplicateCandidates: [],
    statusReview: [],
    remainingUnarchivedDisputes: 0,
  };

  for (const record of rows.records) {
    const row = record.toObject() as unknown as DisputeRow;

    if (!row.parcelId) {
      // SUBJECT_OF is the only edge Dispute ever has (per the spec) — a
      // Dispute with no Parcel is unexpected data, not something to guess
      // about. Leave it alone; remainingUnarchivedDisputes below will
      // still count it.
      continue;
    }

    if (row.candidateCaseIds.length > 0) {
      result.duplicateCandidates.push({
        disputeId: row.disputeId,
        parcelId: row.parcelId,
        candidateCaseIds: row.candidateCaseIds,
      });
      continue;
    }

    const mappedStatus = STATUS_MAP[row.status];
    if (!mappedStatus) {
      result.statusReview.push({ disputeId: row.disputeId, parcelId: row.parcelId, status: row.status });
      continue;
    }

    const scope: Scope = { county: row.county, district: row.district };
    const caseNode = await createNode({
      resource: "Case",
      props: {
        case_number: `LEGACY-DISPUTE-${row.disputeId}`,
        type: "land",
        status: mappedStatus,
        legacy_dispute_id: row.disputeId,
        ...(row.notes ? { summary: row.notes } : {}),
        ...(row.parcelQuarter ? { quarter: row.parcelQuarter } : {}),
      },
      scope,
      actorEmail: "migration-m4",
    });
    await relate("CONCERNS", "Case", (caseNode as any).id, "Parcel", row.parcelId, scope);
    if (row.parcelLocatedInQuarterId) {
      await relate("LOCATED_IN", "Case", (caseNode as any).id, "Quarter", row.parcelLocatedInQuarterId, scope);
    }

    const archiveSession = getSession("WRITE");
    try {
      await archiveSession.run(
        `MATCH (d:Dispute {id: $id}) SET d.archived = true, d.archived_at = $now, d.updated_at = $now`,
        { id: row.disputeId, now: new Date().toISOString() },
      );
    } finally {
      await archiveSession.close();
    }
    result.migrated += 1;
  }

  const countSession = getSession("READ");
  try {
    const countResult = await countSession.run(`MATCH (d:Dispute) WHERE d.archived = false RETURN count(d) AS c`);
    result.remainingUnarchivedDisputes = countResult.records[0].get("c");
  } finally {
    await countSession.close();
  }

  return result;
}

function printReport(result: M4Result) {
  // eslint-disable-next-line no-console
  console.log(`M4: scanned ${result.scanned} unmigrated Dispute(s).`);
  // eslint-disable-next-line no-console
  console.log(`M4: migrated ${result.migrated} into a Case{type:'land'} and archived the Dispute.`);
  if (result.duplicateCandidates.length) {
    // eslint-disable-next-line no-console
    console.log(`\nM4 review — Dispute's Parcel already has an open land Case (${result.duplicateCandidates.length}):`);
    for (const r of result.duplicateCandidates) {
      // eslint-disable-next-line no-console
      console.log(`  - Dispute ${r.disputeId} (Parcel ${r.parcelId}): candidate Case(s) ${r.candidateCaseIds.join(", ")}`);
    }
  }
  if (result.statusReview.length) {
    // eslint-disable-next-line no-console
    console.log(`\nM4 review — Dispute.status is neither 'open' nor 'resolved' (${result.statusReview.length}):`);
    for (const r of result.statusReview) {
      // eslint-disable-next-line no-console
      console.log(`  - Dispute ${r.disputeId} (Parcel ${r.parcelId}): status="${r.status}"`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\nM4: ${result.remainingUnarchivedDisputes} unarchived Dispute(s) remain in the database.`);
  if (result.remainingUnarchivedDisputes === 0) {
    // eslint-disable-next-line no-console
    console.log("M4: none left — SUBJECT_OF can now be removed from the allowlist in resources.ts.");
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runM4()
    .then(printReport)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("M4 failed:", err);
      process.exitCode = 1;
    })
    .finally(() => {
      void closeDriver();
    });
}
