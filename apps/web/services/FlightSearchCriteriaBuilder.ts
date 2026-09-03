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
    // You might want to add date validation here
    this.config.departure_date = departureDate;
    return this;
  }

  public withReturnDate(returnDate: string): this {
    // You might want to add date validation here
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