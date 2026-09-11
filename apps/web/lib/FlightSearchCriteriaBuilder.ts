/**
 * Builds the flight-search half of a gemini-service /plan payload
 * (diagram: "Clients — Web" → "API Gateway" → "Gemini Service").
 *
 * The only survivor of the web app's former services/ layer — it does no
 * I/O, it just assembles the snake_case Amadeus criteria the gateway-gated
 * plan facade forwards to the flight search (apps/web/app/(itinerary)/
 * itinerary/page.tsx is the caller). The flight search itself runs
 * server-side in gemini-service; the browser holds no Amadeus key.
 */
import { FlightSearchCriteria } from "@/types/Flight";

export class FlightSearchCriteriaBuilder {
  private config: FlightSearchCriteria = {};

  public withOriginCountry(originCountry: string): this {
    this.config.origin_country = originCountry;
    return this;
  }

  public withDestinationCountry(destinationCountry: string): this {
    this.config.destination_country = destinationCountry;
    return this;
  }

  public withDepartureDate(departureDate: string): this {
    this.config.departure_date = departureDate;
    return this;
  }

  public withReturnDate(returnDate: string): this {
    this.config.return_date = returnDate;
    return this;
  }

  public withPax(pax: number): this {
    this.config.pax = pax;
    return this;
  }

  public withNumberOfResults(numberOfResults: number): this {
    this.config.number_of_results = numberOfResults;
    return this;
  }

  public build(): FlightSearchCriteria {
    return this.config;
  }
}
