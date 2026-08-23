import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ResourceListPage } from "./pages/ResourceListPage";
import { ResourceFormPage } from "./pages/ResourceFormPage";
import { ConflictsPage } from "./pages/ConflictsPage";
import { AdminWhitelistPage } from "./pages/AdminWhitelistPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupWizard } from "./pages/SetupWizard";
import { ConnectionProblem } from "./pages/ConnectionProblem";
import { getSetupStatus, type SetupStatus } from "./api/setup";
import { PublicConfigContext, readCachedStatus, writeCachedStatus } from "./config/PublicConfigContext";
import { startAutoSync } from "./db/sync";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  useEffect(() => startAutoSync(), []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="conflicts" element={<ConflictsPage />} />
        <Route path="admin/whitelist" element={<AdminWhitelistPage />} />
        <Route path="admin/settings" element={<SettingsPage />} />
        <Route path=":moduleKey" element={<ResourceListPage />} />
        <Route path=":moduleKey/:id" element={<ResourceFormPage />} />
      </Route>
    </Routes>
  );
}

/**
 * Gates the whole app on the server's Setup Wizard status before anything
 * else renders. Falls back to the last-known status cached in
 * localStorage so an already-configured install that's opened offline
 * (PWA app shell from cache) doesn't get stuck behind a network check —
 * only a genuinely first-ever load with no connectivity hits the
 * "can't reach the server" screen.
 */
export function App() {
  const [status, setStatus] = useState<SetupStatus | null>(() => readCachedStatus());
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getSetupStatus();
      setStatus(next);
      writeCachedStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the server");
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!status && !checked) return null;
  if (!status && error) return <ConnectionProblem error={error} onRetry={refresh} />;
  if (!status) return null;

  if (!status.configured) {
    return <SetupWizard status={status} onComplete={refresh} />;
  }

  return (
    <PublicConfigContext.Provider value={{ status, refresh }}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </PublicConfigContext.Provider>
  );
}
