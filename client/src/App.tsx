import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ResourceListPage } from "./pages/ResourceListPage";
import { ResourceFormPage } from "./pages/ResourceFormPage";
import { ConflictsPage } from "./pages/ConflictsPage";
import { AdminWhitelistPage } from "./pages/AdminWhitelistPage";
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
        <Route path=":moduleKey" element={<ResourceListPage />} />
        <Route path=":moduleKey/:id" element={<ResourceFormPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
