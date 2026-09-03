export const ItinerarySchema = {
    type: "object",
    properties: {
        startDate: { type: "string" },
        endDate: { type: "string" },
        destination: { type: "string" },
        sourceCountry: { type: "string" },
        demographics: {
            type: "object",
            properties: {
                currency: { type: "string" },
                budgetMin: { type: "number" },
                budgetMax: { type: "number" },
                travelerType: { type: "string" },
                purpose: { type: "string" },
            },
            required: ["currency", "budgetMin", "budgetMax", "travelerType", "purpose"]
        },
        accommodation: {
            type:"array",
            items:{
                type: "object",
                properties: {
                    name: { type: "string" },
                    estimatedCost: { type: "number" },
                    imageUrl: { type: "string" },
                    hotelDescription: {type: "string"}
                },
                required: ["name", "estimatedCost", "imageUrl", "hotelDescription"]
            },
        },
        itineraryDays: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    date: { type: "string" },
                    location: { type: "string" },
                    description: { type: "string" },
                    activities: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                details: { type: "string" },
                                estimatedCost: { type: "number" },
                                imageUrl: { type: "string" },
                                timing: { type: "string" }
                            },
                            required: ["name", "details", "estimatedCost", "imageUrl"]
                        }
                    },
                },
                required: ["date", "location", "description", "activities"]
            }
        },
        estimatedTotalCost: { type: "number" },
        importantNotes: {
            type: "array",
            items: { type: "string" }
        }
    },
    required: [
        "startDate", "endDate", "destination", "demographics", "accommodation", "itineraryDays", "estimatedTotalCost", "importantNotes"
    ]
};
