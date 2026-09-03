/**
 * demographics.routes.ts — GET/PUT /api/auth/demographics.
 *
 * Reads and writes the caller's travel preferences (budget, travel type,
 * purpose, party size). The legacy web form sends numberOfPeople as a text
 * input (string), so the shared DTO allows string | number and this route
 * normalizes it to the integer the database column expects.
 * Response contract: GetDemographicsResponseSchema from @smart/shared.
 */
import { Router } from "express";
import {
  ApiError,
  GetDemographicsResponseSchema,
  parseBody,
  requireClaims,
  UserDemographicsSchema,
} from "@smart/shared";
import { asyncHandler } from "../http/async-handler";
import { AuthRouteDeps } from "../deps";
import { UserDemographicsRecord } from "../repositories/users-demographics.repository";

export function createDemographicsRouter(deps: AuthRouteDeps): Router {
  const router = Router();

  /**
   * GET /api/auth/demographics — the caller's saved preferences.
   * Answers with the DDL defaults ('' travel_type/purpose, NULL budgets)
   * when no row exists yet, so the edit form can render an empty form
   * instead of having to handle a 404 on first visit.
   */
  router.get(
    "/demographics",
    asyncHandler(async (req, res) => {
      const claims = await requireClaims(deps.verifier, req);
      const record = await deps.demographics.findByUserId(claims.sub);
      res.status(200).json(toDemographicsResponse(claims.sub, record));
    })
  );

  /**
   * PUT /api/auth/demographics — create or fully replace preferences.
   * Body: UserDemographicsSchema — { minBudget?, maxBudget?, travelType,
   * purpose, numberOfPeople? (string|number) }. PUT replaces the whole
   * representation: absent optional fields are stored as NULL (see
   * users-demographics.repository.upsert), matching how the legacy form
   * submits every field at once.
   */
  router.put(
    "/demographics",
    asyncHandler(async (req, res) => {
      const claims = await requireClaims(deps.verifier, req);
      const dto = parseBody(UserDemographicsSchema, req.body);
      const saved = await deps.demographics.upsert({
        userId: claims.sub,
        minBudget: dto.minBudget ?? null,
        maxBudget: dto.maxBudget ?? null,
        travelType: dto.travelType,
        purpose: dto.purpose,
        numberOfPeople: parsePartySize(dto.numberOfPeople),
      });
      res.status(200).json(toDemographicsResponse(claims.sub, saved));
    })
  );

  return router;
}

/**
 * Map a stored record (or "nothing saved yet") to the shared response DTO.
 * numberOfPeople: null means "not set" and is modelled by omitting the
 * field (the DTO allows string | number | undefined, not null).
 */
function toDemographicsResponse(userId: string, record: UserDemographicsRecord | null) {
  return GetDemographicsResponseSchema.parse({
    userId,
    minBudget: record?.minBudget ?? null,
    maxBudget: record?.maxBudget ?? null,
    travelType: record?.travelType ?? "", // '' = DDL default before first save
    purpose: record?.purpose ?? "",
    numberOfPeople: record?.numberOfPeople ?? undefined,
  });
}

/**
 * Normalize the party size to the integer `number_of_people` expects.
 * Accepts the string the legacy form sends ("2") or a real number; anything
 * else is a client mistake and becomes a 400 naming the offending value.
 */
function parsePartySize(raw: string | number | undefined): number | null {
  if (raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isInteger(raw)) {
      throw ApiError.badRequest(`numberOfPeople must be an integer, received ${raw}`);
    }
    return raw;
  }
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed)) {
    throw ApiError.badRequest(`numberOfPeople must be an integer, received "${raw}"`);
  }
  return parsed;
}
