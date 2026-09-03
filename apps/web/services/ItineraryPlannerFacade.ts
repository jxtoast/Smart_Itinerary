import { FlightsService } from "./FlightsService";
import { GeminiService } from "./GeminiService";
import { Itinerary } from "@/types/Itinerary";
import { ItineraryProps } from "@/app/(itinerary)/itinerary/ItineraryProps";
import GenerateItineraryConfig from "@/app/(itinerary)/itinerary/GenerateItineraryConfig";
import GenerateWeatherConfig from "@/app/(itinerary)/itinerary/GenerateWeatherConfig";
import { WeatherForecast } from "@/types/WeatherForecast";
import { FlightSearchCriteria } from "@/types/Flight";
import { FlightDisplayDetails } from "@/types/FlightDisplayDetails";

export class ItineraryPlannerFacade {
    private geminiService: GeminiService;
    private flightService: FlightsService;

    constructor(
        geminiService: GeminiService = new GeminiService(),
        flightService: FlightsService = new FlightsService()
    ) {
        this.geminiService = geminiService;
        this.flightService = flightService;
    }

    public async planItinerary(
        itinerary: ItineraryProps,
        flightSearchCriteria: FlightSearchCriteria
    ): Promise<{
        itineraryData: Itinerary | null;
        weatherData: WeatherForecast | WeatherForecast[] | null;
        flightDetails: FlightDisplayDetails[] | null;
    }> {
        let itineraryData: Itinerary | null = null;
        let weatherData: WeatherForecast | WeatherForecast[] | null = null;
        let flightDetails: FlightDisplayDetails[] | null = null;

        const itineraryConfig = GenerateItineraryConfig(itinerary);
        const weatherConfig = GenerateWeatherConfig(itinerary);

        const itineraryResults = await this.geminiService.generateContent(itineraryConfig.prompt, itineraryConfig.generationConfig);
        const weatherResults = await this.geminiService.generateContent(weatherConfig.prompt, weatherConfig.generationConfig);

        if (itineraryResults) itineraryData = JSON.parse(itineraryResults);

        if (weatherResults) weatherData = JSON.parse(weatherResults);

        // Get Flight Details, additional checks due to API valid for 30mins only
        try {
            flightDetails = await this.flightService.searchFlights(flightSearchCriteria);
        } catch (error: any) {
            console.error("Error fetching flight details:", error);
            if (error.response && error.response.status === 401) {
                console.warn("Flight details retrieval failed due to authorization issue (401). Returning without flights.");
            }
        }

        return { itineraryData, weatherData, flightDetails };
    }
}