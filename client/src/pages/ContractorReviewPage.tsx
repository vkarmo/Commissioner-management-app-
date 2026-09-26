import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { listContractors, type Contractor } from "../api/contractorLinks";
import { confirmContractorGroup, dismissContractorGroup, listContractorReviewGroups, type PayeeGroup } from "../api/contractorReview";

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function GroupCard({ group, contractors, onDone }: { group: PayeeGroup; contractors: Contractor[]; onDone: () => void }) {
  const [existingId, setExistingId] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="review-card">
      <div className="page-header">
        <h3>{group.payeeVariants.join(" / ")}</h3>
        <span className="status-pill status-ok">{group.count} expenditure(s), {money(group.totalAmount)} LRD</span>
      </div>
      {error && <p className="form-error">{error}</p>}

      <div className="party-section">
        <h4>Link to an existing contractor</h4>
        <div className="inline-form">
          <select value={existingId} onChange={(e) => setExistingId(e.target.value)}>
            <option value="">Choose a contractor…</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !existingId}
            onClick={() => run(() => confirmContractorGroup(group.expenditureIds, { id: existingId }))}
          >
            Confirm
          </button>
        </div>
      </div>

      <div className="party-section">
        <h4>Create a new contractor</h4>
        <div className="inline-form">
          <input placeholder="Contractor name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button
            type="button"
            disabled={busy || !newName.trim()}
            onClick={() => run(() => confirmContractorGroup(group.expenditureIds, { name: newName.trim() }))}
          >
            Create &amp; confirm
          </button>
        </div>
      </div>

      <div className="party-section">
        <button type="button" disabled={busy} onClick={() => run(() => dismissContractorGroup(group.expenditureIds))}>
          Not a contractor
        </button>
      </div>
    </div>
  );
}

/**
 * Migration M5 (Phase 2, schema-patch spec, 2026-09-26): groups
 * unreviewed Expenditure.payee values by a normalized name so a clerk can
 * confirm each group as a Contractor (existing or new) or dismiss it —
 * never auto-merged.
 */
export function ContractorReviewPage() {
  const [groups, setGroups] = useState<PayeeGroup[] | null>(null);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([listContractorReviewGroups(), listContractors()])
      .then(([g, c]) => {
        setGroups(g.groups);
        setContractors(c.items);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the review queue"));
  };

  useEffect(load, []);

  return (
    <div>
      <h1>Contractor Review</h1>
      <p className="muted">
        Vendor names from Expenditure records, grouped by a normalized spelling. Confirm each group as a contractor
        (existing or new) or mark it not a contractor — nothing here is merged automatically.
      </p>
      {error && <p className="form-error">{error}</p>}
      {groups === null && !error && <p className="muted">Loading…</p>}
      {groups && groups.length === 0 && <p className="muted">Nothing to review.</p>}
      {groups?.map((group) => (
        <GroupCard key={group.normalizedName} group={group} contractors={contractors} onDone={load} />
      ))}
    </div>
  );
}
