import { supabase } from "@/lib/supabase/client";
import { Itinerary } from "@/types/Itinerary";
import { WeatherForecast } from "@/types/WeatherForecast";

export class ItineraryService {
  static async saveItinerary(userId: string, itinerary: Itinerary, weatherForecast: WeatherForecast): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from("itinerary")
        .insert({
          user_id: userId,
          source: itinerary.sourceCountry,
          destination: itinerary.destination,
          start_date: itinerary.startDate,
          end_date: itinerary.endDate,
          estimated_total_cost: itinerary.estimatedTotalCost,
          notes: itinerary.importantNotes,
          weather_forecast: weatherForecast, // Store the weather forecast as a JSON string
        })
        .select()
        .single();

      const itineraryId = data?.id;

      if (!error && itineraryId) {
        await supabase.from("itinerary_demographics").insert({
          currency: itinerary.demographics.currency,
          budget_min: itinerary.demographics.budgetMin,
          budget_max: itinerary.demographics.budgetMax,
          travel_type: itinerary.demographics.travelerType,
          purpose: itinerary.demographics.purpose,
          itinerary_id: itineraryId,
        });

        await supabase.from("itinerary_accomodation").insert(
          itinerary.accommodation.map((item) => {
            return {
              name: item.name,
              estimated_cost: item.estimatedCost,
              image_url: item.imageUrl,
              itinerary_id: itineraryId,
              hotel_description: item.hotelDescription,
            };
          })
        );

        for (const day of itinerary.itineraryDays) {
          const { data: dayData, error: dayError } = await supabase
            .from("itinerary_day")
            .insert({
              itinerary_id: itineraryId,
              date: day.date,
              location: day.location,
              description: day.description,
            })
            .select()
            .single();

          const itineraryDayId = dayData.id;
          if (!dayError && itineraryDayId) {
            for (const activity of day.activities) {
              await supabase.from("itinerary_activity").insert({
                itinerary_day_id: itineraryDayId,
                name: activity.name,
                details: activity.details,
                estimated_cost: activity.estimatedCost,
                image_url: activity.imageUrl,
                timing: activity.timing,
              });
            }
          }
        }
      }
      return itineraryId;
    } catch (error) {
      console.error("Error saving itinerary:", error);
      return null;
    }
  }

  static async updateItinerary(
    userId: string,
    itinerary: Itinerary,
    weatherForecast: WeatherForecast
  ): Promise<void> {
    try {
      const { id: itineraryId } = itinerary.id ? itinerary : {};

      if (!itineraryId) {
        console.error("Itinerary ID is missing. Cannot update.");
        return;
      }

      // 1. Update the main itinerary table
      const { error: itineraryError } = await supabase
        .from("itinerary")
        .update({
          user_id: userId,
          source: itinerary.sourceCountry,
          destination: itinerary.destination,
          start_date: itinerary.startDate,
          end_date: itinerary.endDate,
          estimated_total_cost: itinerary.estimatedTotalCost,
          notes: itinerary.importantNotes,
          weather_forecast: weatherForecast,
        })
        .eq("id", itineraryId);

      if (itineraryError) {
        console.error("Error updating itinerary:", itineraryError);
        return;
      }

      // 2. Update demographics
      const { error: demographicsError } = await supabase
        .from("itinerary_demographics")
        .update({
          currency: itinerary.demographics.currency,
          budget_min: itinerary.demographics.budgetMin,
          budget_max: itinerary.demographics.budgetMax,
          travel_type: itinerary.demographics.travelerType,
          purpose: itinerary.demographics.purpose,
        })
        .eq("itinerary_id", itineraryId);

      if (demographicsError) {
        console.error("Error updating demographics:", demographicsError);
      }

      // 3. Update accommodations
      for (const item of itinerary.accommodation) {
        if (item.id) {
          await supabase
            .from("itinerary_accomodation")
            .update({
              name: item.name,
              estimated_cost: item.estimatedCost,
              image_url: item.imageUrl,
              itinerary_id: itineraryId,
              hotel_description: item.hotelDescription,
            })
            .eq("id", item.id);
        }
      }

      // 4. Update itinerary days and activities
      for (const day of itinerary.itineraryDays) {
        const { data: dayData, error: dayError } = await supabase
          .from("itinerary_day")
          .update({
            itinerary_id: itineraryId,
            date: day.date,
            location: day.location,
            description: day.description,
          })
          .eq("id", day.id);


        console.log("dayData", dayData);
        console.log("day", day);
        const itineraryDayId = day.id;
        if (!dayError && itineraryDayId) {
          for (const activity of day.activities) {
            await supabase.from("itinerary_activity").update({
              itinerary_day_id: itineraryDayId,
              name: activity.name,
              details: activity.details,
              estimated_cost: activity.estimatedCost,
              image_url: activity.imageUrl,
              timing: activity.timing,
            })
              .eq("id", activity.id);
          }
        }
      }

      console.log("Itinerary updated successfully.");
    } catch (error) {
      console.error("Error in updateItinerary:", error);
    }
  }

  static async getUserItineraries(userId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from("itinerary")
        .select("*")
        .eq("user_id", userId);
      if (data) {
        return data;
      }
      return error;
    } catch (error) {
      console.error("Error retrieving user itinerary:", error);
    }
  }

  static async getItinerary(itineraryId: string): Promise<any> {
    try {
      // Fetch the main itinerary details
      const { data: itineraryData, error: itineraryError } = await supabase
        .from("itinerary")
        .select("*")
        .eq("id", itineraryId)
        .single(); // We assume we are fetching a single itinerary

      if (itineraryError) {
        console.error("Error fetching itinerary:", itineraryError);
        return null; // Return null if there is an error fetching the itinerary
      }

      if (!itineraryData) {
        console.log("No itinerary found with this ID");
        return null; // Return null if no data is found
      }

      // Fetch related demographics data (same as before)
      const { data: demographicsData, error: demographicsError } =
        await supabase
          .from("itinerary_demographics")
          .select("*")
          .eq("itinerary_id", itineraryId)
          .single(); // Assuming a 1-to-1 relationship

      if (demographicsError) {
        console.error("Error fetching demographics:", demographicsError);
      }

      // Fetch related accommodation data (same as before)
      const { data: accommodationData, error: accommodationError } =
        await supabase
          .from("itinerary_accomodation")
          .select("*")
          .eq("itinerary_id", itineraryId);

      if (accommodationError) {
        console.error("Error fetching accommodation:", accommodationError);
      }

      // Fetch related itinerary days data (same as before)
      const { data: itineraryDaysData, error: itineraryDaysError } =
        await supabase
          .from("itinerary_day")
          .select("*")
          .eq("itinerary_id", itineraryId);

      if (itineraryDaysError) {
        console.error("Error fetching itinerary days:", itineraryDaysError);
      }

      // Fetch activities for each itinerary day (same as before)
      if (itineraryDaysData) {
        for (const day of itineraryDaysData) {
          const { data: activitiesData, error: activitiesError } =
            await supabase
              .from("itinerary_activity")
              .select("*")
              .eq("itinerary_day_id", day.id); // Fetch activities by itinerary_day_id

          if (activitiesError) {
            console.error(
              "Error fetching activities for day:",
              activitiesError
            );
          }

          // Transform the activities data to match your JavaScript object naming conventions (camelCase)
          if (activitiesData) {
            day.activities =
              activitiesData.map((activity) => ({
                id: activity.id,
                itineraryDayId: activity.itinerary_day_id, // Mapping `itinerary_day_id` to `itineraryDayId`
                name: activity.name,
                details: activity.details,
                estimatedCost: activity.estimated_cost, // Mapping `estimated_cost` to `estimatedCost`
                imageUrl: activity.image_url, // Mapping `image_url` to `imageUrl`
                timing: activity.timing,
              })) || []; // Add activities to each day, with new property names
          }
        }
      }

      // Transform itinerary data to match your TypeScript object naming conventions (camelCase)
      const transformedItineraryData = {
        ...itineraryData,
        id: itineraryData.id,
        destination: itineraryData.destination,
        startDate: itineraryData.start_date,
        endDate: itineraryData.end_date,
        estimatedTotalCost: itineraryData.estimated_total_cost,
        importantNotes: itineraryData.notes
          ? JSON.parse(itineraryData.notes)
          : [], // Parse the notes string into an array
      };

      // Transform the demographics object and nest it under "demographics"
      const transformedDemographicsData = {
        currency: demographicsData.currency,
        budgetMin: demographicsData.budget_min,
        budgetMax: demographicsData.budget_max,
        travelerType: demographicsData.travel_type,
        purpose: demographicsData.purpose,
      };

      // Transform the accommodation object and nest it under "accommodation"
      const transformedAccommodationData = accommodationData
        ? accommodationData.map((item) => {
          return {
            id: item.id,
            name: item.name,
            estimatedCost: item.estimated_cost, // Mapping snake_case to camelCase
            imageUrl: item.image_url ?? "", // Mapping snake_case to camelCase
            itineraryId: item.itinerary_id, // Mapping snake_case to camelCase
            hotelDescription: item.hotel_description ?? "",
          };
        })
        : [];

      // Assemble and return the complete itinerary data including all related data
      return {
        ...transformedItineraryData,
        demographics: transformedDemographicsData || {},
        accommodation: transformedAccommodationData || {},
        itineraryDays: itineraryDaysData || [],
      };
    } catch (error) {
      console.error("Error fetching itinerary:", error);
      return null;
    }
  }

  static async deleteAccomodation(accommodationId: string): Promise<any> {
    try {
      const { error: deleteError } = await supabase
        .from("itinerary_accomodation")
        .delete()
        .eq("id", accommodationId);

      if (deleteError) {
        console.error("Error deleting accommodation:", deleteError);
      }
    } catch (error) {
      console.error("Error deleting accommodation:", error);
    }
  }

  static async deleteItinerary(itineraryId: string): Promise<string> {
    try {
      const exists = await ItineraryService.checkItineraryExists(itineraryId);

      if (!exists) {
        return `Itinerary with ID ${itineraryId} not found, cannot delete.`
      }

      const { error } = await supabase
        .from("itinerary")
        .delete()
        .eq("id", itineraryId);

      if (error) {
        console.error("Error deleting itinerary:", error);
        return `Failed to delete itinerary with ID ${itineraryId}: ${error.message}`;
      }
      console.log("Itinerary deleted successfully");
      return "Itinerary deleted successfully";
    } catch (error) {
      console.error("Error deleting itinerary:", error);
      return `Failed to delete itinerary with ID ${itineraryId}: ${error}`;
    }
  }

  static async checkItineraryExists(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from("itinerary")
      .select("*", { count: 'exact', head: true }) // Select all (for count), but only fetch head
      .eq("id", id);

    if (error) {
      console.error("Error checking itinerary existence:", error);
      return false;
    }

    return count !== null && count > 0;
  }

}
