"use client";

/**
 * Session context for the web app (diagram: "Clients — Web").
 *
 * Real mode resolves the session with GET /api/auth/me through the gateway
 * rewrite: auth-service verifies the si_session cookie (the Cognito id_token
 * set by /auth/callback), upserts the user row from the JWT claims, and
 * returns the profile. Sign-out hands over to /auth/signout, which clears
 * the httpOnly cookie server-side and continues to Cognito's end-session.
 *
 * Mock mode (NEXT_PUBLIC_ENABLE_MOCK_AUTH, used by Cypress/offline) keeps the
 * legacy canned-user path — no network, exactly as before.
 */
import { UserService } from "@/services/UserService";
// Deep imports, not the @smart/api-client barrel or getApiClient(): the
// barrel re-exports createApiClient, which pulls @smart/shared's index (and
// through it nodemailer → Node's `net`) into the browser bundle — the build
// fails with "Can't resolve 'net'". These four modules are browser-safe,
// and the call below is byte-for-byte what client.ts's auth.me does
// (requestJson → GET /auth/me → MeResponseSchema). Fix belongs in a
// shared-touching task; flagged on the T2.2 tracker row.
import { requestJson } from "@smart/api-client/src/request";
import { ApiClientError } from "@smart/api-client/src/errors";
import { isMockModeEnabled, resolveApiBaseUrl } from "@smart/api-client/src/env";
import { MeResponseSchema } from "@smart/shared/src/dto/auth";
import { createContext, useContext, useEffect, useState } from "react";

interface AuthContextProps {
  // Typed `any` deliberately: this context's exported shape must stay
  // backward-compatible — several consumers (Header, hotel and itinerary
  // pages) belong to parallel Phase-2 tasks and must keep compiling
  // untouched. The T3.4 cleanup retypes this to UserProfile | null.
  user: any;
  loading: boolean;
  updateUser: (newUser: any) => void;
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
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        if (isMockModeEnabled()) {
          // Cypress/offline: the legacy canned user, no network.
          setUser(await UserService.getUserSession());
        } else {
          // GET /api/auth/me through the same-origin rewrite: the gateway
          // verifies the si_session cookie and auth-service upserts the user
          // from the Cognito claims before returning the profile.
          const me = await requestJson({
            baseUrl: resolveApiBaseUrl(),
            method: "GET",
            path: "/auth/me",
            responseSchema: MeResponseSchema,
          });
          setUser(me.user);
        }
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
      if (isMockModeEnabled()) {
        await UserService.signOutUser(); // legacy mock path, no-op offline
        setUser(null); // Set the user state to null
        window.location.href = "/"; // Reload the window
      } else {
        setUser(null);
        // /auth/signout clears the httpOnly cookie server-side, then sends
        // the browser on to Cognito's end-session endpoint.
        window.location.href = "/auth/signout";
      }
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const updateUser = (newUser: any) => {
    setUser(newUser);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
