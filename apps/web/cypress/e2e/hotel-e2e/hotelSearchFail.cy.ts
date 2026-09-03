describe("Hotel search fails", () => {
  it("handles case with no results (Australia)", () => {
    cy.visit("/hotel?itinerary=26");

    cy.get("#search").type("australia");

    cy.get('[data-testid="search-options"]', { timeout: 10000 })
      .should("be.visible")
      .contains("No Results")
      .should("be.visible");
  });
});
