/**
 * deps.ts — the dependencies every router needs, injected from the
 * composition root (index.ts) through app.ts into each routes/*.ts file.
 *
 * Wiring is deliberately explicit instead of module-level singletons so a
 * first-time reader can trace index → app → routes → repositories top-down
 * and see exactly which repository each route talks to.
 */
import { TokenVerifier } from "@smart/shared";
import { UsersRepository } from "./repositories/users.repository";
import { UsersDemographicsRepository } from "./repositories/users-demographics.repository";

export interface AuthRouteDeps {
  /** Verifies Bearer/cookie tokens (dev or Cognito mode, see adapters/jwt.ts). */
  verifier: TokenVerifier;
  /** Owns the `users` table. */
  users: UsersRepository;
  /** Owns the `users_demographics` table. */
  demographics: UsersDemographicsRepository;
}
