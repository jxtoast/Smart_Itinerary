describe("Deletes a Hotel from Current Itinerary", () => {
  it("clicks itinerary image and redirects to hotel detail page", () => {
    cy.visit("itinerary/1b9472e1-a85e-43bf-9898-6f44e2b20809/26");
    cy.get("#accommodation .card").should("exist");
    cy.get("#accommodation .card").eq(0).click();
    cy.url().should("include", "/hotel/detail");
    cy.get(".btn.btn-error").should("exist").click();

  });

  it("click yes, redirect back to itinerary page and hotel card should not exist", () => {
    cy.get("#hotelName")
      .invoke("text")
      .then((text) => text.trim())
      .as("deletedHotelName");

    // Click the confirm button
    cy.get(".swal2-confirm").click();

    // Assert redirection (wait for new page)
    cy.url().should("include", "/itinerary");

    // Assert the hotel name appears on the new page
    cy.get("@deletedHotelName").then((name) => {
      cy.contains(name as unknown as string).should("not.exist");
    });
  });
});
