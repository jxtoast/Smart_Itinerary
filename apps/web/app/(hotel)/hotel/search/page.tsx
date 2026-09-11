"use client";

import HotelSearchComponent from "@/components/hotel/HotelSearchComponent";
import HotelSearchResultCard from "@/components/hotel/HotelSearchResultCard";

export default function HotelSearch() {
  return (
    <>
      <div className="flex flex-row w-full justify-center items-center pt-10">
        <div className="w-5/6">
          <HotelSearchComponent isSearchHome={false} />
        </div>
      </div>
      <HotelSearchResultCard />
    </>
  );
}
