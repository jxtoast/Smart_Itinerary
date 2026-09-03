import { ItineraryProps } from "./ItineraryProps";
import { GeminiConfigBuilder } from "@/services/GeminiConfigBuilder";

function GenerateWeatherConfig(itinerary: ItineraryProps) {

  const prompt = `  Generate a weather forecast for ${itinerary.destination} from ${itinerary.startDate} to ${itinerary.endDate}. 
                    The forecast should include the temperature, and a description of the weather condition for each day. The weather conditions should include one of the following descriptions: clear sky, few clouds, scattered clouds, broken clouds, shower rain, rain, thunderstorm, snow, or mist. 
                    Ensure the forecast is based on typical weather patterns for this time of year in the specified location.
                    Ensure that the forecast has only one forecast for each day.
                    The forecast should be in JSON format.
                  `;


  const generationConfig = new GeminiConfigBuilder()
    .withTemperature(0.5)
    .withTopP(0.95)
    .withTopK(30)
    .withMaxOutputTokens(4096)
    .withResponseMimeType("application/json")
    .build();

  return { prompt, generationConfig };
}

export default GenerateWeatherConfig;
