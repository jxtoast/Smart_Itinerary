import { SchemaType } from "@google/generative-ai";

export const HotelSchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      address: {
        type: SchemaType.STRING,
      },
      description: {
        type: SchemaType.STRING,
      },
      image_url: {
        type: SchemaType.STRING,
      },
      name: {
        type: SchemaType.STRING,
      },
      price: {
        type: SchemaType.STRING,
      },
      rating: {
        type: SchemaType.NUMBER,
      },
    },
    required: [
      "address",
      "description",
      "image_url",
      "name",
      "price",
      "rating",
    ],
  },
};
