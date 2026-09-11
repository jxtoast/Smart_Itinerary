import { Hotel } from "@/types/Hotel";
import { ItineraryAccommodation } from "@/types/ItineraryAccommodation";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HotelStoreState {
  hotelSearchData: Hotel[];
  hotelDetails: ItineraryAccommodation | null;
  setHotelSearchData: (hotelSearchData: Hotel[]) => void;
  clearHotelSearchData: () => void;
  setHotelDetails: (hotelDetail: ItineraryAccommodation) => void;
  clearHotelDetailsData: () => void;
}
const useHotelStore = create<
  HotelStoreState,
  [["zustand/persist", HotelStoreState]]
>(
  persist(
    (set) => ({
      hotelSearchData: [],
      isSampleData: false,
      setHotelSearchData: (hotelSearchData: Hotel[]) => {
        set({ hotelSearchData: hotelSearchData });
        console.log("Updating store with data"); // Log when store is updated
      },
      clearHotelSearchData: () => set({ hotelSearchData: [] }),
      hotelDetails: null,
      setHotelDetails: (hotelDetails: ItineraryAccommodation) => {
        set({ hotelDetails: hotelDetails });
        console.log("Updating store with hotel details data"); // Log when store is updated
      },
      clearHotelDetailsData: () => set({ hotelDetails: null }),
    }),
    {
      name: "hotel-storage",
    }
  )
);

export default useHotelStore;
