import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z, ZodTypeAny } from "zod";
import {
  ApiError,
  AuthClaims,
  FactoryType,
  FlightsSearchRequestSchema,
  FlightsSearchResponseSchema,
  GenerateItineraryRequestSchema,
  GenerateTextResponseSchema,
  HotelDto,
  HotelDtoSchema,
  HotelsSearchRequestSchema,
  HotelsSearchResponseSchema,
  PlanRequestSchema,
  PlanResponseSchema,
  ReferenceResponseSchema,
  TokenVerifier,
  createLogger,
  parseBody,
  requireClaims,
} from "@smart/shared/src/server";
import type { Pool } from "pg";
import { GeminiService } from "../gemini/GeminiService";
import {
  GeminiGeneration,
  buildHotelSearchGeneration,
  buildItineraryGeneration,
  buildWeatherGeneration,
} from "../gemini/prompts";
import { FlightsService } from "../flights/FlightsService";
import { ItineraryPlannerFacade } from "../plan/ItineraryPlannerFacade";
import {
  BaseFetchStrategy,
  FetchStrategyFactory,
  TravelTypeFetchStrategy,
} from "../reference/fetchStrategies";
import { recordHotelSearch, runAuditedGeneration } from "../repositories/auditRepository";

/**
 * Routes for the gemini-service, mounted at /api/gemini by src/index.ts.
 *
 * The gateway forwards /api/gemini/* here UNCHANGED after its own JWT check
 * (Service conventions §6), so every path below is the public path:
 *   POST /api/gemini/generate-itinerary · /generate-weather · /plan
 *   POST /api/gemini/hotels/search       · /flights/search
 *   GET  /api/gemini/reference/countries · /reference/travel-types
 *
 * Every route re-verifies the Cognito JWT with requireClaims — the service is
 * also exposed directly to Mobile / Third-Party clients on the diagram, and
 * AI calls cost real money, so they must never run unauthenticated.
 */

const logger = createLogger("gemini-service");

/** Dependencies resolved once at boot in src/index.ts; null = key not set. */
export interface GeminiServiceDeps {
  pool: Pool;
  verifier: TokenVerifier;
  /** Gemini client; null when GEMINI_API_KEY is not configured. */
  geminiService: GeminiService | null;
  /** Amadeus client; null when AMADEUS_API_KEY is not configured. */
  flightsService: FlightsService | null;
}

