/**
 * Gateway reference-data smoke: travel types.
 *
 * These specs used to call the monolith's browser-side /api/common route
 * (removed in the T3.4 cleanup); they now exercise the same assertions
 * against the microservices path a real request takes — same-origin /api/*
 * rewrite → gateway (:8080, JWT-gated) → gemini-service reference data.
 * The session cookie is minted the way local development does it:
 * POST /api/auth/dev-token (gateway dev mode) sets the si_session cookie.
 *
 * Run: npm run cypress:api-test (from apps/web) with the compose stack up.
 */
describe("GET /api/gemini/reference/travel-types (through the gateway)", () => {
  before(() => {
    // Mint a dev session — cy.request stores the si_session cookie in the
    // Cypress cookie jar, so the requests below authenticate like a browser.
    cy.request("POST", "/api/auth/dev-token").its("status").should("eq", 201);
  });

  it("returns 200 and a non-empty list of shaped travel types", () => {
    cy.request("/api/gemini/reference/travel-types").then((response) => {
      expect(response.status).to.equal(200);
      const items = response.body.items;
      expect(items).to.be.an("array");
      expect(items.length).to.be.greaterThan(0);
      // Same fields the legacy route served (type_name/type_code/
      // number_of_people), served from gemini-service's own database now.
      expect(items[0]).to.have.property("type_name");
      expect(items[0]).to.have.property("type_code");
      expect(items[0]).to.have.property("number_of_people");
    });
  });

  it("returns 401 without a session — the gateway gates the reference data", () => {
    // Drop the cookie the before() hook minted: a request without the
    // si_session cookie must never reach the data.
    cy.clearCookie("si_session");
    cy.request({
      url: "/api/gemini/reference/travel-types",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.equal(401);
      expect(response.body).to.have.property("error");
    });
  });
});
