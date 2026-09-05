import {
  ApiError,
  GetItineraryResponse,
  GetItineraryResponseSchema,
  createLogger,
  env,
} from "@smart/shared";

/**
 * Internal HTTP client for the itinerary-service (task contract: the PDF
 * export and the read-only share view both need the full itinerary
 * aggregate, which lives in *another* service's database — database-per-
 * service means tools-service fetches it over HTTP instead of joining
 * across schemas).
 *
 * The caller's own Authorization/cookie headers are forwarded, so the
 * itinerary-service's requireClaims check sees the same authenticated user —
 * no service-to-service credentials exist in this architecture yet.
 *
 * Env: ITINERARY_SERVICE_URL (compose: http://itinerary-service:8082).
 */

const logger = createLogger("tools-service.itinerary-client");

/** Fail fast when the itinerary-service hangs instead of pinning the request. */
const FETCH_TIMEOUT_MS = 10_000;

export type ItineraryClient = (
  itineraryId: string,
  auth: { authorization?: string | undefined; cookie?: string | undefined }
) => Promise<GetItineraryResponse>;

export function createItineraryClient(baseUrlOverride?: string): ItineraryClient {
  const baseUrl = baseUrlOverride ?? env("ITINERARY_SERVICE_URL", "http://localhost:8082");

  return async function fetchItinerary(itineraryId, auth) {
    const headers: Record<string, string> = {};
    if (auth.authorization) headers.authorization = auth.authorization;
    if (auth.cookie) headers.cookie = auth.cookie;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/itineraries/${itineraryId}`, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      logger.error({ err: error, itineraryId, baseUrl }, "itinerary-service unreachable");
      throw ApiError.upstream(0, `itinerary-service is unreachable for itinerary ${itineraryId}`);
    }

    if (response.status === 404) {
      throw ApiError.notFound(`Itinerary ${itineraryId} not found`);
    }
    if (!response.ok) {
      throw ApiError.upstream(
        response.status,
        `itinerary-service returned ${response.status} for itinerary ${itineraryId}`
      );
    }

    // Validate the payload against the shared contract — the PDF renderer and
    // share view below depend on this shape, so a surprise 500s here rather
    // than producing a broken PDF.
    const parsed = GetItineraryResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      logger.error(
        { issues: parsed.error.issues, itineraryId },
        "itinerary-service returned an unexpected payload shape"
      );
      throw ApiError.upstream(502, `itinerary-service returned a malformed itinerary ${itineraryId}`);
    }
    return parsed.data;
  };
}
