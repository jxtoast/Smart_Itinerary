"use client";

import { HotelSchema } from "@/data/HotelSchema";
import { Hotel } from "@/types/Hotel";
import { GeminiService } from "@/services/GeminiService";
import { GeminiConfigBuilder } from "@/services/GeminiConfigBuilder";

export const useHotels = () => {

  const getHotelQueryResult = async (query: string) => {
    const geminiService = new GeminiService();

    const prompt =
      "I am creating a search bar for hotels, and I would like you to suggest hotels based on my search query. " +
      "Can you include hotel details suchs as ratings, price, description, image address of any image you can " +
      "get on the website itself. Please return an empty json array if there are no hotel suggestions. " +
      `The query is "${query}"`;

    const generationConfig = new GeminiConfigBuilder()
      .withTemperature(1)
      .withTopP(0.95)
      .withTopK(40)
      .withMaxOutputTokens(8192)
      .withResponseMimeType("application/json")
      .withResponseSchema(HotelSchema)
      .build();

    const result = await geminiService.generateContent(prompt, generationConfig);
    if (result != null) {
      return JSON.parse(result) as Hotel[];
    }
  };

  return { getHotelQueryResult };
};
