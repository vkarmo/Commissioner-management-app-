import { useEffect, useRef } from "react";
import { GOOGLE_CLIENT_ID } from "../config";
import { useAuth } from "./AuthContext";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function GoogleLoginButton() {
  const { loginWithGoogleIdToken, error } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (!window.google || !buttonRef.current) {
        setTimeout(tryRender, 200);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          void loginWithGoogleIdToken(response.credential);
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
      });
    };
    tryRender();
    return () => {
      cancelled = true;
    };
  }, [loginWithGoogleIdToken]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <p className="auth-warning">
        Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID to enable login.
      </p>
    );
  }

  return (
    <div>
      <div ref={buttonRef} />
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
