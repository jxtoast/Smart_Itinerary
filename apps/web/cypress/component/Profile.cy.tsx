import { UserService } from "@/services/UserService";
import { UserDemographics } from "@/types/UserDemographics";

describe('Profile', () => {
    let userId: string;
    let fakeId: string;
    let userDemographics: UserDemographics;

    before(() => {
        cy.fixture('test_user').then((userData) => {
            userId = userData.userId
            fakeId = userData.fakeId
            userDemographics = userData.userDemographics
        });
    });

    it('should return true for a user that exists ', () => {
        cy.wrap(UserService.checkUserExists(userId)).then((exists) => {
            expect(exists).to.be.true;
        });
    });

    it('should  return false for a user that does not exists ', () => {
        cy.wrap(UserService.checkUserExists(fakeId)).then((exists) => {
            expect(exists).to.be.false;
        });
    });

    it('should return data for a user that exists and the data should be valid ', () => {
        cy.wrap(UserService.getUserById(userId)).then((data) => {
            expect(data).to.exist;
            expect(data).to.not.be.null;
            if (typeof data === 'object' && data !== null) {
                expect(Object.keys(data).length).to.be.greaterThan(0);
                expect(data).to.have.all.keys(
                    'id',
                    'name',
                    'email',
                    'avatar_url',
                    'userDemographics'
                );
            }
        });
    });

    it('should not return data for a user that does not exists ', () => {
        cy.wrap(UserService.getUserById(fakeId)).then((data) => {
            expect(data).to.be.null;
        });
    });


    it('should return demographics for a user that exists ', () => {
        cy.wrap(UserService.getUserDemographicsById(userId)).then((data) => {
            expect(data).to.exist;
            expect(data).to.not.be.null;
            if (typeof data === 'object' && data !== null) {
                expect(Object.keys(data).length).to.be.greaterThan(0);
                expect(data).to.have.all.keys(
                    'id',
                    'userId',
                    'minBudget',
                    'maxBudget',
                    'travelType',
                    'purpose',
                    'numberOfPeople'
                );
            }
        });
    });

    it('should not return demographics for a user that does not exists ', () => {
        cy.wrap(UserService.getUserDemographicsById(fakeId)).then((data) => {
            expect(data).to.be.null;
        });
    });

    it('should update demographics for a user that exists ', () => {
        cy.wrap(UserService.updateUserDemographics(userDemographics)).then(() => {
            cy.wrap(UserService.getUserDemographicsById(userId)).then((data) => {
                expect(data).to.exist;
                expect(data).to.not.be.null;
                if (typeof data === 'object' && data !== null) {
                    // Assert that the updated data reflects the changes
                    const updatedData = data as UserDemographics;
                    expect(updatedData.id).to.exist;
                    expect(updatedData.minBudget).to.equal(userDemographics.minBudget);
                    expect(updatedData.maxBudget).to.equal(userDemographics.maxBudget);
                    expect(updatedData.travelType).to.equal(userDemographics.travelType);
                    expect(updatedData.purpose).to.equal(userDemographics.purpose);
                    expect(updatedData.numberOfPeople).to.equal(userDemographics.numberOfPeople);
                    expect(updatedData.userId).to.equal(userId);
                }
            });
        });
    });

});