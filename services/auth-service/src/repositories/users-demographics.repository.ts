/**
 * users-demographics.repository.ts — Auth Service (port 8081; diagram:
 * "Authentication Service (User Profile)" + "Amazon RDS (Auth DB)").
 *
 * Owns the `users_demographics` table (db/init/auth-service.sql): the
 * traveller's budget / travel-type / purpose / party-size preferences that
 * later feed the Gemini planner. One row per user — UNIQUE (user_id), with
 * ON DELETE CASCADE from users, which is what makes ON CONFLICT (user_id)
 * a safe upsert. SQL port of the monolith's
 * `apps/web/services/UserService.ts` demographics queries.
 *
 * Env: DATABASE_URL (pool is created once in src/index.ts).
 */
import { Pool } from "pg";
import { ApiError, queryOne } from "@smart/shared";

/** Raw snake_case row shape pg returns for `users_demographics`. */
export type UsersDemographicsRow = {
  id: string; // bigserial → pg hands int8 back as a string
  user_id: string;
  min_budget: string | null; // numeric → pg returns text (precision safety)
  max_budget: string | null;
  travel_type: string;
  purpose: string;
  number_of_people: number | null;
};

/** camelCase domain shape the routes return; numeric columns are numbers. */
export type UserDemographicsRecord = {
  id: string;
  userId: string;
  minBudget: number | null;
  maxBudget: number | null;
  travelType: string;
  purpose: string;
  numberOfPeople: number | null;
};

/** Input for upsert(); numberOfPeople must already be an integer or null. */
export type UpsertDemographicsInput = {
  userId: string;
  minBudget: number | null;
  maxBudget: number | null;
  travelType: string;
  purpose: string;
  numberOfPeople: number | null;
};

/**
 * Map the SQL row to the camelCase domain shape.
 * `numeric` arrives as text from pg to avoid float precision loss; the
 * shared DTO contract wants JSON numbers, so convert at this boundary —
 * the only place the text→number decision is made.
 */
function toRecord(row: UsersDemographicsRow): UserDemographicsRecord {
  return {
    id: row.id,
    userId: row.user_id,
    minBudget: row.min_budget === null ? null : Number(row.min_budget),
    maxBudget: row.max_budget === null ? null : Number(row.max_budget),
    travelType: row.travel_type,
    purpose: row.purpose,
    numberOfPeople: row.number_of_people,
  };
}

export class UsersDemographicsRepository {
  constructor(private readonly pool: Pool) {}

  /** Read the row for one user; null when they have never saved preferences. */
  async findByUserId(userId: string): Promise<UserDemographicsRecord | null> {
    const row = await queryOne<UsersDemographicsRow>(
      this.pool,
      `SELECT id, user_id, min_budget, max_budget, travel_type, purpose, number_of_people
       FROM users_demographics
       WHERE user_id = $1`,
      [userId]
    );
    return row ? toRecord(row) : null;
  }

  /**
   * Create or fully replace the user's preferences (PUT semantics: the
   * request carries the whole representation, so fields absent from the
   * request body are stored as NULL/'' — see the route for the conversion).
   */
  async upsert(input: UpsertDemographicsInput): Promise<UserDemographicsRecord | null> {
    try {
      const row = await queryOne<UsersDemographicsRow>(
        this.pool,
        `INSERT INTO users_demographics
           (user_id, min_budget, max_budget, travel_type, purpose, number_of_people)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           min_budget       = EXCLUDED.min_budget,
           max_budget       = EXCLUDED.max_budget,
           travel_type      = EXCLUDED.travel_type,
           purpose          = EXCLUDED.purpose,
           number_of_people = EXCLUDED.number_of_people
         RETURNING id, user_id, min_budget, max_budget, travel_type, purpose, number_of_people`,
        [
          input.userId,
          input.minBudget,
          input.maxBudget,
          input.travelType,
          input.purpose,
          input.numberOfPeople,
        ]
      );
      return row ? toRecord(row) : null;
    } catch (error) {
      // user_id is a FK into users: a demographics write for an unknown user
      // means no profile row exists yet (the client should call /me first).
      // Postgres error 23503 = foreign_key_violation; map it to a 404 with a
      // hint instead of a raw 500 so the client can recover on its own.
      if (isForeignKeyViolation(error)) {
        throw ApiError.notFound(
          `Cannot save demographics: no user row for ${input.userId} (call GET /api/auth/me first)`
        );
      }
      throw error;
    }
  }
}

/** pg attaches the SQLSTATE to errors as `.code`; 23503 is FK violations. */
function isForeignKeyViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23503";
}
