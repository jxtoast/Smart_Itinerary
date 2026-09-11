import {
  FlightDisplayDetails,
  FlightEndPoint,
  FlightSearchCriteria,
  FlightSearchResponse,
  FlightSegmentDisplay,
  FlightStop,
  createLogger,
} from "@smart/shared/src/server";
// The flight-offer `Itinerary` (duration + segments) is excluded from the
// @smart/shared star export because it collides with the trip Itinerary —
// import it via its module path, aliased so the two never mix up.
import { Itinerary as FlightOfferItinerary } from "@smart/shared/src/types/Flight";
import { FLIGHT_OFFERS_PATH } from "../config";

/**
 * Amadeus flight search (moved from the monolith's
 * apps/web/services/FlightsService.ts — axios swapped for the built-in fetch,
 * and the API key moved from the browser bundle to this server-side env var;
 * docs/TASKS.md hard constraint 7).
 *
 * Calls GET <base>/shopping/flight-offers and unpacks the raw Amadeus
 * response into the flat FlightDisplayDetails[] the flight cards render.
 */

const logger = createLogger("gemini-service");

export class FlightsService {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  /**
   * Search flights for the given criteria. Throws an Error whose message
   * names Amadeus when the upstream call fails — ItineraryPlannerFacade turns
   * that into "no flight details" for /plan, the /flights/search route into
   * a 502.
   */
  async searchFlights(criteria: FlightSearchCriteria): Promise<FlightDisplayDetails[]> {
    // Amadeus ignores empty params, and the monolith's axios dropped
    // undefined ones — build the query string only from present fields.
    const params = new URLSearchParams();
    if (criteria.origin_country) params.set("originLocationCode", criteria.origin_country);
    if (criteria.destination_country) params.set("destinationLocationCode", criteria.destination_country);
    if (criteria.departure_date) params.set("departureDate", criteria.departure_date);
    if (criteria.return_date) params.set("returnDate", criteria.return_date);
    if (criteria.pax !== undefined) params.set("adults", String(criteria.pax));
    if (criteria.number_of_results !== undefined) params.set("max", String(criteria.number_of_results));

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${FLIGHT_OFFERS_PATH}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
    } catch (error) {
      throw new Error(`Amadeus flight search is unreachable: ${(error as Error).message}`);
    }

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body: body.slice(0, 500) },
        "Amadeus flight search failed"
      );
      throw new Error(`Amadeus flight search failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as FlightSearchResponse;
    return this.transformFlightResponse(data);
  }

  /**
   * Unpack Amadeus' nested flight-offers payload into one
   * FlightDisplayDetails per offer (segment lists, dictionaries lookups,
   * per-adult price). Ported verbatim from the monolith.
   */
  private transformFlightResponse(response: FlightSearchResponse): FlightDisplayDetails[] {
    return response.data.map((offer) => {
      // Helper function to create FlightStop object
      const createFlightStop = (endpoint: FlightEndPoint): FlightStop => {
        const location = response.dictionaries.locations[endpoint.iataCode];
        return {
          airport: endpoint.iataCode,
          cityCode: location?.cityCode || "",
          countryCode: location?.countryCode || "",
          datetime: endpoint.at,
        };
      };

      // Helper function to create FlightSegmentDisplay array
      const createFlightSegments = (itinerary: FlightOfferItinerary): FlightSegmentDisplay[] => {
        return itinerary.segments.map((segment) => {
          const cabinInfo = offer.travelerPricings[0].fareDetailsBySegment.find(
            (fare) => fare.segmentId === segment.id
          );

          return {
            departureInfo: createFlightStop(segment.departure),
            arrivalInfo: createFlightStop(segment.arrival),
            duration: segment.duration,
            flightNumber: `${segment.carrierCode}${segment.number}`,
            airlineName: response.dictionaries.carriers[segment.carrierCode] || segment.carrierCode,
            aircraftType: response.dictionaries.aircraft[segment.aircraft.code] || segment.aircraft.code,
            cabin: cabinInfo?.cabin || "",
            numberOfStops: segment.numberOfStops,
          };
        });
      };

      // Calculate total stops for an itinerary
      const calculateTotalStops = (segments: FlightSegmentDisplay[]): number => {
        return segments.length - 1;
      };

      const outboundSegments = createFlightSegments(offer.itineraries[0]);
      const returnSegments = offer.itineraries[1] ? createFlightSegments(offer.itineraries[1]) : undefined;

      const displayDetails: FlightDisplayDetails = {
        id: offer.id,
        price: {
          amount: offer.price.total,
          currency: offer.price.currency,
          pricePerAdult: offer.travelerPricings[0].price.total,
          includedBags: offer.travelerPricings[0].fareDetailsBySegment[0].includedCheckedBags.quantity,
        },
        outbound: {
          segments: outboundSegments,
          totalDuration: offer.itineraries[0].duration,
          totalStops: calculateTotalStops(outboundSegments),
        },
        numberOfPassengers: offer.travelerPricings.length,
        cabinClass: offer.travelerPricings[0].fareDetailsBySegment[0].cabin,
        seatsAvailable: offer.numberOfBookableSeats,
        lastTicketingDate: offer.lastTicketingDate,
      };

      // Add return journey if it exists
      if (returnSegments) {
        displayDetails.return = {
          segments: returnSegments,
          totalDuration: offer.itineraries[1].duration,
          totalStops: calculateTotalStops(returnSegments),
        };
      }

      return displayDetails;
    });
  }
}
