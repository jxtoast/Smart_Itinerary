"use client";

/**
 * Session context for the web app (diagram: "Clients — Web").
 *
 * One code path for both modes: `getApiClient()` returns the real client in
 * production — `auth.me()` is GET /api/auth/me through the gateway rewrite,
 * where auth-service verifies the si_session cookie (the Cognito id_token set
 * by /auth/callback) and upserts the user from the JWT claims — and the
 * canned in-memory client in mock mode (NEXT_PUBLIC_ENABLE_MOCK_AUTH, used by
 * Cypress/offline). Sign-out differs per mode: real mode hands over to
 * /auth/signout, which clears the httpOnly cookie server-side before
 * continuing to Cognito's end-session endpoint; mock mode just drops the
 * in-memory user.
 */
import { getApiClient } from "@/lib/api";
import { ApiClientError, isMockModeEnabled } from "@smart/api-client";
import type { MeResponse } from "@smart/shared";
import { createContext, useContext, useEffect, useState } from "react";

/** The session user as the auth service (or its mock) describes it. */
export type SessionUser = MeResponse["user"];

interface AuthContextProps {
  user: SessionUser | null;
  loading: boolean;
  updateUser: (newUser: SessionUser) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextProps>({
  user: null,
  loading: true,
  updateUser: () => { },
  signOut: async () => { },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        // Real mode: the gateway verifies the si_session cookie and
        // auth-service upserts the user from the Cognito claims. Mock mode:
        // the canned "Test User" without any network.
        const me = await getApiClient().auth.me();
        setUser(me.user);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) {
          setUser(null); // signed-out visitor — a normal state, not an error
        } else {
          console.error("Error fetching user session:", err);
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUser(); // only once on mount
  }, []);

  // Sign out function
  const signOut = async () => {
    try {
      setUser(null);
      if (isMockModeEnabled()) {
        window.location.href = "/"; // no server session to clear — reload signed-out
      } else {
        // /auth/signout clears the httpOnly cookie server-side, then sends
        // the browser on to Cognito's end-session endpoint.
        window.location.href = "/auth/signout";
      }
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const updateUser = (newUser: SessionUser) => {
    setUser(newUser);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
