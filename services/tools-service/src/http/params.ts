import { ZodType } from "zod";
import { ApiError } from "@smart/shared/src/server";

/**
 * params.ts — validate a path parameter (parseBody's counterpart for
 * req.params) so a malformed id/token becomes a clean 400 instead of a 500
 * from the database.
 */
export function parseParam<T>(schema: ZodType<T>, value: string | undefined, name: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw ApiError.badRequest(`Invalid ${name}`, result.error.flatten());
  }
  return result.data;
}