export function createGeminiRouter(deps: GeminiServiceDeps): Router {
  const { pool, verifier, geminiService, flightsService } = deps;
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
   * requireClaims, but with invalid/expired tokens reported as 401. The
   * shared verifier throws a 401-shaped error for a MISSING token; a token
   * that fails verification surfaces as a raw jose error (its code starts
   * with ERR_JWS or ERR_JWT) which would otherwise be misreported as a 500.
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

  /**
   * parseBody's T is inferred from the schema's INPUT side, where zod
   * `.default()` fields are still optional. After a successful safeParse every
   * default is filled in, so re-type the result as the schema's OUTPUT
   * contract once, here — instead of casting at every call site.
   */
  function parseRequestBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
    return parseBody(schema, body) as z.output<S>;
  }

  /** 503 when GEMINI_API_KEY is not configured (checked per request). */
  function requireGemini(): GeminiService {
    if (!geminiService) {
      throw new ApiError(503, "AI generation unavailable: GEMINI_API_KEY is not configured on the server");
    }
    return geminiService;
  }

  /**
   * One Gemini call plus its audit row in the generations table (shared
   * helper in the audit repository). Returns the raw response text, which is
   * null when the model call failed (logged inside GeminiService).
   */
  function generateAudited(kind: string, generation: GeminiGeneration): Promise<string | null> {
    return runAuditedGeneration(pool, requireGemini(), kind, generation);
  }

  // -------------------------------------------------------------------
  // AI generation endpoints — the server-side home of what the monolith
  // ran in the browser with a NEXT_PUBLIC_ key.
  // -------------------------------------------------------------------

  /**
   * POST /api/gemini/generate-itinerary — generate just the day-by-day
   * itinerary. Called by the plan flow (web page rewires here in T2.3).
   * Body: GenerateItineraryRequestSchema ({ form }). Responds
   * GenerateTextResponseSchema ({ text }); text is null when Gemini failed.
   */
  router.post(
    "/generate-itinerary",
    route(async (req, res) => {
      await requireAuth(req);
      const { form } = parseRequestBody(GenerateItineraryRequestSchema, req.body);
      const text = await generateAudited("itinerary", buildItineraryGeneration(form));
      res.json(GenerateTextResponseSchema.parse({ text }));
    })
  );

  /**
   * POST /api/gemini/generate-weather — generate just the per-day weather
   * forecast. Takes the same body as generate-itinerary (the prompt needs
   * destination + dates + group). Responds { text } like above.
   */
  router.post(
    "/generate-weather",
    route(async (req, res) => {
      await requireAuth(req);
      const { form } = parseRequestBody(GenerateItineraryRequestSchema, req.body);
      const text = await generateAudited("weather", buildWeatherGeneration(form));
      res.json(GenerateTextResponseSchema.parse({ text }));
    })
  );

  /**
   * POST /api/gemini/plan — the full plan facade: itinerary + weather +
   * flights in one response (the itinerary page's single call).
   * Body: PlanRequestSchema ({ form, flightSearchCriteria? }); flightDetails
   * is null when no criteria were given or Amadeus fails/unconfigured —
   * the plan itself is still returned.
   */
  router.post(
    "/plan",
    route(async (req, res) => {
      await requireAuth(req);
      const request = parseRequestBody(PlanRequestSchema, req.body);
      const facade = new ItineraryPlannerFacade(pool, requireGemini(), flightsService);
      const result = await facade.planItinerary(request.form, request.flightSearchCriteria);
      res.json(PlanResponseSchema.parse(result));
    })
  );

  /**
   * POST /api/gemini/hotels/search — AI hotel suggestions for a free-text
   * query (the hotel search bar; monolith: hooks/useHotels.ts).
   * Body: HotelsSearchRequestSchema ({ query }). Responds
   * HotelsSearchResponseSchema ({ hotels: Hotel[] }). Both the generation
   * and the search itself are audited in the gemini DB.
   */
  router.post(
    "/hotels/search",
    route(async (req, res) => {
      await requireAuth(req);
      const { query } = parseRequestBody(HotelsSearchRequestSchema, req.body);

      const startedAt = Date.now();
      const text = await generateAudited(
        "hotel-suggestion",
        buildHotelSearchGeneration(query)
      );
      const hotels = parseHotelSuggestions(text);
      await recordHotelSearch(pool, query, hotels.length);
      logger.debug({ query, resultCount: hotels.length, durationMs: Date.now() - startedAt }, "hotel search complete");

      res.json(HotelsSearchResponseSchema.parse({ hotels }));
    })
  );

  /**
   * Validate Gemini's hotel array entry-by-entry with the shared HotelDto
   * schema, silently dropping rows the model hallucinated half of. A null
   * generation (failed call, already logged) means no suggestions.
   */
  function parseHotelSuggestions(text: string | null): HotelDto[] {
    if (text === null) return [];
    let candidates: unknown;
    try {
      candidates = JSON.parse(text);
    } catch (error) {
      logger.warn({ err: error }, "hotel suggestion text was not valid JSON");
      return [];
    }
    if (!Array.isArray(candidates)) return [];
    return candidates.filter(
      (hotel): hotel is HotelDto => HotelDtoSchema.safeParse(hotel).success
    );
  }

  /**
   * POST /api/gemini/flights/search — real flight offers from Amadeus.
   * Body: FlightsSearchRequestSchema ({ criteria }). Responds
   * FlightsSearchResponseSchema ({ flights: FlightDisplayDetails[] }).
   * Upstream failures become 502 — the client's own request was valid.
   */
  router.post(
    "/flights/search",
    route(async (req, res) => {
      await requireAuth(req);
      const { criteria } = parseRequestBody(FlightsSearchRequestSchema, req.body);
      if (!flightsService) {
        throw new ApiError(503, "Flight search unavailable: AMADEUS_API_KEY is not configured on the server");
      }
      try {
        const flights = await flightsService.searchFlights(criteria);
        res.json(FlightsSearchResponseSchema.parse({ flights }));
      } catch (error) {
        logger.error({ err: error }, "Amadeus flight search failed");
        throw new ApiError(502, `Flight search failed: ${(error as Error).message}`);
      }
    })
  );

  // -------------------------------------------------------------------
  // Reference data for the plan-itinerary form (port of the monolith's
  // /api/common?type=... route + strategy classes).
  // -------------------------------------------------------------------

  /**
   * Run the strategy pattern for one reference type (same wiring as the
   * monolith's CommonService.fetchDataStrategy). A null result means the
   * fetch failed (logged inside BaseFetchStrategy) → 502.
   */
  async function fetchReference(factoryType: FactoryType, label: string): Promise<unknown[]> {
    // The first constructor argument is a throwaway default that setStrategy
    // immediately replaces — kept identical to the monolith's CommonService.
    const dataFetcher = new BaseFetchStrategy(
      new TravelTypeFetchStrategy(pool),
      new FetchStrategyFactory(pool)
    );
    dataFetcher.setStrategy(factoryType);
    const items = await dataFetcher.fetchData<unknown[]>();
    if (items === null) {
      throw new ApiError(502, `Reference data (${label}) is currently unavailable`);
    }
    return items;
  }

  /**
   * GET /api/gemini/reference/countries — countries with their hub airport
   * code (the form uses it to build flight-search criteria). Responds
   * ReferenceResponseSchema ({ items: Country[] }).
   */
  router.get(
    "/reference/countries",
    route(async (req, res) => {
      await requireAuth(req);
      const items = await fetchReference(FactoryType.COUNTRY, "countries");
      res.json(ReferenceResponseSchema.parse({ items }));
    })
  );

  /**
   * GET /api/gemini/reference/travel-types — the "who is travelling" select
   * options (solo / couple / family / ...). Responds ReferenceResponseSchema
   * ({ items: TravelType[] }).
   */
  router.get(
    "/reference/travel-types",
    route(async (req, res) => {
      await requireAuth(req);
      const items = await fetchReference(FactoryType.TRAVEL, "travel-types");
      res.json(ReferenceResponseSchema.parse({ items }));
    })
  );

  return router;
}
