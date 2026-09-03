import { Itinerary } from "@/types/Itinerary";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export default function itineraryStore() {
  interface ItineraryState {
    itinerary: Itinerary | null;
    setItineraryData: (itinerary: Itinerary) => void;
    clearItineraryData: () => void;
  }
  const useItineraryStore = create<
    ItineraryState,
    [["zustand/persist", ItineraryState]]
  >(
    persist(
      (set) => ({
        itinerary: null,
        setItineraryData: (itinerary: Itinerary) =>
          set({ itinerary: itinerary }),
        clearItineraryData: () => set({ itinerary: null }),
      }),
      { name: "itinerary-storage" }
    )
  );

  return { useItineraryStore };
}
