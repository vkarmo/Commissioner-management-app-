import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import {
  getExpenditureLinks,
  getPublicWorksContractor,
  listContractors,
  listPublicWorksItemsForPicker,
  setExpenditureContractor,
  setExpenditurePublicWorksItem,
  setPublicWorksContractor,
  type Contractor,
  type PublicWorksItemSummary,
} from "../api/contractorLinks";

/**
 * Phase 2 (schema-patch spec, 2026-09-26): online-only convenience for
 * setting BUILT_BY (public works) or PAID_TO + FOR (expenditure) —
 * layered on the offline-first form the same way ParcelDetailPanel/
 * FireIncidentActions are, since relate() needs a live connection.
 */
export function ContractorLinkPanel({ mode, recordId }: { mode: "public-works" | "expenditure"; recordId: string }) {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [publicWorksItems, setPublicWorksItems] = useState<PublicWorksItemSummary[]>([]);
  const [currentContractor, setCurrentContractor] = useState<Contractor | null>(null);
  const [currentPublicWorksItem, setCurrentPublicWorksItem] = useState<PublicWorksItemSummary | null>(null);
  const [selectedContractorId, setSelectedContractorId] = useState("");
  const [selectedPublicWorksItemId, setSelectedPublicWorksItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const contractorList = await listContractors();
      setContractors(contractorList.items);
      if (mode === "public-works") {
        const current = await getPublicWorksContractor(recordId);
        setCurrentContractor(current.contractor);
      } else {
        const [current, pw] = await Promise.all([getExpenditureLinks(recordId), listPublicWorksItemsForPicker()]);
        setCurrentContractor(current.contractor);
        setCurrentPublicWorksItem(current.publicWorksItem);
        setPublicWorksItems(pw.items);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load contractor links (offline?)");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, mode]);

  const linkContractor = async () => {
    if (!selectedContractorId) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "public-works") await setPublicWorksContractor(recordId, selectedContractorId);
      else await setExpenditureContractor(recordId, selectedContractorId);
      setSelectedContractorId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to link contractor");
    } finally {
      setBusy(false);
    }
  };

  const linkPublicWorksItem = async () => {
    if (!selectedPublicWorksItemId) return;
    setBusy(true);
    setError(null);
    try {
      await setExpenditurePublicWorksItem(recordId, selectedPublicWorksItemId);
      setSelectedPublicWorksItemId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to link project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fire-actions-panel">
      <h2>Contractor</h2>
      {error && <p className="form-error">{error}</p>}
      <p className="muted">
        {currentContractor
          ? `${mode === "public-works" ? "Built by" : "Paid to"}: ${currentContractor.name}`
          : "No contractor linked yet."}
      </p>
      <div className="inline-controls">
        <select value={selectedContractorId} onChange={(e) => setSelectedContractorId(e.target.value)}>
          <option value="">Choose a contractor…</option>
          {contractors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy || !selectedContractorId} onClick={linkContractor}>
          {currentContractor ? (mode === "public-works" ? "Add" : "Replace") : "Link"}
        </button>
      </div>
      {mode === "public-works" && currentContractor && (
        <p className="muted">A project can have more than one contractor over time — "Add" doesn't replace this one.</p>
      )}

      {mode === "expenditure" && (
        <div className="fire-actions-block">
          <h3>Project</h3>
          <p className="muted">
            {currentPublicWorksItem ? `Paid for: ${currentPublicWorksItem.title}` : "Not linked to a project yet."}
          </p>
          <div className="inline-controls">
            <select value={selectedPublicWorksItemId} onChange={(e) => setSelectedPublicWorksItemId(e.target.value)}>
              <option value="">Choose a project…</option>
              {publicWorksItems.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy || !selectedPublicWorksItemId} onClick={linkPublicWorksItem}>
              {currentPublicWorksItem ? "Replace" : "Link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
