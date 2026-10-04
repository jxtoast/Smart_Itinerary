/**
 * Offline smoke test for @smart/shared contracts/adapters (no infra needed).
 * Run: npm run smoke --workspace @smart/shared
 */
import {
  CreateItineraryRequestSchema,
  EVENT_EXCHANGE,
  HotelDtoSchema,
  MeResponseSchema,
  normalizeWeatherForecast,
  parseBody,
  PlanRequestSchema,
  reminderDelayMs,
  ROUTING_KEYS,
  signDevToken,
  createTokenVerifier,
  UuidLikeSchema,
} from "../src/server";

async function main(): Promise<void> {
  // 1. DTO validation round-trips
  const me = parseBody(MeResponseSchema, {
    user: { id: "1b9472e1-a85e-43bf-9898-6f44e2b20809", name: "Test User" },
  });
  console.log("MeResponse ok:", me.user.name);

  const create = parseBody(CreateItineraryRequestSchema, {
    userId: "1b9472e1-a85e-43bf-9898-6f44e2b20809",
    itinerary: {
      sourceCountry: "Singapore",
      destination: "Tokyo",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      estimatedTotalCost: 2450,
      importantNotes: ["Bring passport"],
      demographics: { currency: "JPY", budgetMin: 1500, budgetMax: 3000, travelerType: "couple", purpose: "leisure" },
      accommodation: [{ name: "Shinjuku Grand Hotel", estimatedCost: 180 }],
      itineraryDays: [
        { date: "2026-10-01", location: "Shibuya", description: "Arrival", activities: [{ name: "Crossing", estimatedCost: 0 }] },
      ],
    },
    weatherForecast: { forecast: [] },
  });
  console.log("CreateItinerary ok:", create.itinerary.destination);

  const plan = parseBody(PlanRequestSchema, {
    form: {
      source: "Singapore", destination: "Tokyo", startDate: "2026-10-01", endDate: "2026-10-05",
      minBudget: 1500, maxBudget: 3000, preferences: ["food"], travelGroup: "couple", numberPeople: "2",
    },
    flightSearchCriteria: { origin_country: "SIN", destination_country: "NRT", pax: 2 },
  });
  console.log("PlanRequest ok:", plan.form.destination);

  const hotel = parseBody(HotelDtoSchema, {
    name: "Shinjuku Grand Hotel",
    address: "1-1 Shinjuku, Tokyo",
    description: "Central hotel near the station.",
    image_url: "https://example.com/hotel.jpg",
    price: "$180",
    rating: 4.5,
  });
  console.log("HotelDto ok:", hotel.name);

  // 2. Reminder scheduling math (full ISO timestamps => timezone-independent)
  const now = new Date();
  const startIso = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const delay = reminderDelayMs(startIso, now);
  const expected = 2 * 24 * 60 * 60 * 1000; // 3 days out - 24h
  if (Math.abs(delay - expected) > 5000) throw new Error(`reminderDelayMs wrong: ${delay}`);
  console.log("reminderDelayMs ok:", Math.round(delay / 3600000), "h");

  // 3. Dev-token sign/verify round trip (TOKEN_VERIFY_MODE=dev)
  process.env.TOKEN_VERIFY_MODE = "dev";
  const token = await signDevToken({ sub: "1b9472e1-a85e-43bf-9898-6f44e2b20809", email: "t@example.com", name: "Test" });
  const claims = await createTokenVerifier({ mode: "dev" }).verify(token);
  if (claims.sub !== "1b9472e1-a85e-43bf-9898-6f44e2b20809") throw new Error("token round trip failed");
  console.log("dev token round trip ok, sub:", claims.sub);

  // 4. Topology constants present
  if (!EVENT_EXCHANGE || !ROUTING_KEYS.itineraryCreated) throw new Error("topology constants missing");
  console.log("topology constants ok:", EVENT_EXCHANGE, Object.values(ROUTING_KEYS).join(", "));

  // 5. Weather normalization — every container shape ever stored must narrow
  //    to the same canonical WeatherDay rows (see dto/gemini.ts).
  const currentModelShape = [
    { forecast: [
      { date: "2026-10-04", condition: "thunderstorm", temperature: { max_celsius: 32, min_celsius: 24 } },
    ], location: "Malaysia" },
  ];
  const monolithShape = [
    { date: "2026-10-04", location: "Tokyo", temperature_celsius: 28, condition: "clear sky" },
  ];
  const current = normalizeWeatherForecast(currentModelShape);
  const legacy = normalizeWeatherForecast(monolithShape);
  if (!current?.[0] || current[0].temperatureCelsius !== 32 || current[0].temperatureMinCelsius !== 24) {
    throw new Error("normalizeWeatherForecast broke on the current wrapper shape");
  }
  if (!legacy?.[0] || legacy[0].temperatureCelsius !== 28 || legacy[0].temperatureMinCelsius !== undefined) {
    throw new Error("normalizeWeatherForecast broke on the monolith scalar shape");
  }
  if (normalizeWeatherForecast({ unparseable: true }) !== null) {
    throw new Error("normalizeWeatherForecast should return null on garbage");
  }
  console.log("weather normalization ok: wrapper + scalar + garbage cases");

  // 6. UuidLikeSchema — must accept Cognito subs (UUID-shaped, but the
  //    variant nibble is often not RFC-compliant) while still rejecting
  //    non-UUID garbage; Postgres's uuid column accepts the same shapes.
  const cognitoSub = "594ad51c-d081-709d-56fa-1164e582c8be"; // variant nibble 5 — real observed sub
  if (!UuidLikeSchema.safeParse(cognitoSub).success) {
    throw new Error("UuidLikeSchema rejected a real Cognito sub");
  }
  if (!UuidLikeSchema.safeParse("1b9472e1-a85e-43bf-9898-6f44e2b20809").success) {
    throw new Error("UuidLikeSchema rejected a fully RFC-compliant uuid");
  }
  if (UuidLikeSchema.safeParse("dev-user").success) {
    throw new Error("UuidLikeSchema accepted a non-UUID string");
  }
  console.log("UuidLikeSchema ok: cognito sub + rfc uuid + garbage");

  console.log("\n@smart/shared smoke test: ALL GREEN");
}

main().catch((error) => {
  console.error("SMOKE FAILED:", error);
  process.exit(1);
});
