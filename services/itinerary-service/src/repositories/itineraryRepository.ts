import type { Pool } from "pg";
import {
  CreateItineraryRequest,
  TransactionExecutor,
  query,
  queryOne,
} from "@smart/shared/src/server";

/**
 * Itinerary Service repositories — every SQL statement of this service lives
 * here (diagram: "Amazon RDS (Itinerary DB)"; locally the itinerary-db
 * container, DDL in db/init/itinerary-service.sql).
 *
 * Tables owned (matching that DDL):
 *   itinerary · itinerary_demographics · itinerary_accomodation (historical
 *   misspelling kept on purpose) · itinerary_day · itinerary_activity
 *
 * All child tables reference their parent with ON DELETE CASCADE, so deleting
 * the itinerary row removes demographics, accommodation, days and activities
 * in one statement. Write cascades (save/update) receive a TransactionExecutor
 * so the route handler can run them inside a single withTransaction block —
 * either every row of an itinerary is stored, or none of it is.
 */

// ---------------------------------------------------------------------------
// Row types — one per table, snake_case as Postgres returns them.
// Type aliases (not interfaces) so they satisfy pg's QueryResultRow index
// signature. NUMERIC columns arrive as strings (see numericToNumber).
// ---------------------------------------------------------------------------

type ItineraryRow = {
  id: string;
  user_id: string;
  source: string;
  destination: string;
  start_date: Date | string;
  end_date: Date | string;
  estimated_total_cost: string | number;
  /** JSON-encoded string[] of important notes. */
  notes: string | null;
  /** jsonb column — pg hands this back already parsed. */
  weather_forecast: unknown;
  created_at: Date | string;
};

type DemographicsRow = {
  id: string | number;
  itinerary_id: string;
  currency: string;
  budget_min: string | number | null;
  budget_max: string | number | null;
  travel_type: string;
  purpose: string;
};

type AccommodationRow = {
  id: string | number;
  itinerary_id: string;
  name: string;
  estimated_cost: string | number | null;
  image_url: string | null;
  hotel_description: string | null;
};

type DayRow = {
  id: string | number;
  itinerary_id: string;
  date: Date | string;
  location: string;
  description: string;
};

type ActivityRow = {
  id: string | number;
  itinerary_day_id: string | number;
  name: string;
  details: string;
  estimated_cost: string | number | null;
  image_url: string | null;
  timing: string;
};

// ---------------------------------------------------------------------------
// Mapping helpers — Postgres naming/types to the app's camelCase API shape.
// ---------------------------------------------------------------------------

/**
 * pg returns NUMERIC/decimal columns as strings to avoid losing precision.
 * The rest of the app works with plain numbers, so convert explicitly.
 */
function numericToNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * pg returns DATE columns as JS Date objects set to local midnight. Naively
 * calling toISOString() shifts the calendar day in timezones behind UTC, so
 * rebuild the YYYY-MM-DD string from the local date components instead.
 */
