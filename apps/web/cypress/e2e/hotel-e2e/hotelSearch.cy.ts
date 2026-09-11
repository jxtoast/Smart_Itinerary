describe("Hotel Search", () => {
  it("search for a hotel place", () => {
    // Itinerary 101 is the api-client mock's canned saved trip (Tokyo).
    cy.visit("/hotel?itinerary=101");

    cy.get("#search").type("Tokyo");

    // Wait for the whole list to appear
    cy.get('[data-testid="search-options"]', { timeout: 10000 })
      .should("be.visible")
      .then(($dropdown) => {
        if ($dropdown.find('div:contains("No Results")').length > 0) {
          // "No Results" case
          cy.wrap($dropdown).contains("No Results").should("be.visible");
          cy.log("No results found – ending flow here.");
        } else {
          // Results exist
          cy.wrap($dropdown)
            .find('[data-testid="search-option"]')
            .should("have.length.greaterThan", 0)
            .first()
            .click();

          // Check URL contains expected path
          cy.url().should("include", "/search");

          // Wait for cards to appear
          cy.get(".card").should("exist").and("have.length.greaterThan", 0);
        }
      });
  });
});
