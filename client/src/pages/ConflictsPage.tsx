import { useEffect, useState } from "react";
import { api } from "../api/client";

interface SyncConflict {
  id: string;
  entity_label: string;
  entity_id: string;
  client_value: string;
  server_value: string;
  client_updated_at: string;
  server_updated_at: string;
  resolved: boolean;
}

export function ConflictsPage() {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: SyncConflict[] }>("/sync/conflicts")
      .then((res) => setConflicts(res.items.filter((c) => !c.resolved)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const resolve = async (conflictId: string) => {
    await api.patch(`/sync/conflicts/${conflictId}/resolve`);
    load();
  };

  return (
    <div>
      <h1>Sync Conflicts</h1>
      <p className="muted">
        These records were edited both offline and by someone else before syncing. Review which version should
        win, then mark resolved (per the offline-first design: last-write-wins only after clerk review).
      </p>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : conflicts.length === 0 ? (
        <p className="muted">No unresolved conflicts.</p>
      ) : (
        conflicts.map((c) => (
          <div key={c.id} className="conflict-card">
            <h3>
              {c.entity_label} · {c.entity_id}
            </h3>
            <div className="conflict-columns">
              <div>
                <h4>Your offline edit ({new Date(c.client_updated_at).toLocaleString()})</h4>
                <pre>{JSON.stringify(JSON.parse(c.client_value), null, 2)}</pre>
              </div>
              <div>
                <h4>Server version ({new Date(c.server_updated_at).toLocaleString()})</h4>
                <pre>{JSON.stringify(JSON.parse(c.server_value), null, 2)}</pre>
              </div>
            </div>
            <button type="button" onClick={() => resolve(c.id)}>
              Mark reviewed / resolved
            </button>
          </div>
        ))
      )}
    </div>
  );
}
