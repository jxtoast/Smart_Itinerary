import { Hotel } from "@/types/Hotel";
import { supabase } from "@/lib/supabase/client";
export class HotelService {
  static saveHoteltoItinerary = async (itineraryId: number, hotel: Hotel) => {
    try {
      const { data, error } = await supabase
        .from("itinerary_accomodation")
        .insert({
          name: hotel.name,
          estimated_cost: parseInt(hotel.price.slice(1)),
          image_url: hotel.image_url,
          itinerary_id: itineraryId,
          hotel_description: hotel.description,
        })
        .select("*")
        .single();
      if (data) {
        return data.id;
      }
    } catch (error) {}
  };
}
