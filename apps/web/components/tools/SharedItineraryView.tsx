"use client";
/**
 * SharedItineraryView (T2.5 tools UI) — the read-only renderer behind
 * /shared/<token>, fed by GET /api/tools/shares/:token.
 *
 * The response's `itinerary` field is the camelCase aggregate as stored by
 * itinerary-service (see packages/shared ItineraryPayloadSchema). It is
 * validated with that shared schema before display; a payload that does not
 * match shows a graceful "can't be displayed" card instead of crashing.
 * Weather arrives as verbatim JSONB (`weatherForecast`), so it is narrowed
 * defensively and simply skipped when it is not the expected day-array shape.
 */
// Subpath contract imports, not the @smart/shared barrel (browser safety —
// see packages/api-client/src/client.ts).
import { ItineraryPayloadSchema } from "@smart/shared/src/dto/itineraries";
import type { SharedItineraryResponse } from "@smart/shared/src/dto/tools";

/** One weather day as rendered — every field tolerated (unknown JSONB). */
interface WeatherDayView {
  date: string;
  condition: string;
  temperatureCelsius: number;
}

/** Narrow the verbatim weather JSONB into day rows, or null when it is not one. */
function readWeatherDays(itineraryWeather: unknown): WeatherDayView[] | null {
  // Accept both a bare day array and the `{ forecast: [...] }` wrapper.
  const days = Array.isArray(itineraryWeather)
    ? itineraryWeather
    : isRecord(itineraryWeather) && Array.isArray(itineraryWeather.forecast)
      ? itineraryWeather.forecast
      : null;
  if (!days) {
    return null;
  }
  const weatherDays: WeatherDayView[] = [];
  for (const day of days) {
    if (!isRecord(day) || typeof day.date !== "string" || typeof day.condition !== "string") {
      continue; // skip malformed entries rather than failing the whole view
    }
    weatherDays.push({
      date: day.date,
      condition: day.condition,
      temperatureCelsius: typeof day.temperature_celsius === "number" ? day.temperature_celsius : 0,
    });
  }
  return weatherDays.length > 0 ? weatherDays : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default function SharedItineraryView({ shared }: { shared: SharedItineraryResponse }) {
  const parsed = ItineraryPayloadSchema.safeParse(shared.itinerary);
  if (!parsed.success) {
    return (
      <div className="card bg-main-2 shadow-md">
        <div className="card-body p-6 text-center">
          <h2 className="card-title justify-center text-black">Itinerary can&apos;t be displayed</h2>
          <p className="text-colortext-2">
            The share link resolved, but the itinerary data behind it is in an unexpected
            format. Ask the sender to share it again.
          </p>
        </div>
      </div>
    );
  }

  const itinerary = parsed.data;
  const currency = itinerary.demographics.currency || "";
  const weatherDays = readWeatherDays(itinerary.weatherForecast);

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <span className="badge badge-ghost">Read-only shared itinerary</span>
        <h1 className="text-3xl font-extrabold text-black">{itinerary.destination || "Trip"}</h1>
        <p className="text-colortext-2">
          {itinerary.startDate} to {itinerary.endDate}
          {itinerary.demographics.travelerType ? ` · ${itinerary.demographics.travelerType}` : ""}
        </p>
        {shared.sharedAt && (
          <p className="text-xs text-colortext-3">
            Shared on {new Date(shared.sharedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Weather */}
      {weatherDays && (
        <section className="w-full max-w-3xl">
          <div className="divider font-bold text-black">Weather Forecast</div>
          <div className="flex flex-wrap justify-center gap-4">
            {weatherDays.map((day) => (
              <div key={day.date} className="card bg-main-2 shadow-sm">
                <div className="card-body p-4 text-center">
                  <h3 className="text-sm font-semibold text-black">{day.date}</h3>
                  <p className="text-colortext-2">{day.condition}</p>
                  <p className="text-xl font-bold text-black">{day.temperatureCelsius}°C</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Accommodation */}
      {itinerary.accommodation.length > 0 && (
        <section className="w-full max-w-3xl">
          <div className="divider font-bold text-black">Accommodation</div>
          <div className="grid gap-4 md:grid-cols-2">
            {itinerary.accommodation.map((stay, index) => (
              <div key={stay.id ?? index} className="card bg-main-2 shadow-sm">
                <div className="card-body p-4">
                  <h3 className="card-title text-base text-black">{stay.name}</h3>
                  {stay.hotelDescription && (
                    <p className="text-sm text-colortext-2">{stay.hotelDescription}</p>
                  )}
                  {stay.estimatedCost != null && (
                    <p className="text-sm font-semibold text-black">
                      Estimated price: ${stay.estimatedCost} {currency}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Day-by-day plan */}
      <section className="w-full max-w-3xl">
        <div className="divider font-bold text-black">Day-by-day Plan</div>
        {itinerary.itineraryDays.length === 0 ? (
          <p className="text-center text-colortext-2">This itinerary has no days planned.</p>
        ) : (
          <ul className="timeline timeline-snap-icon max-md:timeline-compact timeline-vertical">
            {itinerary.itineraryDays.map((day, dayIndex) => (
              <li key={day.id ?? dayIndex}>
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
                  className={`mb-6 ${dayIndex % 2 === 0 ? "timeline-start md:text-end" : "timeline-end md:text-start"}`}
                >
                  <time className="font-mono italic text-black">
                    Day {dayIndex + 1} — {day.date}
                    {day.location ? ` · ${day.location}` : ""}
                  </time>
                  {day.description && <div className="font-semibold text-black">{day.description}</div>}
                  <div className="flex flex-col gap-2">
                    {day.activities.map((activity, activityIndex) => (
                      <div key={activity.id ?? activityIndex} className="card bg-main-3 shadow-sm">
                        <div className="card-body p-3">
                          <span className="font-bold text-black">{activity.name}</span>
                          {activity.details && (
                            <span className="text-sm text-colortext-2">{activity.details}</span>
                          )}
                          <span className="text-xs text-colortext-2">
                            {activity.timing && `Timing: ${activity.timing}`}
                            {activity.timing && activity.estimatedCost != null && " · "}
                            {activity.estimatedCost != null &&
                              `Estimated cost: $${activity.estimatedCost} ${currency}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <hr />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Notes + total cost */}
      <section className="w-full max-w-3xl text-center">
        <div className="divider font-bold text-black">Additional Information</div>
        <h3 className="text-lg font-black text-black">
          Estimated Total Cost: {itinerary.estimatedTotalCost} {currency}
        </h3>
        {itinerary.importantNotes.length > 0 && (
          <>
            <h4 className="mt-3 font-black text-black">Important Notes:</h4>
            <ul className="mt-1 list-inside list-decimal text-left inline-block text-black">
              {itinerary.importantNotes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
