describe("Redirect to Search Hotel Page at Itinerary Page", () => {
  it("click add a hotel button and redirects to hotel search page ", () => {
    cy.visit("itinerary/1b9472e1-a85e-43bf-9898-6f44e2b20809/26");
    cy.get("button", { timeout: 6000 }).contains("Add a Hotel").click();
    cy.url().should("include", "/hotel?itinerary=26");
  });
});
