import { z } from "zod";

/**
 * UUID-shaped identifiers supplied from OUTSIDE the system — above all the
 * `sub` claim of a Cognito-issued JWT (the Google-login user id).
 *
 * Cognito subs are formatted as UUIDs but are NOT always RFC-4122 compliant:
 * the version nibble can be anything and the variant nibble is often outside
 * `8/9/a/b` (e.g. `594ad51c-d081-709d-56fa-1164e582c8be`). PostgreSQL's `uuid`
 * type accepts any such shape-checked value — and auth-service already stores
 * these subs in a `uuid` column on first login — so route validation must be
 * AT LEAST AS LENIENT AS THE DATABASE, or real signed-in users get 400s on
 * their own ids (observed live: `GET /itineraries/user/<cognito-sub>` → 400
 * "Invalid userId" while the profile page worked).
 *
 * Use this for client-supplied user ids. Keep strict `z.string().uuid()` for
 * ids THIS system generated (Postgres `gen_random_uuid()`), which are always
 * fully RFC-compliant — the strictness there is cheap and catches bugs.
 */
export const UuidLikeSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Must be a UUID-shaped id",
  );
export type UuidLike = z.infer<typeof UuidLikeSchema>;