function toDateString(value: Date | string): string {
  if (typeof value === "string") return value;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The `notes` column holds a JSON-encoded string[] (see the DDL). Legacy rows
 * might contain a plain unparseable string — fall back to wrapping it.
 */
function parseNotes(notes: string | null): string[] {
  if (!notes) return [];
  try {
    const parsed: unknown = JSON.parse(notes);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [notes];
  }
}

/** itinerary row → camelCase; `source` keeps its historical column name. */
function mapItineraryRow(row: ItineraryRow) {
  return {
    id: row.id,
    userId: row.user_id, // snake_case → camelCase
    sourceCountry: row.source,
    destination: row.destination,
    startDate: toDateString(row.start_date),
    endDate: toDateString(row.end_date),
    estimatedTotalCost: numericToNumber(row.estimated_total_cost) ?? 0,
    importantNotes: parseNotes(row.notes),
    weatherForecast: row.weather_forecast, // jsonb arrives already parsed
    createdAt: row.created_at,
  };
}

function mapDemographicsRow(row: DemographicsRow) {
  return {
    currency: row.currency,
    budgetMin: numericToNumber(row.budget_min), // snake_case → camelCase
    budgetMax: numericToNumber(row.budget_max),
    travelerType: row.travel_type, // travel_type → travelerType (API naming)
    purpose: row.purpose,
  };
}

function mapAccommodationRow(row: AccommodationRow) {
  return {
    id: Number(row.id), // bigint arrives as a string; the API uses numbers
    itineraryId: row.itinerary_id, // snake_case → camelCase
    name: row.name,
    estimatedCost: numericToNumber(row.estimated_cost),
    imageUrl: row.image_url ?? "",
    hotelDescription: row.hotel_description ?? "",
  };
}

function mapDayRow(row: DayRow) {
  return {
    id: Number(row.id), // bigint arrives as a string; the API uses numbers
    itineraryId: row.itinerary_id, // snake_case → camelCase
    date: toDateString(row.date),
    location: row.location,
    description: row.description,
  };
}

function mapActivityRow(row: ActivityRow) {
  return {
    id: Number(row.id), // bigint arrives as a string; the API uses numbers
    itineraryDayId: Number(row.itinerary_day_id), // snake_case → camelCase
    name: row.name,
    details: row.details,
    estimatedCost: numericToNumber(row.estimated_cost),
    imageUrl: row.image_url ?? "",
    timing: row.timing,
  };
}

// ---------------------------------------------------------------------------
// Write path — the save/update cascade. Every function takes a
// TransactionExecutor so callers wrap them in withTransaction.
// ---------------------------------------------------------------------------

/** Insert the itinerary row itself; RETURNING id gives the generated uuid. */
async function insertItinerary(
  executor: TransactionExecutor,
  request: CreateItineraryRequest
): Promise<string> {
  const row = await executor.queryOne<{ id: string }>(
    `INSERT INTO itinerary
       (user_id, source, destination, start_date, end_date,
        estimated_total_cost, notes, weather_forecast)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      request.userId,
      request.itinerary.sourceCountry,
      request.itinerary.destination,
      request.itinerary.startDate,
      request.itinerary.endDate,
      request.itinerary.estimatedTotalCost,
      // notes stays a JSON-encoded string[]; weather forecast is stored
      // verbatim as jsonb, exactly like the monolith did.
      JSON.stringify(request.itinerary.importantNotes),
      JSON.stringify(request.weatherForecast ?? null),
    ]
  );
  if (!row) throw new Error("INSERT INTO itinerary returned no id");
  return row.id;
}

/**
 * Update the itinerary row; RETURNING id doubles as the existence check —
 * no matched row means the caller turns this into a 404 (and the surrounding
 * withTransaction rolls the cascade back).
 */
async function updateItineraryRow(
  executor: TransactionExecutor,
  itineraryId: string,
  request: CreateItineraryRequest
): Promise<string | null> {
  const row = await executor.queryOne<{ id: string }>(
    `UPDATE itinerary
        SET user_id = $2, source = $3, destination = $4, start_date = $5,
            end_date = $6, estimated_total_cost = $7, notes = $8,
            weather_forecast = $9
      WHERE id = $1
      RETURNING id`,
    [
      itineraryId,
      request.userId,
      request.itinerary.sourceCountry,
      request.itinerary.destination,
      request.itinerary.startDate,
      request.itinerary.endDate,
      request.itinerary.estimatedTotalCost,
      JSON.stringify(request.itinerary.importantNotes),
      JSON.stringify(request.weatherForecast ?? null),
    ]
  );
  return row?.id ?? null;
}

/**
 * Demographics is 1:1 with itinerary. UPDATE-first keeps an existing row's id
 * (the monolith updated in place); the INSERT branch covers itineraries that
 * were somehow saved without demographics.
 */
async function upsertDemographics(
  executor: TransactionExecutor,
  itineraryId: string,
  demographics: CreateItineraryRequest["itinerary"]["demographics"]
): Promise<void> {
  const existing = await executor.queryOne<{ id: string | number }>(
    `SELECT id FROM itinerary_demographics WHERE itinerary_id = $1`,
    [itineraryId]
  );
  if (existing) {
    await executor.query(
      `UPDATE itinerary_demographics
          SET currency = $2, budget_min = $3, budget_max = $4,
              travel_type = $5, purpose = $6
        WHERE id = $1`,
      [
        existing.id,
        demographics.currency,
        demographics.budgetMin ?? null,
        demographics.budgetMax ?? null,
        demographics.travelerType,
        demographics.purpose,
      ]
    );
    return;
  }
  await executor.query(
    `INSERT INTO itinerary_demographics
       (itinerary_id, currency, budget_min, budget_max, travel_type, purpose)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      itineraryId,
      demographics.currency,
      demographics.budgetMin ?? null,
      demographics.budgetMax ?? null,
      demographics.travelerType,
      demographics.purpose,
    ]
  );
}

