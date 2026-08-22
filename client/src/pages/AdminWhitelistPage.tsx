import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { ALL_ROLES, type Role } from "../types";
import { useAuth } from "../auth/AuthContext";

interface WhitelistEntry {
  id: string;
  email: string;
  role: Role;
  county: string;
  district?: string;
  active: boolean;
}

export function AdminWhitelistPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Clerk");
  const [district, setDistrict] = useState(user?.district || "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: WhitelistEntry[] }>("/admin/whitelist")
      .then((res) => setEntries(res.items))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/admin/whitelist", { email, role, district: district || undefined });
      setEmail("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to invite user");
    }
  };

  const deactivate = async (id: string) => {
    await api.patch(`/admin/whitelist/${id}/deactivate`);
    load();
  };

  return (
    <div>
      <h1>Whitelist</h1>
      <p className="muted">
        Only whitelisted Google accounts can sign in. Office-scoped roles (Clerk, Official, Commissioner,
        SuperAdmin) require a district; county-scoped roles apply across all districts in {user?.county}.
      </p>

      <form onSubmit={invite} className="record-form inline-form">
        <label className="form-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="form-field">
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>District (office-scoped roles)</span>
          <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Johnsonville" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit">Invite</button>
      </form>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="record-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>District</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.email}</td>
                <td>{entry.role}</td>
                <td>{entry.district || "—"}</td>
                <td>{entry.active ? "Active" : "Deactivated"}</td>
                <td>
                  {entry.active && (
                    <button type="button" className="link-button" onClick={() => deactivate(entry.id)}>
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
