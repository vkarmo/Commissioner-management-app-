import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { findModule } from "../modules";
import { listResource } from "../api/resources";

export function ResourceListPage() {
  const { moduleKey = "" } = useParams();
  const module = findModule(moduleKey);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!module) return;
    setLoading(true);
    listResource(module)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [module]);

  if (!module) return <p>Unknown module.</p>;

  return (
    <div>
      <div className="page-header">
        <h1>{module.label}</h1>
        {!module.createDisabled && (
          <Link to={`/${module.key}/new`} className="button-primary">
            + New {module.label.replace(/s$/, "")}
          </Link>
        )}
      </div>
      {module.createDisabled && <p className="muted">{module.createDisabled}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No records yet.</p>
      ) : (
        <table className="record-table">
          <thead>
            <tr>
              <th>{module.fields.find((f) => f.key === module.titleField)?.label || module.titleField}</th>
              <th>Last updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id as string}>
                <td>{(item[module.titleField] as string) || "(untitled)"}</td>
                <td>{item.updated_at ? new Date(item.updated_at as string).toLocaleString() : "—"}</td>
                <td>
                  <Link to={`/${module.key}/${item.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