/**
 * Replace-not-diff: the monolith updated accommodation rows one by one and
 * silently dropped newly added entries (they had no id to match). Deleting
 * all rows for this itinerary and re-inserting the payload is always
 * consistent with what the user sees in the UI.
 */
async function replaceAccommodations(
  executor: TransactionExecutor,
  itineraryId: string,
  accommodation: CreateItineraryRequest["itinerary"]["accommodation"]
): Promise<void> {
  await executor.query(
    `DELETE FROM itinerary_accomodation WHERE itinerary_id = $1`,
    [itineraryId]
  );
  for (const item of accommodation) {
    await executor.query(
      `INSERT INTO itinerary_accomodation
         (itinerary_id, name, estimated_cost, image_url, hotel_description)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        itineraryId,
        item.name,
        item.estimatedCost ?? null,
        item.imageUrl ?? null,
        item.hotelDescription ?? null,
      ]
    );
  }
}

/**
 * Days are replaced wholesale too; their activities cascade (ON DELETE
 * CASCADE in the DDL), so stale activities disappear with their day. Each
 * inserted day's RETURNING id is what links its activities back to it.
 */
async function replaceDaysWithActivities(
  executor: TransactionExecutor,
  itineraryId: string,
  days: CreateItineraryRequest["itinerary"]["itineraryDays"]
): Promise<void> {
  await executor.query(`DELETE FROM itinerary_day WHERE itinerary_id = $1`, [
    itineraryId,
  ]);
  for (const day of days) {
    const insertedDay = await executor.queryOne<{ id: string | number }>(
      `INSERT INTO itinerary_day (itinerary_id, date, location, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [itineraryId, day.date, day.location, day.description]
    );
    if (!insertedDay) throw new Error("INSERT INTO itinerary_day returned no id");
    for (const activity of day.activities) {
      await executor.query(
        `INSERT INTO itinerary_activity
           (itinerary_day_id, name, details, estimated_cost, image_url, timing)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          insertedDay.id,
          activity.name,
          activity.details,
          activity.estimatedCost ?? null,
          activity.imageUrl ?? null,
          activity.timing,
        ]
      );
    }
  }
}

/** All child rows of one itinerary, in cascade order. */
async function saveChildren(
  executor: TransactionExecutor,
  itineraryId: string,
  request: CreateItineraryRequest
): Promise<void> {
  await upsertDemographics(executor, itineraryId, request.itinerary.demographics);
  await replaceAccommodations(executor, itineraryId, request.itinerary.accommodation);
  await replaceDaysWithActivities(executor, itineraryId, request.itinerary.itineraryDays);
}

/**
 * Save a brand-new itinerary plus all children. Callers must run this inside
 * withTransaction — a failure halfway (e.g. a bad date) rolls back the whole
 * aggregate instead of leaving orphaned children behind.
 */
export async function saveItineraryWithChildren(
  executor: TransactionExecutor,
  request: CreateItineraryRequest
): Promise<string> {
  const itineraryId = await insertItinerary(executor, request);
  await saveChildren(executor, itineraryId, request);
  return itineraryId;
}

/**
 * Update an existing itinerary and re-sync its children. Returns the id, or
 * null when no itinerary with that id exists (caller decides the 404).
 */
export async function updateItineraryWithChildren(
  executor: TransactionExecutor,
  itineraryId: string,
  request: CreateItineraryRequest
): Promise<string | null> {
  const updatedId = await updateItineraryRow(executor, itineraryId, request);
  if (!updatedId) return null;
  await saveChildren(executor, itineraryId, request);
  return updatedId;
}

// ---------------------------------------------------------------------------
// Read path — these take the Pool directly (single statements, no cascade).
// ---------------------------------------------------------------------------

/**
 * Fetch the full nested aggregate for GET /:id: the itinerary row plus
 * demographics, accommodation, days and each day's activities, all mapped to
 * the camelCase shape the frontend's `Itinerary` type expects.
 */
export async function getItineraryAggregate(pool: Pool, itineraryId: string) {
  const itineraryRow = await queryOne<ItineraryRow>(
    pool,
    `SELECT * FROM itinerary WHERE id = $1`,
    [itineraryId]
  );
  if (!itineraryRow) return null;

  const demographicsRow = await queryOne<DemographicsRow>(
    pool,
    `SELECT * FROM itinerary_demographics WHERE itinerary_id = $1`,
    [itineraryId]
  );
  const accommodationRows = await query<AccommodationRow>(
    pool,
    `SELECT * FROM itinerary_accomodation WHERE itinerary_id = $1 ORDER BY id`,
    [itineraryId]
  );
  const dayRows = await query<DayRow>(
    pool,
    `SELECT * FROM itinerary_day WHERE itinerary_id = $1 ORDER BY date`,
    [itineraryId]
  );

  // One query per day (N+1) on purpose: it mirrors the monolith's structure
  // and stays trivially readable; itineraries only ever have a handful of days.
  const itineraryDays = [];
  for (const dayRow of dayRows) {
    const activityRows = await query<ActivityRow>(
      pool,
      `SELECT * FROM itinerary_activity WHERE itinerary_day_id = $1 ORDER BY id`,
      [dayRow.id]
    );
    itineraryDays.push({
      ...mapDayRow(dayRow),
      activities: activityRows.map(mapActivityRow),
    });
  }

  return {
    ...mapItineraryRow(itineraryRow),
    // {} rather than null keeps aggregate.demographics.currency safe for
    // consumers when a pre-demographics row sneaks in.
    demographics: demographicsRow ? mapDemographicsRow(demographicsRow) : {},
    accommodation: accommodationRows.map(mapAccommodationRow),
    itineraryDays,
  };
}

/**
 * List a user's itineraries for the profile page. Rows keep the database's
 * snake_case keys here — that is exactly the shape the shared
 * ListItinerariesResponseSchema describes — except dates, which are
 * normalized to YYYY-MM-DD strings because pg returns Date objects.
 */
export async function listItinerariesByUser(pool: Pool, userId: string) {
  const rows = await query<ItineraryRow>(
    pool,
    `SELECT * FROM itinerary WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map((row) => ({
    ...row,
    start_date: toDateString(row.start_date),
    end_date: toDateString(row.end_date),
  }));
}

/**
 * Delete an itinerary; demographics/accommodation/days/activities go with it
 * via ON DELETE CASCADE. RETURNING id tells not-found (null) apart from done.
 */
export async function deleteItineraryById(
  pool: Pool,
  itineraryId: string
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    pool,
    `DELETE FROM itinerary WHERE id = $1 RETURNING id`,
    [itineraryId]
  );
  return row?.id ?? null;
}

/** Delete a single accommodation row (hotel removed from an itinerary). */
export async function deleteAccommodationById(
  pool: Pool,
  accommodationId: number
): Promise<number | null> {
  const row = await queryOne<{ id: string | number }>(
    pool,
    `DELETE FROM itinerary_accomodation WHERE id = $1 RETURNING id`,
    [accommodationId]
  );
  return row ? Number(row.id) : null;
}
