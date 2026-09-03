/**
 * POST /api/auth/dev-token — mock-auth token minting (replaces the legacy
 * `app/api/test-login` cookie hack for the microservices world).
 *
 * Who calls it: Cypress (mock auth), local development, and graders who want
 * a token to try protected routes without Cognito. It MUST stay harmless in
 * production, so it exists only when TOKEN_VERIFY_MODE=dev — under cognito
 * mode the route answers 404 and @smart/shared's signDevToken refuses as a
 * second line of defence.
 *
 * Request:  {} or { "sub": "...", "email": "...", "name": "..." }   (all optional)
 * Response: 201 { token, claims } — the token is also set as the `si_session`
 * cookie so both auth styles (Bearer header / cookie) can be exercised.
 */

import { Request, RequestHandler, Response } from "express";
import { AuthClaimsSchema, env, parseBody, signDevToken } from "@smart/shared";
import { asyncRoute } from "./async-route";

/** Same cookie the shared JWT adapter reads — kept in sync by convention. */
const SI_SESSION_COOKIE = "si_session";
const DEV_TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12h, matching signDevToken's default
const DEFAULT_DEV_SUB = "dev-user";

// sub defaults to a stable dev identity so Cypress gets a deterministic user.
const DevTokenRequestSchema = AuthClaimsSchema.partial();

export const devTokenHandler: RequestHandler = asyncRoute(
  async (req: Request, res: Response): Promise<void> => {
    if (env("TOKEN_VERIFY_MODE", "dev") !== "dev") {
      res.status(404).json({
        error: "dev-token is only available when TOKEN_VERIFY_MODE=dev (mock auth)",
      });
      return;
    }

    const requested = parseBody(DevTokenRequestSchema, req.body);
    const claims = AuthClaimsSchema.parse({
      sub: requested.sub ?? DEFAULT_DEV_SUB,
      email: requested.email,
      name: requested.name,
    });

    const token = await signDevToken(claims);
    res
      .cookie(SI_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: DEV_TOKEN_TTL_SECONDS * 1000,
      })
      .status(201)
      .json({ token, claims });
  }
);
