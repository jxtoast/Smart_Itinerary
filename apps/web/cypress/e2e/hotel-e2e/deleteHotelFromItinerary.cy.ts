describe("Deletes a Hotel from Current Itinerary", () => {
  it("clicks itinerary image and redirects to hotel detail page", () => {
    // Itinerary 101 is the api-client mock's canned saved trip (Tokyo).
    cy.visit("itinerary/1b9472e1-a85e-43bf-9898-6f44e2b20809/101");
    cy.get("#accommodation .card").should("exist");
    cy.get("#accommodation .card").eq(0).click();
    cy.url().should("include", "/hotel/detail");
    cy.get(".btn.btn-error").should("exist").click();

  });

  it("click yes, shows the success dialog and redirects back to the itinerary page", () => {
    // Click the confirm button
    cy.get(".swal2-confirm").click();

    // The DELETE goes through the mock api-client, whose in-memory state is
    // fresh per getApiClient() call — the removal cannot persist visually,
    // so assert the success dialog + redirect instead of the hotel's absence
    // (persistence is proven against the live stack, not in mock mode).
    cy.contains("You have successfully deleted this hotel").should("be.visible");

    // Assert redirection (wait for new page)
    cy.url().should("include", "/itinerary");
  });
});
