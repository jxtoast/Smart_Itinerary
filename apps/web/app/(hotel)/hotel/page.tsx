"use client";

import { Suspense } from "react";
import HotelSuggestion from "../../../components/hotel/HotelSuggestion";
import HotelSearchComponent from "@/components/hotel/HotelSearchComponent";

export default function Hotels() {
  return (
    <div className="w-full flex-1 flex flex-col justify-center items-center">
      <div className="w-4/6 h-72 flex flex-col gap-8">
        <div className="text-3xl text-center w-full">Search For A Hotel</div>
        <HotelSearchComponent />
        <Suspense fallback={<div>Loading your hotel suggestions...</div>}>
          <HotelSuggestion />
        </Suspense>
      </div>
    </div>
  );
}
