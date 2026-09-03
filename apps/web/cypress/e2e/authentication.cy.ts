
describe("Authenticated User", () => {

  beforeEach(() => {
    cy.visit("/plan-itinerary");
  });


  it("does NOT show Google sign in when user is authenticated", () => {
    cy.url().should("include", "/plan-itinerary");

    cy.contains("span", "Sign in with Google").should("not.exist");

    // cy.wait(2000); // Must wait for the page to load for swal trigger

    // cy.get('input[type="checkbox"][name="my_preference"]').check({ force: true });

    // cy.get('input[type="checkbox"][name="my_preference"]').check({ force: true });

    // cy.get(".swal2-container", { timeout: 8000 }).should("not.exist");
  });
});
