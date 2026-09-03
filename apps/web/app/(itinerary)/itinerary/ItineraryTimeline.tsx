import { ItineraryService } from "@/services/ItineraryService";
import { ItineraryTimelineProps } from "./ItineraryTimelineProps";
import { UserService } from "@/services/UserService";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import FlightLeg from "@/components/flights/FlightDisplayCard";
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";
import DailyWeatherItem from "./DailyWeatherItem";
import useHotelStore from "@/store/hotelStore";
import { ItineraryAccommodation } from "@/types/ItineraryAccommodation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { FaCalendarAlt, FaUserFriends } from "react-icons/fa"; // Calendar icon
import { getFlagEmoji } from "@/utils/flagUtils"; // Utility to get flag from country name/code

import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { signinWithGoogleWithRedirect } from "@/lib/actions";
import { useAuth } from "@/context/AuthContext";
import { FlightDisplayDetails } from '@/types/FlightDisplayDetails'



export default function ItineraryTimeline({
  itinerary,
  weatherForecast,
  userId,
  itineraryId,
  flightDisplayDetails,
  isGeneratedItinerary,
}: ItineraryTimelineProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const router = useRouter();
  const setHotelDetails = useHotelStore((state) => state.setHotelDetails);

  const [itineraryDetails, setItineraryDetails] = useState(itinerary);
  const [hasChanges, setHasChanges] = useState(false);

  const [originalItinerary, setOriginalItinerary] = useState(itinerary);
  const { user } = useAuth();

  const userSession = UserService.getUserSession();
  const [sortOption, setSortOption] = useState('price-asc');

  const handleSortChange = (option:string) => {
    setSortOption(option);
  };

  // Helper function to calculate total duration (outbound + return)
const calculateTotalDuration = (flight:FlightDisplayDetails) => {
  let totalMinutes = 0;
  // Parse outbound duration (format: PT34H10M)
  if (flight.outbound?.totalDuration) {
    const outboundMatch = flight.outbound.totalDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (outboundMatch) {
      const hours = outboundMatch[1] ? parseInt(outboundMatch[1]) : 0;
      const minutes = outboundMatch[2] ? parseInt(outboundMatch[2]) : 0;
      totalMinutes += hours * 60 + minutes;
    }
  }
  
  // Parse return duration if exists
  if (flight.return?.totalDuration) {
    const returnMatch = flight.return.totalDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (returnMatch) {
      const hours = returnMatch[1] ? parseInt(returnMatch[1]) : 0;
      const minutes = returnMatch[2] ? parseInt(returnMatch[2]) : 0;
      totalMinutes += hours * 60 + minutes;
    }
  }
  
  // Format to readable duration
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins}m`;
};

// Use useMemo to sort the flights based on the selected option
const sortedFlightDetails = useMemo(() => {
  if (!flightDisplayDetails) return [];
  
  const flights = [...flightDisplayDetails];
  
  switch (sortOption) {
    case 'price-asc':
      return flights.sort((a, b) => parseFloat(a.price.amount) - parseFloat(b.price.amount));
    case 'price-desc':
      return flights.sort((a, b) => parseFloat(b.price.amount) - parseFloat(a.price.amount));
    case 'duration-asc':
      return flights.sort((a, b) => {
        // Extract durations in minutes
        const getDurationMinutes = (flight:FlightDisplayDetails) => {
          let totalMinutes = 0;
          if (flight.outbound?.totalDuration) {
            const match = flight.outbound.totalDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            if (match) {
              const hours = match[1] ? parseInt(match[1]) : 0;
              const minutes = match[2] ? parseInt(match[2]) : 0;
              totalMinutes += hours * 60 + minutes;
            }
          }
          if (flight.return?.totalDuration) {
            const match = flight.return.totalDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            if (match) {
              const hours = match[1] ? parseInt(match[1]) : 0;
              const minutes = match[2] ? parseInt(match[2]) : 0;
              totalMinutes += hours * 60 + minutes;
            }
          }
          return totalMinutes;
        };
        
        return getDurationMinutes(a) - getDurationMinutes(b);
      });
    case 'duration-desc':
      return flights.sort((a, b) => {
        // Similar logic as above, but reversed order
        const getDurationMinutes = (flight:FlightDisplayDetails) => {
          let totalMinutes = 0;
          if (flight.outbound?.totalDuration) {
            const match = flight.outbound.totalDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            if (match) {
              const hours = match[1] ? parseInt(match[1]) : 0;
              const minutes = match[2] ? parseInt(match[2]) : 0;
              totalMinutes += hours * 60 + minutes;
            }
          }
          if (flight.return?.totalDuration) {
            const match = flight.return.totalDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            if (match) {
              const hours = match[1] ? parseInt(match[1]) : 0;
              const minutes = match[2] ? parseInt(match[2]) : 0;
              totalMinutes += hours * 60 + minutes;
            }
          }
          return totalMinutes;
        };
        
        return getDurationMinutes(b) - getDurationMinutes(a);
      });
      case 'stops-asc':
        return flights.sort((a, b) => {
          const aStops = (a.outbound?.totalStops || 0) + (a.return?.totalStops || 0);
          const bStops = (b.outbound?.totalStops || 0) + (b.return?.totalStops || 0);
          return aStops - bStops;
        });
      default:
        return flights;
    }
  }, [flightDisplayDetails, sortOption]);


  async function SaveItinerary(): Promise<void> {
    setLoading(true);
    if (user && user.id) {
      await ItineraryService.saveItinerary(user.id, itinerary, weatherForecast);
      setLoading(false);
      router.push(`/profile/${user.id}`);
    }
  }

  async function UpdateItinerary(): Promise<void> {
    setLoading(true);
    if (user && user.id) {
      const itinerary = itineraryDetails;
      await ItineraryService.updateItinerary(
        user.id,
        itinerary,
        weatherForecast
      );
      setLoading(false);
      router.push(`/profile/${user.id}`);
    }
  }

  useEffect(() => {
    if (itinerary) {
      setOriginalItinerary(JSON.parse(JSON.stringify(itinerary)));
    }
  }, [itinerary]);

  function SortableActivity({
    activity,
    id,
    children,
  }: {
    activity: any;
    id: string;
    children: React.ReactNode;
  }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 50 : "auto",
      cursor: isDragging ? "grabbing" : "grab", // Add grab cursor
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="relative"
      >
        {
          <div className="absolute top-2 right-2 text-gray-500 hover:text-primary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 10h16M4 14h16"
              />
            </svg>
          </div>
        }

        {children}
      </div>
    );
  }

  function handleDragEnd(event: DragEndEvent, dayIndex: number) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex =
      typeof active.id === "string" ? parseInt(active.id.split("-")[1]) : 0;
    const newIndex =
      typeof over.id === "string" ? parseInt(over.id.split("-")[1]) : 0;

    const updatedItinerary = { ...itinerary };
    const originalDay = originalItinerary?.itineraryDays[dayIndex];
    const originalTimings = originalDay?.activities.map((a) => a.timing) || [];

    const currentActivities =
      updatedItinerary.itineraryDays[dayIndex].activities;
    const reorderedActivities = arrayMove(
      currentActivities,
      oldIndex,
      newIndex
    );

    // 🍰 Assign original timings by index
    const updatedActivities = reorderedActivities.map((activity, index) => ({
      ...activity,
      timing: originalTimings[index] || activity.timing, // fallback if out of bounds
    }));

    updatedItinerary.itineraryDays[dayIndex].activities = updatedActivities;

    console.log("Updated itinerary after drag and drop:", updatedItinerary);

    setItineraryDetails(updatedItinerary);
    setHasChanges(true);
  }

  const redirectToHotelPage = () => {
    router.push(`/hotel?itinerary=${itinerary.id}`);
  };

  const redirectToHotelDetailPage = (accommodation: ItineraryAccommodation) => {
    setHotelDetails(accommodation);
    router.push(`/hotel/detail?itinerary=${itinerary.id}`);
  };

  // Check if the itinerary belongs to the current logged-in user
  const isViewingOwnItinerary =
    userId === "not null" && itineraryId === "not null";

  const colClass =
    {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
    }[itinerary.accommodation.length] || "grid-cols-4";

  const sensors = useSensors(useSensor(PointerSensor));

  const MySwal = withReactContent(Swal);

  const triggerLoginSwal = () => {
    const redirectUrl = window.location.href;
    MySwal.fire({
      title: "Not Logged In",
      html: `<p class="mb-4">Please sign in with Google to save your itinerary.</p>
             <button id="google-login-btn" class="btn btn-outline w-full">
              <img src="https://www.svgrepo.com/show/355037/google.svg" alt="Google" class="w-5 h-5 inline-block mr-2" />
              Continue with Google
             </button>`,
      icon: "warning",
      showConfirmButton: false,
      didOpen: () => {
        const btn = document.getElementById("google-login-btn");
        if (btn) {
          btn.addEventListener("click", async () => {
            await signinWithGoogleWithRedirect(redirectUrl);
            MySwal.close();
          });
        }
      },
    });
  };

  return (
    <div className="flex flex-col items-center p-8">
      {itinerary ? (
        <>
          {/* Destination */}
          <div className="mb-6 space-y-4 text-center">
            {/* Destination + Flag */}
            <h1 className="text-4xl font-extrabold text-gray-800 flex justify-center items-center gap-2">
              {getFlagEmoji(itinerary.destination)}{" "}
              {itinerary.destination || "Destination not available"}
            </h1>

            {/* Dates with Icon */}
            <p className="text-lg text-gray-600 flex justify-center items-center gap-2">
              <FaCalendarAlt className="text-primary" />
              {itinerary.startDate && itinerary.endDate
                ? `${itinerary.startDate} to ${itinerary.endDate}`
                : "Dates not available"}
            </p>

            {/* Traveler Type with Badge */}
            <div className="flex justify-center items-center gap-2 text-sm">
              <FaUserFriends className="text-secondary" />
              {itinerary.demographics?.travelerType ||
              itinerary.travelerType ? (
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
                  {itinerary.demographics?.travelerType ||
                    itinerary.travelerType}
                </span>
              ) : (
                <span className="text-gray-400 italic">
                  Traveler type not available
                </span>
              )}
            </div>
          </div>

          <div className="divider divider-neutral font-bold text-black">
            Weather Forecast
          </div>
          {/* Display weather forecast if available */}
          {weatherForecast ? (
            <div
              className="weather-forecast mt-4"
              style={{ maxHeight: "300px" }}
            >
              {/* Weather forecast container with SimpleBar */}
              <SimpleBar
                style={{ maxHeight: "100%", overflowX: "auto" }}
                autoHide={true}
              >
                <div className="flex space-x-5" style={{ minWidth: "1000px" }}>
                  {/* Map through the weather forecast and display each day's weather */}
                  {weatherForecast.map((day: any, index: number) => (
                    <DailyWeatherItem key={index} item={day} />
                  ))}
                </div>
              </SimpleBar>
            </div>
          ) : (
            <div className="text-black">No weather forecast available.</div>
          )}

          <div className="divider divider-neutral font-bold text-black">Accommodation</div>
          <div id="accommodation" className={`grid ${colClass} items-center gap-8`}>
            {itinerary &&
              itinerary.accommodation &&
              itinerary.accommodation.map((item, idx) => {
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (!isGeneratedItinerary) {
                        redirectToHotelDetailPage(item);
                      }
                    }}
                    className={`${
                      isGeneratedItinerary ? "cursor-default" : "cursor-pointer"
                    } card bg-main-2 shadow-lg m-6 text-center`}
                  >
                    <span className=" text-md font-bold p-2">{item.name}</span>
                    <figure>
                      <Image
                        width={360}
                        height={360}
                        src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/PNY_Exterior_with_Rolls_Royce.jpg/800px-PNY_Exterior_with_Rolls_Royce.jpg"
                        alt={item.name}
                        style={{ width: "auto", height: "auto" }}
                      />
                    </figure>
                    <div className="card-body">
                      <div className="text-md truncate text-black">
                        {item.hotelDescription}
                      </div>
                      <div className="text-md flex items-center justify-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="size-6"
                        >
                          <path d="M10.464 8.746c.227-.18.497-.311.786-.394v2.795a2.252 2.252 0 0 1-.786-.393c-.394-.313-.546-.681-.546-1.004 0-.323.152-.691.546-1.004ZM12.75 15.662v-2.824c.347.085.664.228.921.421.427.32.579.686.579.991 0 .305-.152.671-.579.991a2.534 2.534 0 0 1-.921.42Z" />
                          <path
                            fillRule="evenodd"
                            d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v.816a3.836 3.836 0 0 0-1.72.756c-.712.566-1.112 1.35-1.112 2.178 0 .829.4 1.612 1.113 2.178.502.4 1.102.647 1.719.756v2.978a2.536 2.536 0 0 1-.921-.421l-.879-.66a.75.75 0 0 0-.9 1.2l.879.66c.533.4 1.169.645 1.821.75V18a.75.75 0 0 0 1.5 0v-.81a4.124 4.124 0 0 0 1.821-.749c.745-.559 1.179-1.344 1.179-2.191 0-.847-.434-1.632-1.179-2.191a4.122 4.122 0 0 0-1.821-.75V8.354c.29.082.559.213.786.393l.415.33a.75.75 0 0 0 .933-1.175l-.415-.33a3.836 3.836 0 0 0-1.719-.755V6Z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="font-bold mr-2">
                          Estimated Price:{" "}
                        </span>{" "}
                        ${item.estimatedCost} {itinerary.demographics.currency}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {itinerary && itinerary.id && (
            <button
              className="btn bg-main-3 border-none text-black hover:text-black hover:bg-main-4"
              onClick={() => redirectToHotelPage()}
            >
              Add a Hotel
            </button>
          )}

          {/* Flights */}
<div className="divider divider-neutral font-bold">
  Flights Options
</div>
{flightDisplayDetails && flightDisplayDetails.length > 0 ? (
  <div className="w-full">
    {/* Sorting Controls */}
    <div className="flex flex-wrap items-center justify-between mb-4 px-4">
      <div className="text-sm text-gray-600 mb-2 md:mb-0">
        Found {flightDisplayDetails.length} flight options
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Sort by:</span>
        <select 
          className="select select-bordered select-sm w-auto bg-main-3 text-colortext-1 border-main-3
    focus:outline-none focus:ring-2 focus:ring-primary"
          onChange={(e) => handleSortChange(e.target.value)}
        >
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="duration-asc">Duration: Shortest First</option>
          <option value="duration-desc">Duration: Longest First</option>
          <option value="stops-asc">Stops: Fewest First</option>
        </select>
      </div>
    </div>
    
    {/* Flight Cards */}
    <div className="w-full overflow-x-auto">
      <div
        className="inline-flex gap-6 pb-4 px-4"
        style={{ minWidth: "max-content" }}
      >
        {sortedFlightDetails.map((flight, flightIndex) => (
          <div
            key={flightIndex}
            className="w-[400px] p-6 bg-main-3 rounded-3xl shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="text-sm text-gray-600 mb-4">
              Flight Option {flightIndex + 1}
            </div>

            <div className="space-y-4">
              <FlightLeg flightData={flight.outbound} />

              {flight.return && (
                <FlightLeg flightData={flight.return} isReturn={true} />
              )}
            </div>

            <div className="mt-4 flex justify-between items-end">
              <div className="text-sm text-gray-600">
                Total Duration: {calculateTotalDuration(flight)}
              </div>
              <div className="text-xl font-bold text-gray-900">
                {flight.price.amount} {flight.price.currency}
              </div>
            </div>
          </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p>No Available Flights</p>
        )}
        {/* Flights End */}

          <div className="divider divider-neutral font-bold text-black">Activities</div>

          {/* Itinerary Days */}
          {itinerary.itineraryDays && itinerary.itineraryDays.length > 0 ? (
            <div>
              {/* Drag and Drop Note */}
              <div className="flex items-center gap-2 mb-4 text-sm text-black text-opacity-70 bg-base-2 px-4 py-2 rounded-lg shadow-sm border border-dashed border-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 text-primary animate-bounce"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 10h16M4 14h16"
                  />
                </svg>
                You can drag and drop the activity cards within a day to reorder
                them! Remember to save your changes by clicking the &quot;Update
                Itinerary&quot; button at the bottom.
              </div>

              <ul className="timeline timeline-snap-icon max-md:timeline-compact timeline-vertical">
                {itinerary.itineraryDays.map((day, dayIndex) => (
                  <li key={dayIndex}>
                    <div className="timeline-middle">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="black"
                        className="h-5 w-5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div
                      className={`mb-10 ${
                        dayIndex % 2 === 0 ? "timeline-start" : "timeline-end"
                      } ${
                        dayIndex % 2 === 0 ? "md:text-end" : "md:text-start"
                      }`}
                    >
                      <time className="font-mono italic text-lg text-black">
                        Day {dayIndex + 1} - {day.date}
                      </time>
                      <div className="text-md font-black text-black">
                        {day.description}
                      </div>

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleDragEnd(event, dayIndex)}
                      >
                        <SortableContext
                          items={day.activities.map(
                            (a, i) => `${dayIndex}-${i}`
                          )}
                          strategy={verticalListSortingStrategy}
                        >
                          {day.activities.map((each, activityIndex) => (
                            <SortableActivity
                              key={`${dayIndex}-${activityIndex}`}
                              id={`${dayIndex}-${activityIndex}`}
                              activity={each}
                            >
                              <div
                                key={activityIndex}
                                className="card bg-main-3 shadow-lg m-6 text-center"
                              >
                                <span className="font-bold p-2">
                                  {each.name}
                                </span>
                                <figure>
                                  <Image
                                    width={360}
                                    height={180}
                                    src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Sydney_%28AU%29%2C_Bondi_Beach_--_2019_--_2354.jpg/640px-Sydney_%28AU%29%2C_Bondi_Beach_--_2019_--_2354.jpg"
                                    alt={each.name}
                                    style={{ width: "auto", height: "auto" }}
                                  />
                                </figure>
                                <div className="card-body">
                                  <div className="text-md ">{each.details}</div>
                                  <div className="text-md flex items-center justify-center">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                      className="size-6"
                                    >
                                      <path d="M10.464 8.746c.227-.18.497-.311.786-.394v2.795a2.252 2.252 0 0 1-.786-.393c-.394-.313-.546-.681-.546-1.004 0-.323.152-.691.546-1.004ZM12.75 15.662v-2.824c.347.085.664.228.921.421.427.32.579.686.579.991 0 .305-.152.671-.579.991a2.534 2.534 0 0 1-.921.42Z" />
                                      <path
                                        fillRule="evenodd"
                                        d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v.816a3.836 3.836 0 0 0-1.72.756c-.712.566-1.112 1.35-1.112 2.178 0 .829.4 1.612 1.113 2.178.502.4 1.102.647 1.719.756v2.978a2.536 2.536 0 0 1-.921-.421l-.879-.66a.75.75 0 0 0-.9 1.2l.879.66c.533.4 1.169.645 1.821.75V18a.75.75 0 0 0 1.5 0v-.81a4.124 4.124 0 0 0 1.821-.749c.745-.559 1.179-1.344 1.179-2.191 0-.847-.434-1.632-1.179-2.191a4.122 4.122 0 0 0-1.821-.75V8.354c.29.082.559.213.786.393l.415.33a.75.75 0 0 0 .933-1.175l-.415-.33a3.836 3.836 0 0 0-1.719-.755V6Z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                    <span className="font-bold mr-2">
                                      Estimated Price:{" "}
                                    </span>{" "}
                                    ${each.estimatedCost}{" "}
                                    {itinerary.demographics.currency}
                                  </div>
                                  <div className="text-md flex items-center justify-center">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                      className="size-6"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                    <span className="font-bold mr-2">
                                      Timings:{" "}
                                    </span>{" "}
                                    {each.timing}
                                  </div>
                                </div>
                              </div>
                            </SortableActivity>
                          ))}
                        </SortableContext>
                      </DndContext>
                    </div>
                    <hr />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>No itinerary days available</p>
          )}

          <div className="divider divider-neutral font-bold text-black">
            Additional Information
          </div>

          {/* Estimated Total Cost */}
          {itinerary.estimatedTotalCost ? (
            <h3 className="text-lg font-black text-black">
              Estimated Total Cost: {itinerary.estimatedTotalCost}{" "}
              {itinerary.demographics.currency}
            </h3>
          ) : (
            <h3>Estimated Total Cost not available</h3>
          )}

          {/* Important Notes */}
          {itinerary.importantNotes && itinerary.importantNotes.length > 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-black">
              <h3 className="text-lg font-black">Important Notes:</h3>
              <ul>
                {itinerary.importantNotes.map((note, index) => (
                  <li key={index}>
                    {index + 1}. {note}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-center">No important notes available</p>
          )}
          {/* Conditionally render the "Save Itinerary" or "Update Itinerary" button */}
          <div className="mt-6 text-black">
            <button
              className="btn disabled:text-black disabled:text-opacity-40 bg-blue-600 border-none text-white hover:text-white hover:bg-blue-700 shadow-md hover:shadow-lg transition-all"
              onClick={() => {
                if (!user && !isViewingOwnItinerary) {
                  triggerLoginSwal();
                } else {
                  if (isViewingOwnItinerary) {
                    UpdateItinerary();
                  } else {
                    SaveItinerary();
                  }
                }
              }}
              disabled={loading || (isViewingOwnItinerary && !hasChanges)}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="loading loading-spinner"></span>
                  {isViewingOwnItinerary ? "Updating..." : "Saving..."}
                </span>
              ) : isViewingOwnItinerary ? (
                "Update Itinerary"
              ) : (
                "Save Itinerary"
              )}
            </button>
          </div>
        </>
      ) : (
        <p>No itinerary available</p>
      )}
    </div>
  );
}
