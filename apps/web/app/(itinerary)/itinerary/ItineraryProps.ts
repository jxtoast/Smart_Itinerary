export interface ItineraryProps {
    source: string,
    destination: string,
    startDate: string,
    endDate: string,
    minBudget: number,
    maxBudget: number,
    preferences: string[],
    travelGroup: string
    numberPeople: string,
}