import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  runLineItemDrift,
  runLocationMismatches,
  runQuartersLeftOut,
  runRepeatLandCases,
  runStalledContractors,
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
    description: "Parcels with more than one land case filed against them, the families and parties involved, and any repeat witness.",
    run: runRepeatLandCases,
    render: (findings) => (
      <table className="record-table">
        <thead>
          <tr>
            <th>Parcel</th>
            <th>Cases</th>
            <th>Families</th>
            <th>Parties</th>
            <th>Repeat witnesses</th>
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
              <td>{(f.families as string[]).join(", ") || "—"}</td>
              <td>{(f.parties as string[]).join(", ") || "—"}</td>
              <td>{(f.repeat_witnesses as string[]).join(", ") || "—"}</td>
              <td>
                <Link to={`/parcels/${f.parcel_id}`}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    key: "stalled-contractors",
    title: "Stalled contractors",
    description: "Contractors with 2+ overdue public works items, and how much has already been paid on them.",
    run: runStalledContractors,
    render: (findings) => (
      <table className="record-table">
        <thead>
          <tr>
            <th>Contractor</th>
            <th>Overdue items</th>
            <th>Paid on overdue items</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.contractor_id as string}>
              <td>{f.name as string}</td>
              <td>
                {(f.overdue_items as Array<{ id: string; title: string; status: string }>)
                  .map((i) => `${i.title} (${i.status})`)
                  .join(", ")}
              </td>
              <td>{money(f.paid_on_overdue_items)}</td>
              <td>
                <Link to={`/contractors/${f.contractor_id}`}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    key: "location-mismatches",
    title: "Location mismatches",
    description:
      "Case/Parcel/PublicWorksItem/FireIncident records where the quarter name and the linked Quarter disagree, or only one of the two is set.",
    run: runLocationMismatches,
    render: (findings) => {
      const linkPath: Record<string, string> = {
        Case: "cases",
        Parcel: "parcels",
        PublicWorksItem: "public-works",
        FireIncident: "fire-incidents",
      };
      return (
        <table className="record-table">
          <thead>
            <tr>
              <th>Record</th>
              <th>Quarter string</th>
              <th>Linked Quarter</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.node_id as string}>
                <td>{f.label as string}</td>
                <td>{(f.quarter_string as string) || "(none)"}</td>
                <td>{(f.located_in_quarter_name as string) || "(none)"}</td>
                <td>
                  {linkPath[f.label as string] && (
                    <Link to={`/${linkPath[f.label as string]}/${f.node_id}`}>View</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
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
