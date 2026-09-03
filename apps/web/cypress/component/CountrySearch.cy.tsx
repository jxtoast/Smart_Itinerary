import CountrySearch from "@/app/(itinerary)/plan-itinerary/CountrySearch"
import { Country } from "@/types/Country"


describe('CountrySearch', () => {
  let mockCountries: Country[];

  beforeEach(() => {
    cy.log('Load mock data to test search functionality')
    cy.fixture<Country[]>('countries').then((data) => {
      mockCountries = data;
    });
  })

  it('should mount with data from fixture and the correct placeholder text for "source"', () => {
    cy.mount(
      <CountrySearch
        countries={mockCountries}
        onSearchTermChange={cy.spy().as('onSearchTermChange')}
        type="source"
      />
    );
    
    cy.get('input[type="text"]')
      .should('be.visible')
      .should('have.attr', 'placeholder', 'Select your starting point');
  });

  it('should mount with data from fixture and the correct placeholder text for "destination"', () => {
    cy.mount(
      <CountrySearch
        countries={mockCountries}
        onSearchTermChange={cy.spy().as('onSearchTermChange')}
        type="destination"
      />
    );
    cy.get('input[type="text"]')
      .should('be.visible')
      .should('have.attr', 'placeholder', 'Select a destination');
  });

  it('calls onSearchTermChange when typing', () => {
    cy.mount(
      <CountrySearch
        countries={mockCountries}
        onSearchTermChange={cy.spy().as('onSearchTermChange')}
        type="source"
      />
    );
    const searchTerm = 'ja';
    cy.get('input[type="text"]').type(searchTerm);
    cy.get('@onSearchTermChange').should('have.been.calledWith', searchTerm);
  });

  it('should filter countries based on the search term', () => {
    cy.mount(
      <CountrySearch
        countries={mockCountries}
        onSearchTermChange={cy.spy().as('onSearchTermChange')}
        type="text"
      />
    );
    const searchTerm = 'ja';
    cy.get('input[type="text"]').type(searchTerm);
    cy.get('.dropdown-content.dropdown-open li').should('have.length', 1).and('contain.text', 'Japan');
    cy.get('input[type="text"]').clear().type('uni');
    cy.get('.dropdown-content.dropdown-open li').should('have.length', 1).and('contain.text', 'United Kingdom');
  });

})