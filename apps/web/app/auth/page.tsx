/**
 * /auth — the sign-in entry point (diagram: "Amazon Cognito").
 * Cognito mode: forwards straight to the /auth/start route handler, which
 * owns the PKCE generation and the hosted-UI redirect. Mock mode
 * (NEXT_PUBLIC_ENABLE_MOCK_AUTH, used by Cypress/offline): keeps the legacy
 * welcome screen with the Google button.
 */
import AuthForm from "@/components/forms/AuthForm";
import { redirect } from "next/navigation";
import { isMockModeEnabled } from "@smart/api-client";

export default function AuthPage() {
  if (!isMockModeEnabled()) {
    redirect("/auth/start");
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h1 className="text-4xl font-bold">Welcome Back</h1>
      {/* Mock mode only — in Cognito mode this page redirects before rendering. */}
      <AuthForm />
    </div>
  );
}
