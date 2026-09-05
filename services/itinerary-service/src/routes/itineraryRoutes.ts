import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z, ZodType, ZodTypeAny } from "zod";
import {
  ApiError,
  AuthClaims,
  CreateItineraryRequestSchema,
  CreateItineraryResponseSchema,
  GetItineraryResponseSchema,
  ListItinerariesResponseSchema,
  TokenVerifier,
  UpdateItineraryRequestSchema,
  parseBody,
  requireClaims,
  withTransaction,
} from "@smart/shared";
import type { Pool } from "pg";
import * as itineraryRepository from "../repositories/itineraryRepository";
import { publishItineraryCreated } from "../itineraryCreatedPublisher";

/**
 * parseBody's T is inferred from the schema's INPUT side, where zod `.default()`
 * fields are still optional. After a successful safeParse every default is
 * actually filled in, so re-type the result as the schema's OUTPUT contract
 * once, here — instead of casting at every call site.
 */
function parseRequestBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  return parseBody(schema, body) as z.output<S>;
}

/**
 * Routes for the Itinerary Service, mounted at /api/itineraries by src/index.ts.
 *
 * Call path (web save flow): ItineraryTimeline.tsx → POST gateway:8080/api/
 * itineraries → forwarded here → itineraryRepository SQL → RabbitMQ event.
 *
 * Every route re-checks the Cognito JWT with requireClaims even though the
 * gateway already verified it — the service is also exposed directly to
 * Mobile / Third-Party clients on the diagram and must defend itself.
 */
