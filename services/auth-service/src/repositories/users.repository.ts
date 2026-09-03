/**
 * users.repository.ts — Auth Service (port 8081; diagram: "Authentication
 * Service (User Profile)" + "Amazon RDS (Auth DB)").
 *
 * Owns the `users` table (db/init/auth-service.sql): one row per platform
 * user, keyed by the Cognito `sub` (uuid). This is the SQL port of the
 * monolith's `apps/web/services/UserService.ts` user-profile queries.
 * `users_demographics` belongs to users-demographics.repository.ts; this
 * file never writes it.
 *
 * Env: DATABASE_URL (pool is created once in src/index.ts).
 */
import { Pool } from "pg";
import { AuthClaims, queryOne } from "@smart/shared";

/**
 * Columns of `users` exactly as SELECTed below. Declared as a type alias
 * (not an interface) so it satisfies pg's QueryResultRow constraint, and
 * kept snake_case at the SQL border — this is the raw database shape.
 */
export type UsersRow = {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
};

export class UsersRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Find a profile row by user id (Cognito sub). Returns null when the user
   * has never logged in — callers turn that into a 404.
   */
  async findById(userId: string): Promise<UsersRow | null> {
    return queryOne<UsersRow>(
      this.pool,
      `SELECT id, name, email, avatar_url
       FROM users
       WHERE id = $1`,
      [userId]
    );
  }

  /**
   * First login creates the row; every later login refreshes the identity
   * fields Cognito owns (name/email). COALESCE keeps the stored value when a
   * claim is absent (dev tokens may omit email/name). avatar_url is NOT
   * touched: it is app-managed via PATCH /profile, not a token claim.
   */
  async upsertFromClaims(claims: AuthClaims): Promise<UsersRow> {
    const row = await queryOne<UsersRow>(
      this.pool,
      `INSERT INTO users (id, name, email)
       VALUES ($1, COALESCE($2, 'null'), $3)
       ON CONFLICT (id) DO UPDATE
         SET name  = COALESCE(EXCLUDED.name, users.name),
             email = COALESCE(EXCLUDED.email, users.email)
       RETURNING id, name, email, avatar_url`,
      [
        claims.sub,
        claims.name ?? null,
        claims.email ?? null,
      ]
    );
    // NOT NULL primary key is always returned by the INSERT ... RETURNING.
    return row as UsersRow;
  }

  /**
   * PATCH /profile — update only the fields the client sent. COALESCE turns
   * the null placeholders for omitted keys into "keep the current value"
   * (PATCH semantics; PUT-style full replacement is not what this route means).
   */
  async updateProfile(
    userId: string,
    patch: { name?: string; avatar_url?: string }
  ): Promise<UsersRow | null> {
    return queryOne<UsersRow>(
      this.pool,
      `UPDATE users
       SET name       = COALESCE($2, name),
           avatar_url = COALESCE($3, avatar_url)
       WHERE id = $1
       RETURNING id, name, email, avatar_url`,
      [userId, patch.name ?? null, patch.avatar_url ?? null]
    );
  }
}
