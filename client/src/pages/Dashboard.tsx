import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MODULE_GROUP_ORDER, MODULES } from "../modules";
import { listResource } from "../api/resources";
import { useAuth } from "../auth/AuthContext";

interface FireStation {
  id: string;
  name?: string;
  status: string;
}
interface FireApparatus {
  id: string;
  type: string;
  status: string;
}
interface FireIncident {
  id: string;
  status: string;
}

export function Dashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [stations, setStations] = useState<FireStation[]>([]);
  const [apparatus, setApparatus] = useState<FireApparatus[]>([]);
  const [fireIncidents, setFireIncidents] = useState<FireIncident[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        MODULES.map(async (m) => {
          const items = await listResource(m);
          return [m.key, items.length] as const;
        }),
      );
      const [stationsRes, apparatusRes, incidentsRes] = await Promise.all([
        listResource(MODULES.find((m) => m.key === "fire-stations")!),
        listResource(MODULES.find((m) => m.key === "fire-apparatus")!),
        listResource(MODULES.find((m) => m.key === "fire-incidents")!),
      ]);
      if (!cancelled) {
        setCounts(Object.fromEntries(entries));
        setStations(stationsRes as unknown as FireStation[]);
        setApparatus(apparatusRes as unknown as FireApparatus[]);
        setFireIncidents(incidentsRes as unknown as FireIncident[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unresolvedFires = fireIncidents.filter((f) => f.status !== "resolved" && f.status !== "referred_to_lnfs").length;
  const referredPending = fireIncidents.filter((f) => f.status === "referred_to_lnfs").length;
  const hasStation = stations.length > 0;

  return (
    <div>
      <h1>
        {user?.district ? `${user.district} District` : `${user?.county} County`} Dashboard
      </h1>
      <p className="muted">Signed in as {user?.role}. Data shown is scoped to your office.</p>

      <div className="card-grid">
        <div className="stat-card stat-card-flag">
          <span className="stat-value">{unresolvedFires}</span>
          <span className="stat-label">Open/unresolved fire incidents</span>
        </div>
        <div className="stat-card stat-card-flag">
          <span className="stat-value">{referredPending}</span>
          <span className="stat-label">Referred to LNFS, pending</span>
        </div>
      </div>

      {hasStation && (
        <div className="apparatus-tile">
          <h2>Fire Apparatus Status</h2>
          <div className="apparatus-grid">
            {stations.map((s) => (
              <div key={s.id} className="apparatus-item">
                <span className="apparatus-label">{s.name || "Fire Station"}</span>
                <span className={`status-pill ${s.status === "operational" ? "status-ok" : "status-syncing"}`}>
                  {s.status}
                </span>
              </div>
            ))}
            {apparatus.map((a) => (
              <div key={a.id} className="apparatus-item">
                <span className="apparatus-label">{a.type}</span>
                <span className={`status-pill ${a.status === "operational" ? "status-ok" : "status-offline"}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {MODULE_GROUP_ORDER.map((group) => {
        const groupModules = MODULES.filter((m) => m.group === group);
        if (groupModules.length === 0) return null;
        return (
          <div key={group}>
            <h2 className="dashboard-group-heading">{group}</h2>
            <div className="card-grid">
              {groupModules.map((m) => (
                <Link key={m.key} to={`/${m.key}`} className="stat-card">
                  <span className="stat-value">{counts[m.key] ?? "…"}</span>
                  <span className="stat-label">{m.label}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
