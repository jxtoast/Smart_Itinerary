describe("Hotel search fails", () => {
  it("handles case with no results (Australia)", () => {
    // Itinerary 101 is the api-client mock's canned saved trip (Tokyo);
    // no mock hotel matches "australia".
    cy.visit("/hotel?itinerary=101");

    cy.get("#search").type("australia");

    cy.get('[data-testid="search-options"]', { timeout: 10000 })
      .should("be.visible")
      .contains("No Results")
      .should("be.visible");
  });
});
