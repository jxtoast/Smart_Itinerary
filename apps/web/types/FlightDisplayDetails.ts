// types/flightDisplay.ts

export interface FlightStop {
    airport: string;
    cityCode: string;
    countryCode: string;
    datetime: string;
  }
  
  export interface FlightSegmentDisplay {
    departureInfo: FlightStop;
    arrivalInfo: FlightStop;
    duration: string;
    flightNumber: string;
    airlineName: string;  // from dictionaries.carriers
    aircraftType: string; // from dictionaries.aircraft
    cabin: string;        // Economy, Business, etc.
    numberOfStops: number;
  }
  
  export interface FlightDisplayDetails {
    // Basic Identification
    id: string;
    
    // Price Information
    price: {
      amount: string;
      currency: string;
      pricePerAdult: string;
      includedBags: number;
    };
  
    // Outbound Journey
    outbound: {
      segments: FlightSegmentDisplay[];
      totalDuration: string;
      totalStops: number;
    };
  
    // Return Journey (if round trip)
    return?: {
      segments: FlightSegmentDisplay[];
      totalDuration: string;
      totalStops: number;
    };
  
    // Additional Important Information
    numberOfPassengers: number;
    cabinClass: string;
    seatsAvailable: number;
    refundable?: boolean;
    lastTicketingDate: string;
  }