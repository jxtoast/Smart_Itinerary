-- Gemini Service database (matches diagram: "Amazon RDS (Gemini DB)")
-- Holds audit/history for AI generations and hotel searches, justifying a
-- dedicated database-per-service for the Gemini (Hotel) Service.
-- T1.4 also moved the plan-form reference data here (country / airport /
-- travel_type used to live in the monolith's central Supabase); the seed
-- keeps exactly one hub airport per country, matching the shape the
-- plan-itinerary form expects.

CREATE TABLE generations (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,            -- itinerary | weather | hotel-suggestion
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

-- Reference data for the plan-itinerary form (GET /api/gemini/reference/*).
CREATE TABLE country (
  id           bigserial PRIMARY KEY,
  country_code text NOT NULL UNIQUE,
  country_name text NOT NULL
);

CREATE TABLE airport (
  id           bigserial PRIMARY KEY,
  country_id   bigint NOT NULL REFERENCES country(id) ON DELETE CASCADE,
  airport_code text NOT NULL UNIQUE
);

CREATE TABLE travel_type (
  id               bigserial PRIMARY KEY,
  type_name        text NOT NULL,
  type_code        text NOT NULL UNIQUE,
  number_of_people text NOT NULL
);

-- Demo seed: a spread of countries with their main international hub.
INSERT INTO country (id, country_code, country_name) VALUES
  (1, 'SG', 'Singapore'),
  (2, 'JP', 'Japan'),
  (3, 'MY', 'Malaysia'),
  (4, 'TH', 'Thailand'),
  (5, 'ID', 'Indonesia'),
  (6, 'KR', 'South Korea'),
  (7, 'AU', 'Australia'),
  (8, 'NZ', 'New Zealand'),
  (9, 'IN', 'India'),
  (10, 'CN', 'China'),
  (11, 'GB', 'United Kingdom'),
  (12, 'FR', 'France'),
  (13, 'US', 'United States');
SELECT setval('country_id_seq', (SELECT MAX(id) FROM country));

INSERT INTO airport (country_id, airport_code) VALUES
  (1, 'SIN'),   -- Singapore Changi
  (2, 'NRT'),   -- Tokyo Narita
  (3, 'KUL'),   -- Kuala Lumpur
  (4, 'BKK'),   -- Bangkok Suvarnabhumi
  (5, 'CGK'),   -- Jakarta Soekarno-Hatta
  (6, 'ICN'),   -- Seoul Incheon
  (7, 'SYD'),   -- Sydney
  (8, 'AKL'),   -- Auckland
  (9, 'DEL'),   -- Delhi Indira Gandhi
  (10, 'PEK'),  -- Beijing Capital
  (11, 'LHR'),  -- London Heathrow
  (12, 'CDG'),  -- Paris Charles de Gaulle
  (13, 'LAX');  -- Los Angeles

INSERT INTO travel_type (id, type_name, type_code, number_of_people) VALUES
  (1, 'Solo', 'solo', '1'),
  (2, 'Couple', 'couple', '2'),
  (3, 'Family', 'family', '3-5'),
  (4, 'Friends', 'friends', '4-8'),
  (5, 'Business', 'business', '1-2');
SELECT setval('travel_type_id_seq', (SELECT MAX(id) FROM travel_type));
