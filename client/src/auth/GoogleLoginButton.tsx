import { useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { usePublicConfig } from "../config/PublicConfigContext";

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
  const { status } = usePublicConfig();
  const googleClientId = status.googleClientId;
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!googleClientId) return;

    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (!window.google || !buttonRef.current) {
        setTimeout(tryRender, 200);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
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
  }, [googleClientId, loginWithGoogleIdToken]);

  if (!googleClientId) {
    return (
      <p className="auth-warning">
        Google sign-in is not configured yet. Ask a Super Admin to set it under Settings.
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