export function createItineraryRouter(pool: Pool, verifier: TokenVerifier): Router {
  const router = Router();

  /**
   * Wrap an async handler so rejections reach the shared error middleware
   * (same idea as the shared asyncHandler, but with concrete express types).
   */
  const route =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction): void => {
      handler(req, res).catch(next);
    };

  /**
   * Validate a path parameter (parseBody's counterpart for req.params) so a
   * malformed id becomes a clean 400 instead of a 500 from the database.
   */
  function parseParam<T>(schema: ZodType<T>, value: string | undefined, name: string): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw ApiError.badRequest(`Invalid ${name}`, result.error.flatten());
    }
    return result.data;
  }

  /**
   * requireClaims, but with invalid/expired tokens reported as 401. The shared
   * verifier already throws a 401-shaped error for a MISSING token; a token
   * that fails verification surfaces as a raw jose error (its `code` starts
   * with ERR_JWS or ERR_JWT), which would otherwise be misreported as a 500.
   * Anything else (e.g. an unreachable Cognito JWKS endpoint) keeps its real
   * status.
   */
  async function requireAuth(req: Request): Promise<AuthClaims> {
    try {
      return await requireClaims(verifier, req);
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      if (code.startsWith("ERR_JWS") || code.startsWith("ERR_JWT")) {
        throw ApiError.unauthorized("Invalid authentication token");
      }
      throw error;
    }
  }

  // Specific paths (GET /user/:userId) are declared before /:id for readability.

  /**
   * POST /api/itineraries — save a brand-new itinerary aggregate.
   * Called by the web timeline's Save button. Body: CreateItineraryRequestSchema
   * ({ userId, itinerary, weatherForecast }); responds 201 with
   * CreateItineraryResponseSchema ({ itineraryId }).
   * After the transaction commits, `itinerary.created` is published so the
   * email-service can send the confirmation and schedule the reminder.
   */
  router.post(
    "/",
    route(async (req, res) => {
      // Keep the verified claims: the owner's email rides on the
      // itinerary.created event so the confirmation/reminder mail is
      // addressed to the real recipient (absent claim → email-service's
      // OWNER_EMAIL_FALLBACK).
      const claims = await requireAuth(req);
      const request = parseRequestBody(CreateItineraryRequestSchema, req.body);
      const itineraryId = await withTransaction(pool, (tx) =>
        itineraryRepository.saveItineraryWithChildren(tx, request)
      );
      await publishItineraryCreated({
        itineraryId,
        userId: request.userId,
        destination: request.itinerary.destination,
        startDate: request.itinerary.startDate,
        endDate: request.itinerary.endDate,
        ownerEmail: claims.email,
      });
      res.status(201).json(CreateItineraryResponseSchema.parse({ itineraryId }));
    })
  );

  /**
   * PUT /api/itineraries/:id — replace an itinerary and re-sync its children
   * in one transaction. Called by the web timeline's Update button.
   * Body: UpdateItineraryRequestSchema (same shape as create); responds
   * 200 with { itineraryId }, or 404 when the id is unknown. No event is
   * published — `itinerary.created` means a new itinerary, not an edit.
   */
  router.put(
    "/:id",
    route(async (req, res) => {
      await requireAuth(req);
      const itineraryId = parseParam(z.string().uuid(), req.params.id, "itinerary id");
      const request = parseRequestBody(UpdateItineraryRequestSchema, req.body);
      const updatedId = await withTransaction(pool, (tx) =>
        itineraryRepository.updateItineraryWithChildren(tx, itineraryId, request)
      );
      if (!updatedId) {
        throw ApiError.notFound(`Itinerary ${itineraryId} not found`);
      }
      res.json(CreateItineraryResponseSchema.parse({ itineraryId: updatedId }));
    })
  );

  /**
   * GET /api/itineraries/user/:userId — list a user's itineraries for the
   * profile page. Responds with ListItinerariesResponseSchema
   * ({ itineraries: [...] }); empty list when the user has none.
   */
  router.get(
    "/user/:userId",
    route(async (req, res) => {
      await requireAuth(req);
      const userId = parseParam(z.string().uuid(), req.params.userId, "userId");
      const itineraries = await itineraryRepository.listItinerariesByUser(pool, userId);
      res.json(ListItinerariesResponseSchema.parse({ itineraries }));
    })
  );

  /**
   * GET /api/itineraries/:id — fetch the full nested aggregate (itinerary +
   * demographics + accommodation + days → activities), snake_case DB rows
   * mapped to the frontend's camelCase Itinerary shape. Responds with
   * GetItineraryResponseSchema; 404 when unknown.
   */
  router.get(
    "/:id",
    route(async (req, res) => {
      await requireAuth(req);
      const itineraryId = parseParam(z.string().uuid(), req.params.id, "itinerary id");
      const aggregate = await itineraryRepository.getItineraryAggregate(pool, itineraryId);
      if (!aggregate) {
        throw ApiError.notFound(`Itinerary ${itineraryId} not found`);
      }
      res.json(GetItineraryResponseSchema.parse(aggregate));
    })
  );

  /**
   * DELETE /api/itineraries/:id — delete an itinerary and, via ON DELETE
   * CASCADE, all of its children. Called from the profile page's delete
   * button. Responds { message }; 404 when already gone.
   */
  router.delete(
    "/:id",
    route(async (req, res) => {
      await requireAuth(req);
      const itineraryId = parseParam(z.string().uuid(), req.params.id, "itinerary id");
      const deletedId = await itineraryRepository.deleteItineraryById(pool, itineraryId);
      if (!deletedId) {
        throw ApiError.notFound(`Itinerary ${itineraryId} not found, cannot delete`);
      }
      res.json({ message: `Itinerary ${itineraryId} deleted successfully` });
    })
  );

  /**
   * DELETE /api/itineraries/accommodation/:accommodationId — remove one hotel
   * from an itinerary. Called by the hotel detail page. Responds { message };
   * 404 when the accommodation id is unknown.
   */
  router.delete(
    "/accommodation/:accommodationId",
    route(async (req, res) => {
      await requireAuth(req);
      // Accommodation ids are bigserial numbers, not uuids.
      const accommodationId = parseParam(
        z.coerce.number().int().positive(),
        req.params.accommodationId,
        "accommodation id"
      );
      const deletedId = await itineraryRepository.deleteAccommodationById(pool, accommodationId);
      if (deletedId === null) {
        throw ApiError.notFound(`Accommodation ${req.params.accommodationId} not found`);
      }
      res.json({ message: "Accommodation deleted successfully" });
    })
  );

  return router;
}
