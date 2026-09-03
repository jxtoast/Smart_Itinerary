"use client";
import { useState, useEffect} from "react";
import { useParams } from "next/navigation";
import ItineraryTimeline from "../../ItineraryTimeline";
import { Itinerary } from '@/types/Itinerary';
import { ItineraryService } from "@/services/ItineraryService";
import { parse} from 'date-fns';

export default function ItineraryPage()
{
    const [loading, setLoading] = useState<boolean>(false);
    const [itinerary, setItinerary] = useState<Itinerary | null>(null);
    const [weatherForecast, setWeatherForecast] = useState<any | null>(null); // State to store weather forecast

    // Use useParams to get dynamic params in Next.js 13+ App Directory
    const { userId, itineraryId } = useParams(); // Get both userId and itineraryId from the URL


    function parseTime(timeString: string): Date {
      // Time format is "9:00 AM - 12:00 PM"
      // Extract start time from the string and parse it as Date object
      const startTime = timeString.split(' - ')[0]; // "9:00 AM"
      
      // Parse the start time into a Date object
      return parse(startTime, 'h:mm a', new Date());
    }


    useEffect(() => {
        if (!userId || !itineraryId) {
            return;
        }
        const fetchItinerary = async () => {
        setLoading(true);
        try {

            const result = await ItineraryService.getItinerary(itineraryId as string);
            console.log('result', result);
            if (result) {

                // Sort activities based on their timing (earliest to latest)
                const sortedItineraryDays = result.itineraryDays.map((day: { activities: { timing: string }[] }) => {
                    const sortedActivities = day.activities.sort((a: { timing: string }, b: { timing: string }) => {
                    const timeA = parseTime(a.timing); 
                    const timeB = parseTime(b.timing);
                    return timeA.getTime() - timeB.getTime(); // Compare times
                    });
                    return {
                    ...day,
                    activities: sortedActivities,
                    };
                });

                // Set sorted itinerary
                setItinerary({
                    ...result,
                    itineraryDays: sortedItineraryDays, // Overwrite the days with sorted activities
                });

                console.log('itinerary', result);

                setWeatherForecast(result.weather_forecast);
            } else {
                setItinerary(null);
            }
            
        } catch (error) {
            console.error("Error fetching itinerary:", error);
        } finally {
            setLoading(false);
        }
        };
        fetchItinerary();
    }, [userId, itineraryId]); // Run when either userId or itineraryId changes

    if (loading) {
        return (
        <div className="absolute inset-0 w-full h-full bg-gray-900 bg-opacity-50 flex items-center justify-center z-10">
            <span className="loading loading-spinner text-white text-2xl"></span>
        </div>
        );
    }

    return (
        <>
        <div>
            {itinerary ? (
            <div>
                <ItineraryTimeline itinerary={itinerary} weatherForecast={weatherForecast} userId="not null" itineraryId="not null" flightDisplayDetails={[]} isGeneratedItinerary={false}/>
            </div>
            ) : (
            <div>Error viewing itinerary. Please try again later.</div>
            )}
        </div>
        </>
    );
}
