"use client";

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useHotels } from "@/hooks/useHotels";
import { useRouter } from "next/navigation";
import { Hotel } from "@/types/Hotel";
import useHotelStore from "@/store/hotelStore";

export default function HotelSearchComponent({
  isSearchHome = true,
}: {
  isSearchHome?: boolean;
}) {
  // USESTATES
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [tempSearchResult, setTempSearchResult] = useState<Hotel[]>([]);

  // FUNCTIONS AND VARIABLES
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { getHotelQueryResult } = useHotels();
  const hotelSearchData = useHotelStore((state) => state.hotelSearchData);
  const setHotelSearchData = useHotelStore((state) => state.setHotelSearchData);

  const handleSearchClick = () => {
    setHotelSearchData(tempSearchResult);
  };

  // USEEFFECTS
  useEffect(() => {
    try {
      // This debounce function is to delay the search until the user finish typing
      const delayDebounceFn = setTimeout(async () => {
        if (query !== "") {
          setIsLoading(true);
          setIsOpen(true);
          setDebouncedQuery(query);
          // data return is in an array of 20 items
          const getData = await getHotelQueryResult(query);
          if (getData && getData.length > 0) {
            setTempSearchResult(getData);
          }
          setIsLoading(false);
        } else {
          setIsOpen(false);
          setTempSearchResult([]);
        }
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      } else {
        if (hotelSearchData.length > 0) {
          setIsOpen(true);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <div className="relative" ref={dropdownRef}>
      <label className="bg-main-3">
        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-4" />

        <input
        id="search"
          type="text"
          placeholder="Search for hotels...."
          className="input input-bordered bg-main-3 w-full pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (!query) {
              setIsOpen(false);
            } else {
              setIsOpen(true);
            }
          }}
        />
      </label>
      {isOpen && debouncedQuery && (
        <ul
          data-testid="search-options"
          className="relative z-50 mt-1 bg-main-4 rounded p-1 w-full max-h-48 overflow-y-auto"
        >
          <div className="py-2 rounded">
            {isLoading && (
              <div className="w-full flex flex-col justify-center items-center">
                <span className="loading loading-spinner loading-xl"></span>
              </div>
            )}
            {!isLoading && tempSearchResult && tempSearchResult.length > 0
              ? tempSearchResult.map((data, index) => (
                  <li
                    data-testid="search-option"
                    className="hover:bg-gray-400 rounded p-2 cursor-pointer "
                    key={index}
                    onClick={() => {
                      setIsOpen(false);
                      handleSearchClick();
                      if (isSearchHome) {
                        router.push("/hotel/search");
                      }
                    }}
                  >
                    {data.name}
                  </li>
                ))
              : !isLoading &&
                tempSearchResult &&
                tempSearchResult.length == 0 && (
                  <div className="flex w-full text-xl justify-center">
                    No Results
                  </div>
                )}
          </div>
        </ul>
      )}
    </div>
  );
}
