/**
 * @smart/shared — contracts and adapters for the Smart Itinerary platform.
 *
 * NOTE: `types/Flight` also exports an `Itinerary` interface (a flight-offer
 * itinerary: duration + segments) which collides with the trip `Itinerary` in
 * `types/Itinerary`. It is therefore excluded from the star re-export below —
 * import it via `@smart/shared/src/types/Flight` when needed.
 */

export * from "./types/Country";
export * from "./types/FactoryType";
export {
  FlightSearchCriteria,
  FlightEndPoint,
  FlightOffer,
  FlightSearchResponse,
  Aircraft,
  Carriers,
  Currencies,
  Dictionaries,
  Fee,
  FareDetailsBySegment,
  IncludedCheckedBags,
  Location,
  Locations,
  Meta,
  Operating,
  Price,
  Segment,
  TravelerPricing,
} from "./types/Flight";
export * from "./types/FlightDisplayDetails";
export * from "./types/GeminiConfig";
export * from "./types/Hotel";
export * from "./types/IBaseFetchStrategy";
export * from "./types/IFetchStrategyFactory";
export * from "./types/Itinerary";
export * from "./types/ItineraryAccommodation";
export * from "./types/ItineraryActivity";
export * from "./types/ItineraryDay";
export * from "./types/ItineraryDemographics";
export * from "./types/TravelType";
export * from "./types/User";
export * from "./types/UserDemographics";
export * from "./types/WeatherForecast";

export * from "./dto/auth";
export * from "./dto/gemini";
export * from "./dto/itineraries";
export * from "./dto/tools";

export * from "./events";

export * from "./adapters/config";
export * from "./adapters/db";
export * from "./adapters/storage";
export * from "./adapters/mailer";
export * from "./adapters/broker";
export * from "./adapters/jwt";
export * from "./adapters/http";
