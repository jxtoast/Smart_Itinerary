describe('Navigation', () => {
    it('should navigate to home page', () => {
      cy.visit('/')
      cy.get('h1', { timeout: 6000 }).should('be.visible').contains('Plan Your Dream Trip')
    })

    it('should navigate to plan itinerary page through button click', () => {
      cy.get('#plan-itinerary').click();

      cy.url().should('include', '/plan-itinerary'); 
      
      cy.get('h1').should('be.visible').contains('Generate Your Itinerary')

      // Check if a <form> element exists on the page
      cy.get('form').should('exist');
    })

    it('should go back to home page', () => {
      cy.go('back')

      cy.url().should('include', '/'); 
    })

    it('should navigate to profile page through link click', () => {
      cy.get('#profile').click({ force: true });

      cy.url().should('include', '/profile');
    })

    it('should navigate to edit profile page through button click', () => {
      cy.get('#edit-profile-btn').click();

      cy.url().should('include', '/edit-profile');

      cy.get('h1').should('be.visible').contains('Edit Profile')
    })
  })