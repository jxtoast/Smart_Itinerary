// components/FlightLeg.tsx
import { Plane, ChevronDown, ChevronUp } from 'lucide-react';
import { FlightDisplayDetails } from '@/types/FlightDisplayDetails'
import { useState } from 'react';

const FlightLeg = ({ 
  flightData, 
  isReturn = false 
}: {
  flightData: NonNullable<FlightDisplayDetails['outbound']>;
  isReturn?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { segments, totalDuration, totalStops } = flightData;
  const mainSegment = segments[0];
  
  const hasConnections = segments.length > 1;

  return (
    <div 
      className={`bg-white rounded-2xl shadow-sm p-4 transition-all
        ${hasConnections ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={() => hasConnections && setIsExpanded(!isExpanded)}
    >
      {/* Main Flight Info */}
      <div>
        {/* Airline Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-yellow-400 rounded-full w-8 h-8 flex items-center justify-center">
            <Plane className={`text-white ${isReturn ? 'rotate-180' : ''}`} size={20} />
          </div>
          <div>
            <div className="font-medium">{mainSegment.airlineName}</div>
            <div className="text-sm text-gray-500">{mainSegment.flightNumber}</div>
          </div>
        </div>

        {/* Flight Times */}
        <div className="flex justify-between items-center mb-4">
          <div className="text-2xl font-bold">
            {new Date(segments[0].departureInfo.datetime).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            })}
          </div>
          <div className="flex flex-col items-center">
            <Plane className="text-gray-400 rotate-90" size={20} />
            <span className="text-sm text-gray-500">{totalDuration}</span>
          </div>
          <div className="text-2xl font-bold">
            {new Date(segments[segments.length - 1].arrivalInfo.datetime).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            })}
          </div>
        </div>

        {/* Origin/Destination */}
        <div className="flex justify-between text-sm mb-4">
          <div>
            <span className="font-medium">{segments[0].departureInfo.airport}</span>
            <span className="text-gray-500"> ({segments[0].departureInfo.cityCode})</span>
          </div>
          <div>
            <span className="font-medium">{segments[segments.length - 1].arrivalInfo.airport}</span>
            <span className="text-gray-500"> ({segments[segments.length - 1].arrivalInfo.cityCode})</span>
          </div>
        </div>

        {/* Flight Details */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {totalStops === 0 ? 'Nonstop' : `${totalStops} stop(s)`}
            {hasConnections && (
              <span className="flex items-center gap-1">
                {` · ${segments.length} flights `}
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Connecting Flights Details */}
      {hasConnections && isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          {segments.map((segment, index) => (
            <div 
              key={segment.flightNumber} 
              className={`${index > 0 ? 'mt-4' : ''}`}
            >
              <div className="flex justify-between items-center text-sm">
                <div className="space-y-1">
                  <div className="font-medium">Flight {index + 1}: {segment.flightNumber}</div>
                  <div className="text-gray-500">{segment.airlineName}</div>
                  <div>
                    {new Date(segment.departureInfo.datetime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })} 
                    {' '}{segment.departureInfo.airport} ({segment.departureInfo.cityCode})
                  </div>
                  <div>
                    {new Date(segment.arrivalInfo.datetime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })} 
                    {' '}{segment.arrivalInfo.airport} ({segment.arrivalInfo.cityCode})
                  </div>
                </div>
                <div className="text-gray-500">
                  {segment.aircraftType}
                </div>
              </div>
              
              {/* Connection information */}
              {index < segments.length - 1 && (
                <div className="mt-2 text-sm text-orange-600">
                  Connection time: {calculateConnectionTime(
                    segment.arrivalInfo.datetime,
                    segments[index + 1].departureInfo.datetime
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper function to calculate connection time
const calculateConnectionTime = (arrival: string, departure: string) => {
  const arrivalTime = new Date(arrival);
  const departureTime = new Date(departure);
  const diffMinutes = Math.round((departureTime.getTime() - arrivalTime.getTime()) / (1000 * 60));
  
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
};

export default FlightLeg;