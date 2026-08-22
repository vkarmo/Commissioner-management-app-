import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { GoogleLoginButton } from "../auth/GoogleLoginButton";

export function Login() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Commissioner's Office</h1>
        <p>Sign in with your whitelisted Google account to continue.</p>
        <GoogleLoginButton />
      </div>
    </div>
  );
}
