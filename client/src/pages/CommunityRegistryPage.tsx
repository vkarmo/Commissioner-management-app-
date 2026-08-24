import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { listQuarters, updateQuarter, type QuarterDirectoryEntry } from "../api/community";

export function CommunityRegistryPage() {
  const [quarters, setQuarters] = useState<QuarterDirectoryEntry[]>([]);
  const [editing, setEditing] = useState<Record<string, Partial<QuarterDirectoryEntry>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listQuarters()
      .then((res) => setQuarters(res.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load quarters (offline?)"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const fieldValue = (q: QuarterDirectoryEntry, key: keyof QuarterDirectoryEntry) =>
    editing[q.id]?.[key] ?? q[key] ?? "";

  const setField = (id: string, key: keyof QuarterDirectoryEntry, value: string) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const save = async (id: string) => {
    const patch = editing[id];
    if (!patch) return;
    setSaving(id);
    setError(null);
    try {
      const normalized = { ...patch };
      if (normalized.population !== undefined) normalized.population = Number(normalized.population);
      await updateQuarter(id, normalized);
      setEditing((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save quarter");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Community Registry</h1>
        <Link to="/people">Full citizen directory →</Link>
      </div>
      <p className="muted">
        Quarter/town chief directory with basic population and contact data. For household-level records, see
        People.
      </p>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="record-table">
          <thead>
            <tr>
              <th>Quarter / Town</th>
              <th>Chief</th>
              <th>Chief phone</th>
              <th>Population</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((q) => {
              const dirty = Boolean(editing[q.id]);
              return (
                <tr key={q.id}>
                  <td>{q.name}</td>
                  <td>
                    <input
                      value={fieldValue(q, "chief_name") as string}
                      onChange={(e) => setField(q.id, "chief_name", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={fieldValue(q, "chief_phone") as string}
                      onChange={(e) => setField(q.id, "chief_phone", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={fieldValue(q, "population") as string}
                      onChange={(e) => setField(q.id, "population", e.target.value)}
                    />
                  </td>
                  <td>
                    {dirty && (
                      <button type="button" disabled={saving === q.id} onClick={() => save(q.id)}>
                        {saving === q.id ? "Saving…" : "Save"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
