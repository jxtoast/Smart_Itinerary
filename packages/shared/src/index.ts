/**
 * @smart/shared — the BROWSER-SAFE contracts barrel.
 *
 * Types, zod DTOs and event schemas only: browser code (apps/web,
 * @smart/api-client) may import this barrel directly. The infrastructure
 * adapters (db/storage/mailer/broker/jwt/http) are deliberately NOT
 * re-exported here — they bind Node-only transports (`pg` opens sockets,
 * `amqplib` imports `net`, `nodemailer` imports `tls`, the AWS SDK imports
 * `fs`), and a browser bundle pulling any of them in fails to build with
 * "Module not found: Can't resolve 'net'".
 *
 * Node processes (the gateway and the five services, plus Next server
 * routes) import `@smart/shared/src/server` instead: the same names plus
 * every adapter.
 *
 * NOTE: `types/Flight` also exports an `Itinerary` interface (a flight-offer
 * itinerary: duration + segments) which collides with the trip `Itinerary` in
 * `types/Itinerary`. It is therefore excluded from the star re-export below —
 * import it via `@smart/shared/src/types/Flight` when needed.
 */

export * from "./types/Country";
export * from "./types/FactoryType";
export type {
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

