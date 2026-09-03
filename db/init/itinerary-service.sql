-- Itinerary Service database (matches diagram: "Amazon RDS (Itinerary DB)")
-- Schema reconstructed from apps/web/services/ItineraryService.ts and
-- HotelService.ts column usage. NOTE: itinerary_accomodation keeps the
-- historical (misspelled) table name used throughout the codebase.

CREATE TABLE itinerary (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  source              text NOT NULL DEFAULT '',
  destination         text NOT NULL DEFAULT '',
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  estimated_total_cost numeric NOT NULL DEFAULT 0,
  notes               text,                -- JSON-encoded string[] of important notes
  weather_forecast    jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE itinerary_demographics (
  id           bigserial PRIMARY KEY,
  itinerary_id uuid NOT NULL REFERENCES itinerary (id) ON DELETE CASCADE,
  currency     text NOT NULL DEFAULT '',
  budget_min   numeric,
  budget_max   numeric,
  travel_type  text NOT NULL DEFAULT '',
  purpose      text NOT NULL DEFAULT ''
);

CREATE TABLE itinerary_accomodation (
  id               bigserial PRIMARY KEY,
  itinerary_id     uuid NOT NULL REFERENCES itinerary (id) ON DELETE CASCADE,
  name             text NOT NULL,
  estimated_cost   numeric,
  image_url        text,
  hotel_description text
);

CREATE TABLE itinerary_day (
  id           bigserial PRIMARY KEY,
  itinerary_id uuid NOT NULL REFERENCES itinerary (id) ON DELETE CASCADE,
  date         date NOT NULL,
  location     text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT ''
);

CREATE TABLE itinerary_activity (
  id              bigserial PRIMARY KEY,
  itinerary_day_id bigint NOT NULL REFERENCES itinerary_day (id) ON DELETE CASCADE,
  name            text NOT NULL,
  details         text NOT NULL DEFAULT '',
  estimated_cost  numeric,
  image_url       text,
  timing          text NOT NULL DEFAULT ''
);

-- Seed: one demo itinerary for the mock-auth user.
INSERT INTO itinerary (id, user_id, source, destination, start_date, end_date, estimated_total_cost, notes, weather_forecast) VALUES
  ('00000000-0000-0000-0000-000000000001',
   '1b9472e1-a85e-43bf-9898-6f44e2b20809',
   'Singapore', 'Tokyo',
   CURRENT_DATE + 30, CURRENT_DATE + 34,
   2450.00,
   '["Carry a portable wifi router","Bring comfortable walking shoes"]',
   '{"forecast":[{"date":"day-1","temperature":"22C","weather":"Sunny"}]}'::jsonb);

INSERT INTO itinerary_demographics (itinerary_id, currency, budget_min, budget_max, travel_type, purpose) VALUES
  ('00000000-0000-0000-0000-000000000001', 'JPY', 1500, 3000, 'couple', 'leisure');

INSERT INTO itinerary_accomodation (itinerary_id, name, estimated_cost, image_url, hotel_description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Shinjuku Grand Hotel', 180.00, 'https://example.com/hotel.jpg', 'Central hotel near the station.');

INSERT INTO itinerary_day (id, itinerary_id, date, location, description) VALUES
  (1, '00000000-0000-0000-0000-000000000001', CURRENT_DATE + 30, 'Shibuya', 'Arrival and Shibuya crossing exploration.'),
  (2, '00000000-0000-0000-0000-000000000001', CURRENT_DATE + 31, 'Asakusa', 'Temple visit and street food.');

INSERT INTO itinerary_activity (itinerary_day_id, name, details, estimated_cost, image_url, timing) VALUES
  (1, 'Shibuya Crossing', 'Iconic scramble crossing and Hachiko statue.', 0, 'https://example.com/shibuya.jpg', '09:00'),
  (1, 'teamLab Planets', 'Immersive digital art museum.', 25, 'https://example.com/teamlab.jpg', '14:00'),
  (2, 'Senso-ji Temple', 'Oldest temple in Tokyo, Nakamise shopping street.', 0, 'https://example.com/sensoji.jpg', '10:00');

-- The seed above inserts explicit itinerary_day ids, so the bigserial sequence
-- must be advanced to match — otherwise the first service-generated day id
-- collides with the seeded rows (duplicate key on itinerary_day_pkey).
SELECT setval(pg_get_serial_sequence('itinerary_day', 'id'), (SELECT MAX(id) FROM itinerary_day));
