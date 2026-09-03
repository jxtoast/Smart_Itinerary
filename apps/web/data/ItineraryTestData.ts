export const ItineraryTestData = {
  "startDate": "2025-03-12",
  "endDate": "2025-03-13",
  "destination": "Sydney, Australia",
  "demographics": {
    "currency": "AUD",
    "budgetMin": 500,
    "budgetMax": 50000,
    "travelerType": "Solo Travel",
    "purpose": "More Restaurants"
  },
  "accommodation": {
    "name": "The Rocks Hotel",
    "estimatedCost": 200,
    "imageUrl": "https://example.com/hotel.jpg"
  },
  "itineraryDays": [
    {
      "date": "2025-03-12",
      "location": "The Rocks & Manly Beach, Sydney",
      "description": "Explore the historic Rocks district and enjoy the scenic views of Sydney Harbour with a ferry trip to Manly Beach.",
      "activities": [
        {
          "name": "The Rocks Exploration",
          "details": "Explore the historic Rocks district, wander through the cobblestone streets, and visit the Rocks Markets (if open on Wednesday).",
          "estimatedCost": 0,
          "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/The_Rocks_Sydney_November_2017_panorama.jpg/1280px-The_Rocks_Sydney_November_2017_panorama.jpg",
          "timing": "9:00 AM - 12:00 PM"
        },
        {
          "name": "Ferry to Manly Beach",
          "details": "Take a ferry from Circular Quay to Manly Beach. Enjoy the scenic harbor views and relax on the beach.",
          "estimatedCost": 20,
          "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Manly_Beach_Sydney_Australia.jpg/1280px-Manly_Beach_Sydney_Australia.jpg",
          "timing": "12:00 PM - 5:00 PM"
        },
        {
          "name": "Dinner at Saké Restaurant & Bar",
          "details": "Enjoy dinner at a restaurant in The Rocks. Consider trying 'Saké Restaurant & Bar' for Japanese cuisine with harbor views.",
          "estimatedCost": 150,
          "imageUrl": "https://example.com/sake_restaurant.jpg",
          "timing": "7:00 PM - 9:00 PM"
        }
      ],
      "accommodation": {
        "name": "The Rocks Hotel",
        "estimatedCost": 200,
        "imageUrl": "https://example.com/hotel.jpg"
      }
    },
    {
      "date": "2025-03-13",
      "location": "Sydney Opera House, Harbour Bridge, Darling Harbour",
      "description": "Visit iconic Sydney landmarks, including the Opera House, Harbour Bridge, and enjoy dinner at Darling Harbour.",
      "activities": [
        {
          "name": "Opera House Tour",
          "details": "Tour the iconic Sydney Opera House and learn about its history and architecture.",
          "estimatedCost": 50,
          "imageUrl": "https://example.com/opera_house.jpg",
          "timing": "9:00 AM - 12:00 PM"
        },
        {
          "name": "Harbour Bridge Climb",
          "details": "Climb the Sydney Harbour Bridge for an unforgettable view of the city.",
          "estimatedCost": 150,
          "imageUrl": "https://example.com/harbour_bridge.jpg",
          "timing": "12:00 PM - 4:00 PM"
        },
        {
          "name": "Dinner at Darling Harbour",
          "details": "Enjoy dinner at one of the many restaurants at Darling Harbour with a view of the water.",
          "estimatedCost": 100,
          "imageUrl": "https://example.com/darling_harbour.jpg",
          "timing": "6:00 PM - 9:00 PM"
        }
      ],
      "accommodation": {
        "name": "The Rocks Hotel",
        "estimatedCost": 200,
        "imageUrl": "https://example.com/hotel.jpg"
      }
    }
  ],
  "estimatedTotalCost": 700,
  "importantNotes": [
    "Wear comfortable shoes for walking.",
    "Bring sunscreen and a hat.",
    "Purchase an Opal card for public transport.",
    "Book restaurants in advance, especially for dinner."
  ]
};
