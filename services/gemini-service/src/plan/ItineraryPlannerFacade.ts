import type { Pool } from "pg";
import {
  FlightDisplayDetails,
  FlightSearchCriteria,
  Itinerary,
  PlanForm,
  WeatherForecast,
  createLogger,
} from "@smart/shared/src/server";
import { GeminiService, parseGeminiJson } from "../gemini/GeminiService";
import { buildItineraryGeneration, buildWeatherGeneration } from "../gemini/prompts";
import { FlightsService } from "../flights/FlightsService";
import { runAuditedGeneration } from "../repositories/auditRepository";

/**
 * Facade for the whole "generate my trip" flow (moved from the monolith's
 * apps/web/services/ItineraryPlannerFacade.ts).
 *
 * One call produces the three artifacts the itinerary page renders:
 *   itineraryData — day-by-day plan from Gemini (ItinerarySchema shape)
 *   weatherData   — per-day forecast from Gemini
 *   flightDetails — real flight offers from Amadeus
 *
 * Each artifact is independent: a failed flight search still returns a plan.
 * The web calls this through POST /api/gemini/plan (T2.3 rewires the page;
 * today the page still runs the monolith copy in the browser).
 */

const logger = createLogger("gemini-service");

export interface PlanResult {
  itineraryData: Itinerary | null;
  /** One forecast object, or an array of them — exactly what Gemini returns. */
  weatherData: WeatherForecast | WeatherForecast[] | null;
  flightDetails: FlightDisplayDetails[] | null;
}

export class ItineraryPlannerFacade {
  private geminiService: GeminiService;
  private flightService: FlightsService | null;
  /** Auditing needs the pool — both generations below leave a DB row. */
  private pool: Pool;

  constructor(
    pool: Pool,
    geminiService: GeminiService,
    flightService: FlightsService | null = null
  ) {
    this.pool = pool;
    this.geminiService = geminiService;
    this.flightService = flightService;
  }

  public async planItinerary(
    form: PlanForm,
    flightSearchCriteria?: FlightSearchCriteria
  ): Promise<PlanResult> {
    // Gemini first: the two AI generations are sequential (as in the
    // monolith) because they share the model client and stay under the
    // per-key rate limit. The free tier allows ~5 requests/minute, and
    // firing both at once trips it immediately (429 on every call —
    // reproduced live); running them back-to-back spaces them by a whole
    // generation (~25s), which is what usually keeps the second one under
    // the quota window. runAuditedGeneration records each call.
    // UPGRADE PATH: on a paid-tier key (hundreds of requests/minute) the
    // quota concern disappears — switch these two awaits to a single
    // Promise.all to halve the user-facing wait. Nothing else changes:
    // both generations are independent and audited identically.
    const itineraryResults = await runAuditedGeneration(
      this.pool,
      this.geminiService,
      "itinerary",
      buildItineraryGeneration(form)
    );
    const weatherResults = await runAuditedGeneration(
      this.pool,
      this.geminiService,
      "weather",
      buildWeatherGeneration(form)
    );

    const itineraryData = parseGeminiJson<Itinerary>(itineraryResults);
    const weatherData = parseGeminiJson<WeatherForecast | WeatherForecast[]>(weatherResults);

    // Flight details come from Amadeus, whose offers are only valid ~30min —
    // any failure here is logged and the plan is returned without flights
    // rather than failing the whole request.
    let flightDetails: FlightDisplayDetails[] | null = null;
    try {
      if (this.flightService && flightSearchCriteria) {
        flightDetails = await this.flightService.searchFlights(flightSearchCriteria);
      }
    } catch (error) {
      logger.error({ err: error }, "Error fetching flight details — returning the plan without flights");
    }

    return { itineraryData, weatherData, flightDetails };
  }
}
