/**
 * Phase 1 M2 (schema-patch spec, 2026-09-25): chiefs are recorded twice —
 * as Quarter.chief_name/chief_phone and as Person.is_quarter_chief. This
 * adds the CHIEF_OF edge that makes one of them the source of truth,
 * without deleting or overwriting either side.
 *
 * Two passes, both read-only where they can't be sure:
 *  1. For each Person flagged is_quarter_chief with no CHIEF_OF edge yet,
 *     resolve their Quarter (prefer an existing LIVES_IN edge, else fall
 *     back to M1's name-match) and create CHIEF_OF if exactly one Quarter
 *     resolves. relate() then derives Quarter.chief_name/chief_phone and
 *     keeps Person.is_quarter_chief in sync — see graphService.relate().
 *  2. For each Quarter with a chief_name but no CHIEF_OF Person whose name
 *     matches, report it (possible mismatch or a missing Person record).
 *     Never auto-creates a Person.
 *
 * Idempotent: already-linked Persons are excluded from pass 1, so running
 * this twice changes nothing on the second run. Pass 2 never writes.
 *
 * Usage: npm run migrate:m2   (run M1 first — this reuses its LIVES_IN
 * edges where present. Dry run against a seeded local database first —
 * see the spec's "ask before running against a real database.")
 */
import { getSession, closeDriver } from "../db/neo4j.js";
import { relate } from "../services/graphService.js";

export interface M2ChiefCandidate {
  personId: string;
  fullName: string;
  county: string;
  district: string;
  quarterText: string | null;
  candidates: Array<{ id: string; name: string }>;
}

export interface M2QuarterMismatch {
  quarterId: string;
  quarterName: string;
  county: string;
  district: string;
  chiefNameText: string;
  chiefPersonId: string | null;
  chiefPersonName: string | null;
}

export interface M2Result {
  personsScanned: number;
  linked: number;
  personReview: M2ChiefCandidate[];
  quarterMismatches: M2QuarterMismatch[];
}

export async function runM2(): Promise<M2Result> {
  const personSession = getSession("READ");
  let personRows;
  try {
    personRows = await personSession.run(`
      MATCH (p:Person)
      WHERE p.archived = false AND p.is_quarter_chief = true
        AND NOT EXISTS { MATCH (p)-[:CHIEF_OF]->(:Quarter) }
      OPTIONAL MATCH (p)-[:LIVES_IN]->(lq:Quarter) WHERE lq.archived = false
      WITH p, collect(lq) AS livesInQuarters
      OPTIONAL MATCH (nq:Quarter {county: p.county, district: p.district})
      WHERE size(livesInQuarters) = 0 AND nq.archived = false AND p.quarter IS NOT NULL
            AND trim(toLower(nq.name)) = trim(toLower(p.quarter))
      WITH p, livesInQuarters, collect(nq) AS nameMatchedQuarters
      WITH p, CASE WHEN size(livesInQuarters) > 0 THEN livesInQuarters ELSE nameMatchedQuarters END AS resolved
      RETURN p.id AS personId, p.full_name AS fullName, p.county AS county, p.district AS district,
             p.quarter AS quarterText, [q IN resolved | {id: q.id, name: q.name}] AS candidates
    `);
  } finally {
    await personSession.close();
  }

  const result: M2Result = {
    personsScanned: personRows.records.length,
    linked: 0,
    personReview: [],
    quarterMismatches: [],
  };

  for (const record of personRows.records) {
    const row = record.toObject() as unknown as M2ChiefCandidate;
    if (row.candidates.length === 1) {
      await relate("CHIEF_OF", "Person", row.personId, "Quarter", row.candidates[0].id, {
        county: row.county,
        district: row.district,
      });
      result.linked += 1;
    } else {
      result.personReview.push(row);
    }
  }

  const quarterSession = getSession("READ");
  try {
    const quarterRows = await quarterSession.run(`
      MATCH (q:Quarter)
      WHERE q.archived = false AND q.chief_name IS NOT NULL AND trim(q.chief_name) <> ''
      OPTIONAL MATCH (cp:Person)-[:CHIEF_OF]->(q) WHERE cp.archived = false
      WITH q, cp
      WHERE cp IS NULL OR trim(toLower(cp.full_name)) <> trim(toLower(q.chief_name))
      RETURN q.id AS quarterId, q.name AS quarterName, q.county AS county, q.district AS district,
             q.chief_name AS chiefNameText, cp.id AS chiefPersonId, cp.full_name AS chiefPersonName
    `);
    result.quarterMismatches = quarterRows.records.map((r) => r.toObject() as unknown as M2QuarterMismatch);
  } finally {
    await quarterSession.close();
  }

  return result;
}

function printReport(result: M2Result) {
  // eslint-disable-next-line no-console
  console.log(`M2: scanned ${result.personsScanned} unlinked chief Person(s).`);
  // eslint-disable-next-line no-console
  console.log(`M2: linked ${result.linked} to a Quarter via CHIEF_OF.`);
  if (result.personReview.length) {
    // eslint-disable-next-line no-console
    console.log(`\nM2 review — chief Person with no single matching Quarter (${result.personReview.length}):`);
    for (const r of result.personReview) {
      // eslint-disable-next-line no-console
      console.log(
        `  - ${r.fullName} (${r.personId}): quarter="${r.quarterText}" -> ${r.candidates.length} candidate(s)`,
      );
    }
  }
  if (result.quarterMismatches.length) {
    // eslint-disable-next-line no-console
    console.log(`\nM2 review — Quarter.chief_name with no matching CHIEF_OF Person (${result.quarterMismatches.length}):`);
    for (const r of result.quarterMismatches) {
      // eslint-disable-next-line no-console
      console.log(
        `  - ${r.quarterName} (${r.quarterId}): chief_name="${r.chiefNameText}"` +
          (r.chiefPersonName ? `, closest CHIEF_OF is "${r.chiefPersonName}" (${r.chiefPersonId})` : ", no CHIEF_OF Person at all"),
      );
    }
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runM2()
    .then(printReport)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("M2 failed:", err);
      process.exitCode = 1;
    })
    .finally(() => {
      void closeDriver();
    });
}
