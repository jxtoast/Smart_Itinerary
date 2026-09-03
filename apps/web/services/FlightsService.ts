import { FlightSearchCriteria, FlightSearchResponse, Itinerary, FlightEndPoint } from "@/types/Flight";
import { FlightSegmentDisplay, FlightDisplayDetails, FlightStop} from "@/types/FlightDisplayDetails";
import axios, { AxiosInstance } from 'axios';

export class FlightsService {
  private readonly axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: process.env.NEXT_PUBLIC_AMADEUS_FLIGHTS_API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_AMADEUS_API_KEY}`
      }
    });
  }

  async searchFlights(criteria: FlightSearchCriteria): Promise<FlightDisplayDetails[]> {
    try {
      // console.log("Fetching Flights")
      const response = await this.axiosInstance.get<FlightSearchResponse>(
        '/shopping/flight-offers',
        {
          params: {
            originLocationCode: criteria.origin_country,
            destinationLocationCode: criteria.destination_country,
            departureDate: criteria.departure_date,
            ...(criteria.return_date && { returnDate: criteria.return_date }),
            adults: criteria.pax,
            ...(criteria.number_of_results && { max: criteria.number_of_results })
          }
        }
      );

      // Logic to unpack FlightSearchResponse into FlightDisplayDetails
      return this.transformFlightResponse(response.data);

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API Error: ${error.response?.data?.message || error.message}`);
      }
      throw new Error("Error fetching flight offers");
    }
  }

  private transformFlightResponse(response: FlightSearchResponse): FlightDisplayDetails[] {
    return response.data.map(offer => {
      console.log("transforming flight response")
      // Helper function to create FlightStop object
      const createFlightStop = (endpoint: FlightEndPoint): FlightStop => {
        const location = response.dictionaries.locations[endpoint.iataCode];
        return {
          airport: endpoint.iataCode,
          cityCode: location?.cityCode || '',
          countryCode: location?.countryCode || '',
          datetime: endpoint.at
        };
      };
  
      // Helper function to create FlightSegmentDisplay array
      const createFlightSegments = (itinerary: Itinerary): FlightSegmentDisplay[] => {
        return itinerary.segments.map(segment => {
          const cabinInfo = offer.travelerPricings[0].fareDetailsBySegment.find(
            fare => fare.segmentId === segment.id
          );
  
          return {
            departureInfo: createFlightStop(segment.departure),
            arrivalInfo: createFlightStop(segment.arrival),
            duration: segment.duration,
            flightNumber: `${segment.carrierCode}${segment.number}`,
            airlineName: response.dictionaries.carriers[segment.carrierCode] || segment.carrierCode,
            aircraftType: response.dictionaries.aircraft[segment.aircraft.code] || segment.aircraft.code,
            cabin: cabinInfo?.cabin || '',
            numberOfStops: segment.numberOfStops
          };
        });
      };
  
      // Calculate total stops for an itinerary
      const calculateTotalStops = (segments: FlightSegmentDisplay[]): number => {
        return segments.length-1;
      };
  
      const outboundSegments = createFlightSegments(offer.itineraries[0]);
      const returnSegments = offer.itineraries[1] ? createFlightSegments(offer.itineraries[1]) : undefined;
  
      const displayDetails: FlightDisplayDetails = {
        id: offer.id,
        price: {
          amount: offer.price.total,
          currency: offer.price.currency,
          pricePerAdult: offer.travelerPricings[0].price.total,
          includedBags: offer.travelerPricings[0].fareDetailsBySegment[0].includedCheckedBags.quantity
        },
        outbound: {
          segments: outboundSegments,
          totalDuration: offer.itineraries[0].duration,
          totalStops: calculateTotalStops(outboundSegments)
        },
        numberOfPassengers: offer.travelerPricings.length,
        cabinClass: offer.travelerPricings[0].fareDetailsBySegment[0].cabin,
        seatsAvailable: offer.numberOfBookableSeats,
        lastTicketingDate: offer.lastTicketingDate
      };
  
      // Add return journey if it exists
      if (returnSegments) {
        displayDetails.return = {
          segments: returnSegments,
          totalDuration: offer.itineraries[1].duration,
          totalStops: calculateTotalStops(returnSegments)
        };
      }
  
      return displayDetails;
    });
  }


}
