"use server";

/**
 * Sign-in / sign-out server actions (diagram: "Amazon Cognito").
 * The legacy Supabase OAuth calls are gone: these actions only navigate to
 * the route handlers in apps/web/app/auth/* that own the Cognito hosted-UI
 * handoff (PKCE + token exchange). Export names and signatures are kept
 * compatible with the legacy file, whose callers pass DOM event objects or
 * the current URL — ignored, or reduced to a safe same-origin path.
 */
import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth/cognito";

/** Begin sign-in with Google via the Cognito hosted UI. */
export async function signinWithGoogle(): Promise<void> {
  redirect("/auth/start");
}

/** Same, remembering where the user was so /auth/callback sends them back. */
export async function signinWithGoogleWithRedirect(
  redirectUrl?: string
): Promise<void> {
  const next = sanitizeNextPath(redirectUrl);
  redirect(`/auth/start?next=${encodeURIComponent(next)}`);
}

/** Clear the web session, then hand over to Cognito's end-session endpoint. */
export async function signOut(): Promise<void> {
  redirect("/auth/signout");
}
