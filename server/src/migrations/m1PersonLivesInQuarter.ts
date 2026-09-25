/**
 * Phase 1 M1 (schema-patch spec, 2026-09-25): Person.quarter is a free-text
 * string with no edge to Quarter. This adds the edge without touching the
 * string or any existing data.
 *
 * For each Person with a `quarter` value and no LIVES_IN edge yet, find a
 * Quarter with the same name (case/whitespace-insensitive) in the same
 * county/district and create LIVES_IN. Unmatched or ambiguous (more than
 * one same-named Quarter) values are left alone and reported for a person
 * to confirm — never guessed, and Quarters are never auto-created.
 *
 * Idempotent: already-linked Persons are excluded from the scan, so
 * running this twice changes nothing on the second run.
 *
 * Usage: npm run migrate:m1   (dry run first against a seeded local
 * database — see the spec's "ask before running against a real database.")
 */
import { getSession, closeDriver } from "../db/neo4j.js";
import { relate } from "../services/graphService.js";

export interface M1Candidate {
  personId: string;
  fullName: string;
  county: string;
  district: string;
  quarterText: string;
  candidates: Array<{ id: string; name: string }>;
}

export interface M1Result {
  scanned: number;
  linked: number;
  unmatched: M1Candidate[];
  ambiguous: M1Candidate[];
}

export async function runM1(): Promise<M1Result> {
  const session = getSession("READ");
  let rows;
  try {
    rows = await session.run(`
      MATCH (p:Person)
      WHERE p.archived = false AND p.quarter IS NOT NULL AND trim(p.quarter) <> ''
        AND NOT EXISTS { MATCH (p)-[:LIVES_IN]->(:Quarter) }
      OPTIONAL MATCH (q:Quarter {county: p.county, district: p.district})
      WHERE q.archived = false AND trim(toLower(q.name)) = trim(toLower(p.quarter))
      WITH p, collect(q) AS matches
      RETURN p.id AS personId, p.full_name AS fullName, p.county AS county, p.district AS district,
             p.quarter AS quarterText, [m IN matches | {id: m.id, name: m.name}] AS candidates
    `);
  } finally {
    await session.close();
  }

  const result: M1Result = { scanned: rows.records.length, linked: 0, unmatched: [], ambiguous: [] };

  for (const record of rows.records) {
    const row = record.toObject() as unknown as M1Candidate;
    if (row.candidates.length === 1) {
      await relate("LIVES_IN", "Person", row.personId, "Quarter", row.candidates[0].id, {
        county: row.county,
        district: row.district,
      });
      result.linked += 1;
    } else if (row.candidates.length === 0) {
      result.unmatched.push(row);
    } else {
      result.ambiguous.push(row);
    }
  }
  return result;
}

function printReport(result: M1Result) {
  // eslint-disable-next-line no-console
  console.log(`M1: scanned ${result.scanned} unlinked Person(s) with a quarter value.`);
  // eslint-disable-next-line no-console
  console.log(`M1: linked ${result.linked} to a matching Quarter via LIVES_IN.`);
  if (result.unmatched.length) {
    // eslint-disable-next-line no-console
    console.log(`\nM1 review — no matching Quarter (${result.unmatched.length}):`);
    for (const r of result.unmatched) {
      // eslint-disable-next-line no-console
      console.log(`  - ${r.fullName} (${r.personId}): quarter="${r.quarterText}" in ${r.district}, ${r.county}`);
    }
  }
  if (result.ambiguous.length) {
    // eslint-disable-next-line no-console
    console.log(`\nM1 review — more than one matching Quarter (${result.ambiguous.length}):`);
    for (const r of result.ambiguous) {
      // eslint-disable-next-line no-console
      console.log(
        `  - ${r.fullName} (${r.personId}): quarter="${r.quarterText}" matches ${r.candidates.map((c) => c.id).join(", ")}`,
      );
    }
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runM1()
    .then(printReport)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("M1 failed:", err);
      process.exitCode = 1;
    })
    .finally(() => {
      void closeDriver();
    });
}
