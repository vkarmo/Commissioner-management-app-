import { NavLink, Outlet } from "react-router-dom";
import { MODULES } from "../modules";
import { useAuth } from "../auth/AuthContext";
import { OfflineIndicator } from "./OfflineIndicator";

const ADMIN_ROLES = new Set(["SuperAdmin", "CountySuperAdmin"]);

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Commissioner's Office</strong>
          <span className="brand-scope">
            {user?.district ? `${user.district}, ${user.county}` : user?.county}
          </span>
        </div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          {MODULES.map((m) => (
            <NavLink key={m.key} to={`/${m.key}`}>
              {m.label}
            </NavLink>
          ))}
          <NavLink to="/conflicts">Sync Conflicts</NavLink>
          {user && ADMIN_ROLES.has(user.role) && <NavLink to="/admin/whitelist">Whitelist</NavLink>}
          {user && ADMIN_ROLES.has(user.role) && <NavLink to="/admin/settings">Settings</NavLink>}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <OfflineIndicator />
          <div className="user-chip">
            <span>
              {user?.name || user?.email} · {user?.role}
            </span>
            <button type="button" onClick={logout} className="link-button">
              Sign out
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
