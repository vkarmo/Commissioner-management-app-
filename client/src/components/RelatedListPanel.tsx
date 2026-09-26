import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import type { NamedRecord } from "../api/familyLinks";

/**
 * Phase 3 (schema-patch spec, 2026-09-26): a generic "who/what is linked
 * here, add another" panel — reused for family membership, case parties
 * and hearing witnesses, all of which are multi-target relationships
 * (no single-target replace, unlike ContractorLinkPanel's PAID_TO/FOR).
 * Online-only convenience layered on the offline-first form, same as
 * ParcelDetailPanel/ContractorLinkPanel.
 */
export function RelatedListPanel({
  title,
  emptyMessage,
  pickerLabel,
  labelField,
  listCurrent,
  listCandidates,
  onAdd,
}: {
  title: string;
  emptyMessage: string;
  pickerLabel: string;
  labelField: string;
  listCurrent: () => Promise<{ items: NamedRecord[] }>;
  listCandidates: () => Promise<{ items: NamedRecord[] }>;
  onAdd: (candidateId: string) => Promise<unknown>;
}) {
  const [current, setCurrent] = useState<NamedRecord[]>([]);
  const [candidates, setCandidates] = useState<NamedRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [cur, cand] = await Promise.all([listCurrent(), listCandidates()]);
      setCurrent(cur.items);
      setCandidates(cand.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load (offline?)");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(selectedId);
      setSelectedId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to link");
    } finally {
      setBusy(false);
    }
  };

  const currentIds = new Set(current.map((c) => c.id));
  const available = candidates.filter((c) => !currentIds.has(c.id));

  return (
    <div className="fire-actions-panel">
      <h2>{title}</h2>
      {error && <p className="form-error">{error}</p>}
      {current.length === 0 ? (
        <p className="muted">{emptyMessage}</p>
      ) : (
        <ul>
          {current.map((c) => (
            <li key={c.id}>{(c[labelField] as string) || c.id}</li>
          ))}
        </ul>
      )}
      <div className="inline-controls">
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">{pickerLabel}</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {(c[labelField] as string) || c.id}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy || !selectedId} onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}
