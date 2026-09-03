
describe('/api/common/traveltype', () => {
    it('should return a 200 status code and an array of travel type', () => {
        cy.request('/api/common?type=travel').then((response) => {
            expect(response.status).to.equal(200);

            expect(response.body).to.be.an('array');

            expect(response.body.length).to.be.greaterThan(0);

            expect(response.body[0]).to.have.property('type_name');

            expect(response.body[0]).to.have.property('type_code');

            expect(response.body[0]).to.have.property('number_of_people');
        });
    });

    it('should return a 400 status code and an error message if param not found', () => {
        cy.request({
            method: 'GET',
            url: 'api/common',
            failOnStatusCode: false, 
        }).then((response) => {
            expect(response.status).to.equal(400);

            expect(response.body).to.have.property('error');

            expect(response.body.error).to.equal('Param not found');
        });

    });

    it('should return a 500 status code and an error message if type invalid', () => {
        cy.request({
            method: 'GET',
            url: 'api/common?type=testfailure',
            failOnStatusCode: false, 
        }).then((response) => {
            expect(response.status).to.equal(500);

            expect(response.body).to.have.property('error');

            expect(response.body.error).to.equal('Type does not exists');
        });

    });

});