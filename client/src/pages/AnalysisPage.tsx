import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  runLineItemDrift,
  runQuartersLeftOut,
  runRepeatLandCases,
  runUnapprovedDisbursements,
  type CheckResult,
} from "../api/analysis";

interface CheckDef {
  key: string;
  title: string;
  description: string;
  run: () => Promise<CheckResult>;
  render: (findings: Record<string, unknown>[]) => React.ReactNode;
}

function money(n: unknown) {
  return typeof n === "number" ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(n ?? "—");
}

const CHECKS: CheckDef[] = [
  {
    key: "quarters-left-out",
    title: "Quarters left out",
    description: "No public works item in the last 3 years, and no budget line targeting them.",
    run: runQuartersLeftOut,
    render: (findings) => (
      <table className="record-table">
        <thead>
          <tr>
            <th>Quarter</th>
            <th>Population</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.quarter_id as string}>
              <td>{f.quarter as string}</td>
              <td>{money(f.population)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    key: "line-item-drift",
    title: "Budget line item drift",
    description: "Disbursed/spent amounts that don't add up against what was allocated.",
    run: runLineItemDrift,
    render: (findings) => (
      <table className="record-table">
        <thead>
          <tr>
            <th>Fiscal year</th>
            <th>Category</th>
            <th>Allocated</th>
            <th>Disbursed</th>
            <th>Spent</th>
            <th>Flag</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.line_item_id as string}>
              <td>{f.fiscal_year as string}</td>
              <td>{f.category as string}</td>
              <td>{money(f.allocated)}</td>
              <td>{money(f.disbursed)}</td>
              <td>{money(f.spent)}</td>
              <td>{(f.flag as string).split("_").join(" ")}</td>
              <td>
                <Link to={`/budget-line-items/${f.line_item_id}`}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    key: "unapproved-disbursements",
    title: "Unapproved disbursements",
    description: "Money disbursed from a budget that has no approved ApprovalAction.",
    run: runUnapprovedDisbursements,
    render: (findings) => (
      <table className="record-table">
        <thead>
          <tr>
            <th>Fiscal year</th>
            <th>Source</th>
            <th>Disbursements</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.budget_id as string}>
              <td>{f.fiscal_year as string}</td>
              <td>{f.source as string}</td>
              <td>{money(f.disbursements)}</td>
              <td>{money(f.total)}</td>
              <td>
                <Link to={`/budgets/${f.budget_id}`}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    key: "repeat-land-cases",
    title: "Repeat land cases",
    description: "Parcels with more than one land case filed against them.",
    run: runRepeatLandCases,
    render: (findings) => (
      <table className="record-table">
        <thead>
          <tr>
            <th>Parcel</th>
            <th>Cases</th>
            <th>Parties</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.parcel_id as string}>
              <td>{(f.parcel_ref as string) || (f.parcel_id as string)}</td>
              <td>
                {(f.cases as Array<{ id: string; number: string }>)
                  .map((c) => c.number)
                  .join(", ")}
              </td>
              <td>{(f.parties as string[]).join(", ")}</td>
              <td>
                <Link to={`/parcels/${f.parcel_id}`}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
];

function CheckCard({ def }: { def: CheckDef }) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    def
      .run()
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not run this check (offline?)");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fire-actions-panel">
      <div className="page-header">
        <h2>{def.title}</h2>
        {result && <span className="status-pill status-ok">{result.findings.length} finding(s)</span>}
      </div>
      <p className="muted">{def.description}</p>
      {loading && <p className="muted">Running…</p>}
      {error && <p className="form-error">{error}</p>}
      {result && result.findings.length === 0 && <p className="muted">Nothing found.</p>}
      {result && result.findings.length > 0 && def.render(result.findings)}
    </div>
  );
}

export function AnalysisPage() {
  return (
    <div>
      <h1>Analysis</h1>
      <p className="muted">
        Read-only checks over the current data — no schema changes, nothing here writes anything. Only visible to
        Commissioner/Official/SuperAdmin since findings can name specific people.
      </p>
      {CHECKS.map((def) => (
        <CheckCard key={def.key} def={def} />
      ))}
    </div>
  );
}
