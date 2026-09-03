-- Gemini Service database (matches diagram: "Amazon RDS (Gemini DB)")
-- Holds audit/history for AI generations and hotel searches, justifying a
-- dedicated database-per-service for the Gemini (Hotel) Service.

CREATE TABLE generations (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,            -- itinerary | weather | plan | hotel-suggestion
  model       text NOT NULL,
  prompt      text,
  response    text,
  duration_ms integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hotel_searches (
  id           bigserial PRIMARY KEY,
  query        text NOT NULL,
  result_count integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
