/**
 * Configuration for the gemini-service: env-var names and their defaults.
 *
 * Diagram component: "Gemini Service (Hotel Service)". All third-party keys
 * are SERVER-SIDE ONLY here — the monolith shipped its Gemini/Amadeus keys
 * to the browser as public env vars, which leaked them to every visitor;
 * after this service exists the web app never touches these keys again
 * (docs/TASKS.md hard constraint 7).
 *
 * A missing key never stops the service from booting: /healthz and the
 * reference endpoints keep working, and only the endpoints that need the
 * missing key answer 503 (see routes/geminiRoutes.ts).
 */

// --- Google Gemini (AI generation) -----------------------------------------
export const GEMINI_API_KEY_VAR = "GEMINI_API_KEY";
/** Model id can be pinned via env in case Google deprecates the default. */
export const GEMINI_MODEL_VAR = "GEMINI_MODEL";
// gemini-2.0-flash (the monolith's model) was retired by Google — the API's
// own 404 message recommends gemini-3.6-flash as the successor.
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

// --- Amadeus (flight search) ------------------------------------------------
export const AMADEUS_API_KEY_VAR = "AMADEUS_API_KEY";
export const AMADEUS_BASE_URL_VAR = "AMADEUS_FLIGHTS_API_BASE_URL";
/** Amadeus test host, same value the monolith carried in its root .env. */
export const DEFAULT_AMADEUS_BASE_URL = "https://test.api.amadeus.com/v2";
/** Path of the flight-offers search endpoint, appended to the base URL. */
export const FLIGHT_OFFERS_PATH = "/shopping/flight-offers";
