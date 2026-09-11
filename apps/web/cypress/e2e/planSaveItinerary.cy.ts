/**
 * Offline plan → save round trip against the mock api-client
 * (NEXT_PUBLIC_ENABLE_MOCK_AUTH=true must be set on the dev server).
 *
 * Everything here runs without any backend: the reference data, the plan
 * generation and the save are all served by the in-memory mock, and the
 * redirect to /profile/<mock-user-id> proves the save call resolved
 * (a failed create lands in the "Save failed" dialog instead).
 */
describe("Plans and saves an itinerary via the mock api-client", () => {
  it("fills the form, generates the itinerary and saves it", () => {
    cy.visit("/plan-itinerary");

    // Source + destination come from the reference-data dropdowns.
    cy.get('input[name="source"]').type("Singapore");
    cy.get("ul.dropdown-content li").contains("Singapore").click();
    cy.get('input[name="destination"]').type("Japan");
    cy.get("ul.dropdown-content li").contains("Japan").click();

    // Default dates are today/today — give the trip a real length. Date
    // inputs are segmented per browser locale, so set the value through the
    // native setter instead of typing keystrokes (React needs the input
    // event to pick the change up).
    cy.get('input[name="end_date"]').then(($input) => {
      const el = $input[0] as HTMLInputElement;
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      setValue.call(el, "2026-12-10");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    cy.get('input[name="max_budget"]').type("3000");
    cy.get('input[name="travel-group"][value="Couple"]').check();

    cy.contains("button", "Generate").click();
    cy.url().should("include", "/itinerary?data=");

    // The generated plan renders the destination as the page heading.
    cy.contains("h1", "Japan", { timeout: 15000 }).should("be.visible");

    cy.contains("button", "Save Itinerary").click();

    // Saving routes to the profile of the mock user — only reachable when
    // the create call through the Itinerary Service client resolved.
    cy.url({ timeout: 15000 }).should(
      "include",
      "/profile/1b9472e1-a85e-43bf-9898-6f44e2b20809"
    );
  });
});
