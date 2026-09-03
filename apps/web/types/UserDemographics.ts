export interface UserDemographics {
    id?: string | null;
    userId: string;
    minBudget: number | null;
    maxBudget: number | null;
    travelType: string;
    purpose: string;
    numberOfPeople: string;
}