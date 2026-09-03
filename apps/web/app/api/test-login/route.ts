// /app/api/test-login/route.ts (App Router)
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const projectRef = "ofisnfgjitykwijevgwi";

const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  // Set fake cookies to simulate a session for testing.
  const response = NextResponse.json({ success: true });

    // ✅ Set fake Supabase session cookies
    // Set both cookies with expiration
    response.cookies.set(`sb-${projectRef}-auth-token.0`, "fake-access-token", {
        path: "/",
        httpOnly: false,
        secure: false,
        expires: oneHourFromNow,
        });

        response.cookies.set(`sb-${projectRef}-auth-token.1`, "fake-refresh-token", {
        path: "/",
        httpOnly: false,
        secure: false,
        expires: oneHourFromNow,
        });

  return response;
}
