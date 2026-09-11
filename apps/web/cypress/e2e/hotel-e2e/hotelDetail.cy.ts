describe("Hotel Details Page", () => {
  it("should navigate to home page", () => {
    cy.visit("/");
    cy.get("h1", { timeout: 6000 })
      .should("be.visible")
      .contains("Plan Your Dream Trip");
  });

  it("should navigate to profile page through link click", () => {
    cy.get("#profile").click({ force: true });

    cy.url().should("include", "/profile");
  });

  it("should navigate to itinerary page through link click", () => {
    cy.get("button").contains("View Details").click({ force: true });

    cy.url().should("include", "/itinerary");
  });

  it("should navigate to hotel details page through hotel image click", () => {
    cy.get("#accommodation .card").should("exist");
    cy.get("#accommodation .card").eq(0).click();
    cy.url().should("include", "/hotel/detail");
  });

  it("should display the title, image, and hotel info", () => {
    // Check for title text
    cy.contains("Hotel Details").should("be.visible");

    // Check for the hotel image
    cy.get('img[alt="hotel image"]').should("be.visible");

    // Check that hotel name exists (it's rendered inside a span)
    cy.get("#hotelName") // or better target if available
      .contains(/.+/) // matches any non-empty string
      .should("exist");

    // Check that hotel estimated cost exists (it's rendered inside a span)
    cy.get("#hotelEstimatedCost") // or better target if available
      .contains(/.+/) // matches any non-empty string
      .should("exist");

    // Check that price appears
    cy.contains("Estimated Price:").should("exist");
  });
});
