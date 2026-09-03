import { ItineraryService } from "@/services/ItineraryService"
import { WeatherForecast } from "@/types/WeatherForecast";
import { Itinerary } from "@/types/Itinerary";
import { GeminiService } from "@/services/GeminiService";
import { GeminiConfig } from "@/types/GeminiConfig";
import { GeminiConfigBuilder } from "@/services/GeminiConfigBuilder";

describe('Weather Forecast Test', () => {
  let userId: string;
  let itineraryTestData: Itinerary;
  let weatherForecastData: WeatherForecast;
  let savedItineraryId: string | null;
  let prompt: string;
  let generationConfig: GeminiConfig

  const geminiService = new GeminiService();

  before(() => {
    cy.fixture('test_user').then((userData) => {
      userId = userData.userId;
    });

    cy.fixture('itinerary').then((data) => {
      itineraryTestData = data.itineraryCreateData;

      prompt = `  Generate a weather forecast for ${itineraryTestData.destination} from ${itineraryTestData.startDate} to ${itineraryTestData.endDate}. 
                    The forecast should include the temperature, and a description of the weather condition for each day. The weather conditions should include one of the following descriptions: clear sky, few clouds, scattered clouds, broken clouds, shower rain, rain, thunderstorm, snow, or mist. 
                    Ensure the forecast is based on typical weather patterns for this time of year in the specified location.
                    Ensure that the forecast has only one forecast for each day.
                    The forecast should be in JSON format.
                  `;

      generationConfig = new GeminiConfigBuilder()
        .withTemperature(0.5)
        .withTopP(0.95)
        .withTopK(30)
        .withMaxOutputTokens(4096)
        .withResponseMimeType("application/json")
        .build();
    });

  });


  it('should fetch the weather forecast for the new itinerary', () => {
    cy.wrap(geminiService.generateContent(prompt, generationConfig), { timeout: 20000 }).then((responseText) => {
      const forecast = JSON.parse(String(responseText || 'null'));
      expect(forecast).to.exist;
      expect(Array.isArray(forecast)).to.be.true;
      expect(forecast.length).to.be.greaterThan(0);
      weatherForecastData = forecast;
    });
  });

  // Create itinerary and store its ID
  it('should create a new itinerary with the weather forecast and return the itinerary id ', () => {
    cy.wrap(ItineraryService.saveItinerary(userId, itineraryTestData, weatherForecastData), { timeout: 10000 }).then((returnedId) => {
      expect(returnedId).to.be.a('number');
      savedItineraryId = String(returnedId);
    });
  });


});