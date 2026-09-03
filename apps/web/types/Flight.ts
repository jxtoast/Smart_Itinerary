export type FlightSearchCriteria = {
  origin_country?: string;
  destination_country?: string;
  departure_date?: string; //YYYY-MM-DD, maybe need a layer to convert to proper format
  return_date?: string; //YYYY-MM-DD, maybe need a layer to convert to proper format
  pax?: number;
  number_of_results?: number;
}

// Dictionary Types
export interface Location {
  cityCode: string;
  countryCode: string;
}

export interface Locations {
  [iataCode: string]: Location;
}

export interface Aircraft {
  [code: string]: string;
}

export interface Currencies {
  [code: string]: string;
}

export interface Carriers {
  [code: string]: string;
}

export interface Dictionaries {
  locations: Locations;
  aircraft: Aircraft;
  currencies: Currencies;
  carriers: Carriers;
}

// Price Related Types
export interface Fee {
  amount: string;
  type: string;
}

export interface AdditionalService {
  amount: string;
  type: string;
}

export interface Price {
  currency: string;
  total: string;
  base: string;
  fees: Fee[];
  grandTotal: string;
  additionalServices?: AdditionalService[];
}

// Flight Segment Types
export interface FlightEndPoint {
  iataCode: string;
  at: string;
}

export interface AircraftInfo {
  code: string;
}

export interface Operating {
  carrierCode: string;
}

export interface Segment {
  departure: FlightEndPoint;
  arrival: FlightEndPoint;
  carrierCode: string;
  number: string;
  aircraft: AircraftInfo;
  operating: Operating;
  duration: string;
  id: string;
  numberOfStops: number;
  blacklistedInEU: boolean;
}

export interface Itinerary {
  duration: string;
  segments: Segment[];
}

// Traveler Pricing Types
export interface IncludedCheckedBags {
  quantity: number;
}

export interface FareDetailsBySegment {
  segmentId: string;
  cabin: string;
  fareBasis: string;
  class: string;
  includedCheckedBags: IncludedCheckedBags;
}

export interface TravelerPricing {
  travelerId: string;
  fareOption: string;
  travelerType: string;
  price: Price;
  fareDetailsBySegment: FareDetailsBySegment[];
}

// Flight Offer Type
export interface FlightOffer {
  type: string;
  id: string;
  source: string;
  instantTicketingRequired: boolean;
  nonHomogeneous: boolean;
  oneWay: boolean;
  isUpsellOffer: boolean;
  lastTicketingDate: string;
  lastTicketingDateTime: string;
  numberOfBookableSeats: number;
  itineraries: Itinerary[];
  price: Price;
  pricingOptions: {
    fareType: string[];
    includedCheckedBagsOnly: boolean;
  };
  validatingAirlineCodes: string[];
  travelerPricings: TravelerPricing[];
}

// Meta Information
export interface Meta {
  count: number;
  links: {
    self: string;
  };
}

// Main Response Type
export interface FlightSearchResponse {
  meta: Meta;
  data: FlightOffer[];
  dictionaries: Dictionaries;
}