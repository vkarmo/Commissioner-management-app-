import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { listPublicWorksItemsForPicker, type PublicWorksItemSummary } from "../api/contractorLinks";
import { getCommunicationAbout, listCommitmentsForPicker } from "../api/concessionLinks";
import type { NamedRecord } from "../api/familyLinks";
import { api } from "../api/client";

/**
 * Phase 4 (schema-patch spec, 2026-09-26): "link to commitment/project"
 * action on a CommunicationLog entry — lets a citizen complaint attach to
 * the specific promise or project it concerns. Each of ABOUT->Commitment
 * and ABOUT->PublicWorksItem is single-target (see
 * graphService.relate()'s relationshipSideEffects), so picking a
 * different one replaces the previous link rather than adding to it.
 */
export function CommunicationAboutPanel({ recordId }: { recordId: string }) {
  const [commitments, setCommitments] = useState<NamedRecord[]>([]);
  const [workItems, setWorkItems] = useState<PublicWorksItemSummary[]>([]);
  const [currentCommitment, setCurrentCommitment] = useState<NamedRecord | null>(null);
  const [currentWorkItem, setCurrentWorkItem] = useState<PublicWorksItemSummary | null>(null);
  const [selectedCommitmentId, setSelectedCommitmentId] = useState("");
  const [selectedWorkItemId, setSelectedWorkItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [commitmentList, workItemList, current] = await Promise.all([
        listCommitmentsForPicker(),
        listPublicWorksItemsForPicker(),
        getCommunicationAbout(recordId),
      ]);
      setCommitments(commitmentList.items);
      setWorkItems(workItemList.items);
      setCurrentCommitment(current.commitment);
      setCurrentWorkItem(current.publicWorksItem);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load links (offline?)");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  const linkCommitment = async () => {
    if (!selectedCommitmentId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/relate", {
        type: "ABOUT",
        from: { resource: "CommunicationLog", id: recordId },
        to: { resource: "Commitment", id: selectedCommitmentId },
      });
      setSelectedCommitmentId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to link commitment");
    } finally {
      setBusy(false);
    }
  };

  const linkWorkItem = async () => {
    if (!selectedWorkItemId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/relate", {
        type: "ABOUT",
        from: { resource: "CommunicationLog", id: recordId },
        to: { resource: "PublicWorksItem", id: selectedWorkItemId },
      });
      setSelectedWorkItemId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to link project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fire-actions-panel">
      <h2>What is this about?</h2>
      {error && <p className="form-error">{error}</p>}

      <div className="fire-actions-block">
        <h3>Commitment</h3>
        <p className="muted">
          {currentCommitment ? `Linked to: ${currentCommitment.title as string}` : "Not linked to a commitment yet."}
        </p>
        <div className="inline-controls">
          <select value={selectedCommitmentId} onChange={(e) => setSelectedCommitmentId(e.target.value)}>
            <option value="">Choose a commitment…</option>
            {commitments.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title as string}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || !selectedCommitmentId} onClick={linkCommitment}>
            {currentCommitment ? "Replace" : "Link"}
          </button>
        </div>
      </div>

      <div className="fire-actions-block">
        <h3>Project</h3>
        <p className="muted">
          {currentWorkItem ? `Linked to: ${currentWorkItem.title as string}` : "Not linked to a project yet."}
        </p>
        <div className="inline-controls">
          <select value={selectedWorkItemId} onChange={(e) => setSelectedWorkItemId(e.target.value)}>
            <option value="">Choose a project…</option>
            {workItems.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title as string}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || !selectedWorkItemId} onClick={linkWorkItem}>
            {currentWorkItem ? "Replace" : "Link"}
          </button>
        </div>
      </div>
    </div>
  );
}
