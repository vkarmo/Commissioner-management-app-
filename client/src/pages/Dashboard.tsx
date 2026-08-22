import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MODULES } from "../modules";
import { listResource } from "../api/resources";
import { useAuth } from "../auth/AuthContext";

export function Dashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        MODULES.map(async (m) => {
          const items = await listResource(m);
          return [m.key, items.length] as const;
        }),
      );
      if (!cancelled) setCounts(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1>
        {user?.district ? `${user.district} District` : `${user?.county} County`} Dashboard
      </h1>
      <p className="muted">Signed in as {user?.role}. Data shown is scoped to your office.</p>
      <div className="card-grid">
        {MODULES.map((m) => (
          <Link key={m.key} to={`/${m.key}`} className="stat-card">
            <span className="stat-value">{counts[m.key] ?? "…"}</span>
            <span className="stat-label">{m.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
