import { FlightSearchCriteriaBuilder } from "@/services/FlightSearchCriteriaBuilder";
import { FlightsService } from "@/services/FlightsService";
import { FlightSearchCriteria } from "@/types/Flight";
import { FlightSegmentDisplay, FlightDisplayDetails, FlightStop} from "@/types/FlightDisplayDetails";


describe('Get Flights Test', () => {
  let generationSearchCriteria: FlightSearchCriteria
  let flightDetails: Promise<FlightDisplayDetails[]>
  const mockFlightResponse = {
      "meta": {
          "count": 1,
          "links": {
              "self": "https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=SYD&destinationLocationCode=GRU&departureDate=2025-05-15&returnDate=2025-05-29&adults=2&max=1"
          }
      },
      "data": [
          {
              "type": "flight-offer",
              "id": "1",
              "source": "GDS",
              "instantTicketingRequired": false,
              "nonHomogeneous": false,
              "oneWay": false,
              "isUpsellOffer": false,
              "lastTicketingDate": "2025-05-04",
              "lastTicketingDateTime": "2025-05-04",
              "numberOfBookableSeats": 5,
              "itineraries": [
                  {
                      "duration": "PT34H40M",
                      "segments": [
                          {
                              "departure": {
                                  "iataCode": "SYD",
                                  "terminal": "1",
                                  "at": "2025-05-15T09:30:00"
                              },
                              "arrival": {
                                  "iataCode": "LAX",
                                  "terminal": "B",
                                  "at": "2025-05-15T06:05:00"
                              },
                              "carrierCode": "UA",
                              "number": "842",
                              "aircraft": {
                                  "code": "789"
                              },
                              "operating": {
                                  "carrierCode": "UA"
                              },
                              "duration": "PT13H35M",
                              "id": "1",
                              "numberOfStops": 0,
                              "blacklistedInEU": false
                          },
                          {
                              "departure": {
                                  "iataCode": "LAX",
                                  "terminal": "7",
                                  "at": "2025-05-15T08:25:00"
                              },
                              "arrival": {
                                  "iataCode": "EWR",
                                  "terminal": "C",
                                  "at": "2025-05-15T16:45:00"
                              },
                              "carrierCode": "UA",
                              "number": "2096",
                              "aircraft": {
                                  "code": "777"
                              },
                              "operating": {
                                  "carrierCode": "UA"
                              },
                              "duration": "PT5H20M",
                              "id": "2",
                              "numberOfStops": 0,
                              "blacklistedInEU": false
                          },
                          {
                              "departure": {
                                  "iataCode": "EWR",
                                  "terminal": "C",
                                  "at": "2025-05-15T20:35:00"
                              },
                              "arrival": {
                                  "iataCode": "GRU",
                                  "terminal": "3",
                                  "at": "2025-05-16T07:10:00"
                              },
                              "carrierCode": "UA",
                              "number": "149",
                              "aircraft": {
                                  "code": "777"
                              },
                              "operating": {
                                  "carrierCode": "UA"
                              },
                              "duration": "PT9H35M",
                              "id": "3",
                              "numberOfStops": 0,
                              "blacklistedInEU": false
                          }
                      ]
                  },
                  {
                      "duration": "PT43H40M",
                      "segments": [
                          {
                              "departure": {
                                  "iataCode": "GRU",
                                  "terminal": "3",
                                  "at": "2025-05-29T22:20:00"
                              },
                              "arrival": {
                                  "iataCode": "ORD",
                                  "terminal": "5",
                                  "at": "2025-05-30T06:45:00"
                              },
                              "carrierCode": "UA",
                              "number": "844",
                              "aircraft": {
                                  "code": "781"
                              },
                              "operating": {
                                  "carrierCode": "UA"
                              },
                              "duration": "PT10H25M",
                              "id": "4",
                              "numberOfStops": 0,
                              "blacklistedInEU": false
                          },
                          {
                              "departure": {
                                  "iataCode": "ORD",
                                  "terminal": "1",
                                  "at": "2025-05-30T13:55:00"
                              },
                              "arrival": {
                                  "iataCode": "LAX",
                                  "terminal": "7",
                                  "at": "2025-05-30T16:26:00"
                              },
                              "carrierCode": "UA",
                              "number": "378",
                              "aircraft": {
                                  "code": "32Q"
                              },
                              "operating": {
                                  "carrierCode": "UA"
                              },
                              "duration": "PT4H31M",
                              "id": "5",
                              "numberOfStops": 0,
                              "blacklistedInEU": false
                          },
                          {
                              "departure": {
                                  "iataCode": "LAX",
                                  "terminal": "7",
                                  "at": "2025-05-30T22:50:00"
                              },
                              "arrival": {
                                  "iataCode": "SYD",
                                  "terminal": "1",
                                  "at": "2025-06-01T07:00:00"
                              },
                              "carrierCode": "UA",
                              "number": "839",
                              "aircraft": {
                                  "code": "789"
                              },
                              "operating": {
                                  "carrierCode": "UA"
                              },
                              "duration": "PT15H10M",
                              "id": "6",
                              "numberOfStops": 0,
                              "blacklistedInEU": false
                          }
                      ]
                  }
              ],
              "price": {
                  "currency": "EUR",
                  "total": "3263.62",
                  "base": "1924.00",
                  "fees": [
                      {
                          "amount": "0.00",
                          "type": "SUPPLIER"
                      },
                      {
                          "amount": "0.00",
                          "type": "TICKETING"
                      }
                  ],
                  "grandTotal": "3263.62"
              },
              "pricingOptions": {
                  "fareType": [
                      "PUBLISHED"
                  ],
                  "includedCheckedBagsOnly": true
              },
              "validatingAirlineCodes": [
                  "UA"
              ],
              "travelerPricings": [
                  {
                      "travelerId": "1",
                      "fareOption": "STANDARD",
                      "travelerType": "ADULT",
                      "price": {
                          "currency": "EUR",
                          "total": "1631.81",
                          "base": "962.00"
                      },
                      "fareDetailsBySegment": [
                          {
                              "segmentId": "1",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          },
                          {
                              "segmentId": "2",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          },
                          {
                              "segmentId": "3",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          },
                          {
                              "segmentId": "4",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          },
                          {
                              "segmentId": "5",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          },
                          {
                              "segmentId": "6",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          }
                      ]
                  },
                  {
                      "travelerId": "2",
                      "fareOption": "STANDARD",
                      "travelerType": "ADULT",
                      "price": {
                          "currency": "EUR",
                          "total": "1631.81",
                          "base": "962.00"
                      },
                      "fareDetailsBySegment": [
                          {
                              "segmentId": "1",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          },
                          {
                              "segmentId": "2",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          },
                          {
                              "segmentId": "3",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          },
                          {
                              "segmentId": "4",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          },
                          {
                              "segmentId": "5",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          },
                          {
                              "segmentId": "6",
                              "cabin": "ECONOMY",
                              "fareBasis": "GLE72SAG",
                              "brandedFare": "ECONOMY",
                              "brandedFareLabel": "ECONOMY",
                              "class": "G",
                              "includedCheckedBags": {
                                  "quantity": 2
                              },
                              "includedCabinBags": {
                                  "quantity": 1
                              },
                              "amenities": [
                                  {
                                      "description": "PRE RESERVED SEAT ASSIGNMENT",
                                      "isChargeable": false,
                                      "amenityType": "PRE_RESERVED_SEAT",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PRIORITY BOARDING",
                                      "isChargeable": true,
                                      "amenityType": "TRAVEL_SERVICES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "MILEAGE ACCRUAL",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "UPGRADE ELIGIBILITY",
                                      "isChargeable": true,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "CHANGEABLE TICKET",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  },
                                  {
                                      "description": "PREMIUM QUALIFYING CREDIT",
                                      "isChargeable": false,
                                      "amenityType": "BRANDED_FARES",
                                      "amenityProvider": {
                                          "name": "BrandedFare"
                                      }
                                  }
                              ]
                          }
                      ]
                  }
              ]
          }
      ],
      "dictionaries": {
          "locations": {
              "ORD": {
                  "cityCode": "CHI",
                  "countryCode": "US"
              },
              "EWR": {
                  "cityCode": "NYC",
                  "countryCode": "US"
              },
              "LAX": {
                  "cityCode": "LAX",
                  "countryCode": "US"
              },
              "GRU": {
                  "cityCode": "SAO",
                  "countryCode": "BR"
              },
              "SYD": {
                  "cityCode": "SYD",
                  "countryCode": "AU"
              }
          },
          "aircraft": {
              "781": "BOEING 787-10",
              "32Q": "AIRBUS A321NEO",
              "777": "BOEING 777-200/300",
              "789": "BOEING 787-9"
          },
          "currencies": {
              "EUR": "EURO"
          },
          "carriers": {
              "UA": "UNITED AIRLINES"
          }
      }
  };
  const flightService = new FlightsService()
  before(() => {
    
    

    cy.fixture('flights').then((data) => {
      const criteria = data.criteria
      const mockResponse = data.mockResponse
      cy.intercept('GET', '**/shopping/flight-offers*', {
        statusCode: 200,
        body: mockResponse      
      });

      generationSearchCriteria = new FlightSearchCriteriaBuilder()
      .withOriginCountry(criteria.originLocationCode)
      .withDestinationCountry(criteria.destinationLocationCode)
      .withDepartureDate(criteria.departureDate)
      .withReturnDate(criteria.returnDate)
      .withPax(criteria.adults)
      .withNumberOfResults(criteria.max)
      .build();
    });

  });

  it('should fetch flights data given a set of search criterias', () => {
      // Using cy.wrap to handle the Promise
      return cy.wrap(flightService.searchFlights(generationSearchCriteria)).then((flightDetails) => {
        expect(flightDetails).to.not.be.empty;
        cy.wrap(flightDetails).its('length').should('eq',1)
      });
  });
})