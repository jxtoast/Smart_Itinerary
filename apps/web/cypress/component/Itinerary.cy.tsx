import { ItineraryService } from "@/services/ItineraryService"
import { WeatherForecast } from "@/types/WeatherForecast";
import { Itinerary } from "@/types/Itinerary";

describe('Itinerary', () => {
  let userId: string;
  let fakeId: string;
  let itineraryId: string;
  let itineraryTestData: Itinerary;
  let weatherForecastData: WeatherForecast;
  let savedItineraryId: string | null;

  before(() => {
    cy.fixture('test_user').then((userData) => {
      userId = userData.userId
      fakeId = userData.fakeId
    });
    cy.fixture('itinerary').then((data) => {
      itineraryTestData = data.itineraryCreateData
      weatherForecastData = data.weatherForecast
      itineraryId = data.itineraryId
    });
  });


  it('should create a new itinerary and return the itinerary id ', () => {
    cy.wrap(ItineraryService.saveItinerary(userId, itineraryTestData, weatherForecastData)).then((returnedId) => {
      expect(returnedId).to.be.a('number');
      savedItineraryId = String(returnedId);
    });
  });

  it('should get the itinerary that is just created and the id should be valid', () => {
    if (savedItineraryId != null) {
      cy.wrap(ItineraryService.getItinerary(savedItineraryId)).then((itinerary) => {
        expect(itinerary).to.exist;
        expect(itinerary).to.not.be.null;
        const testItinerary = itinerary as Itinerary;
        expect(String(testItinerary.id)).to.equal(savedItineraryId);
      });
    }
  });

  it('should delete the itinerary that is just created', () => {
    if (savedItineraryId != null) {
      cy.wait(2000).then(() => {
        cy.wrap(ItineraryService.deleteItinerary(savedItineraryId as string)).then((itinerary) => {
          expect(itinerary).to.equal("Itinerary deleted successfully")
          cy.wrap(ItineraryService.checkItineraryExists(savedItineraryId as string)).should('be.false');
        });
      });
    }
  });

  it('should not get any data for the itinerary that is just deleted', () => {
    if (savedItineraryId != null) {
      cy.wrap(ItineraryService.getItinerary(savedItineraryId)).then((itinerary) => {
        expect(itinerary).to.not.exist;
        expect(itinerary).to.be.null;
      });
    }
    //Reset back to null
    savedItineraryId = null;
  });

  it('should not be able to delete an itinerary that does not exists', () => {
    cy.wrap(ItineraryService.deleteItinerary(fakeId)).then((message) => {
      expect(message).to.equal(`Itinerary with ID ${fakeId} not found, cannot delete.`)
    });
  });

  it('should get a single itinerary and the data should be valid', () => {
    cy.wrap(ItineraryService.getItinerary(itineraryId)).then((data) => {
      expect(data).to.exist;
      expect(data).to.not.be.null;
      if (typeof data === 'object' && data !== null) {
        expect(Object.keys(data).length).to.be.greaterThan(0);
        expect(data).to.have.all.keys(
          'accommodation',
          'demographics',
          'destination',
          'endDate',
          'end_date',
          'estimatedTotalCost',
          'estimated_total_cost',
          'id',
          'importantNotes',
          'itineraryDays',
          'notes',
          'source',
          'startDate',
          'start_date',
          'user_id',
          'weather_forecast'
        );
      }
    });
  });

  it('should get multiple itinerary based on userid and the data should be valid', () => {
    cy.wrap(ItineraryService.getUserItineraries(userId)).then((data) => {
      expect(data).to.exist;
      expect(data).to.not.be.null;
      expect(data).to.not.include('Error');

      if (Array.isArray(data) && data !== null) {
        expect(data.length).to.be.greaterThan(0);
        expect(data[0]).to.be.an('object').and.have.all.keys(
          'destination',
          'end_date',
          'estimated_total_cost',
          'id',
          'notes',
          'source',
          'start_date',
          'user_id',
          'weather_forecast'
        );
      }
    });
  });

  it('should not get any data for a single itinerary based on itineraryId that does not exist ', () => {
    cy.wrap(ItineraryService.getItinerary(fakeId)).then((data) => {
      expect(data).to.not.exist;
      expect(data).to.be.null;
    });
  });

  it('should not get any data for multiple itinerary based on userid that does not exist ', () => {
    cy.wrap(ItineraryService.getUserItineraries(fakeId)).then((data) => {
      expect(data).to.exist;
      expect(data).to.be.an('object'); // Assert that the response is an object
      expect(data).to.have.property('code', '22P02');
      expect(data).to.have.property('message', `invalid input syntax for type uuid: "${fakeId}"`);
    });
  });
});