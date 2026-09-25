import { NavLink, Outlet } from "react-router-dom";
import { MODULE_GROUP_ORDER, MODULES } from "../modules";
import { useAuth } from "../auth/AuthContext";
import { OfflineIndicator } from "./OfflineIndicator";

const ADMIN_ROLES = new Set(["SuperAdmin", "CountySuperAdmin"]);
const ANALYSIS_ROLES = new Set(["Commissioner", "Official", "SuperAdmin"]);

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
          {MODULE_GROUP_ORDER.map((group) => {
            const groupModules = MODULES.filter((m) => m.group === group);
            if (groupModules.length === 0) return null;
            return (
              <div className="nav-group" key={group}>
                <span className="nav-group-label">{group}</span>
                {group === "Community" && <NavLink to="/community">Community Registry</NavLink>}
                {groupModules.map((m) => (
                  <NavLink key={m.key} to={`/${m.key}`}>
                    {m.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
          <div className="nav-group">
            <span className="nav-group-label">System</span>
            {user && ANALYSIS_ROLES.has(user.role) && <NavLink to="/analysis">Analysis</NavLink>}
            <NavLink to="/conflicts">Sync Conflicts</NavLink>
            {user && ADMIN_ROLES.has(user.role) && <NavLink to="/admin/whitelist">Whitelist</NavLink>}
            {user && ADMIN_ROLES.has(user.role) && <NavLink to="/admin/settings">Settings</NavLink>}
          </div>
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
