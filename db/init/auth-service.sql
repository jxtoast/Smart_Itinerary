-- Auth Service database (matches diagram: "Amazon RDS (Auth DB)")
-- Schema reconstructed from apps/web/services/UserService.ts column usage.

CREATE TABLE users (
  id         uuid PRIMARY KEY,
  name       text NOT NULL DEFAULT 'null',
  email      text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users_demographics (
  id               bigserial PRIMARY KEY,
  user_id          uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  min_budget       numeric,
  max_budget       numeric,
  travel_type      text NOT NULL DEFAULT '',
  purpose          text NOT NULL DEFAULT '',
  number_of_people integer
);

-- Seed: the mock-auth user (apps/web/services/UserService.ts
-- NEXT_PUBLIC_ENABLE_MOCK_AUTH) so the local stack works without Cognito.
INSERT INTO users (id, name, email, avatar_url) VALUES
  ('1b9472e1-a85e-43bf-9898-6f44e2b20809', 'Test User', 'testuser@example.com', '');

INSERT INTO users_demographics (user_id, min_budget, max_budget, travel_type, purpose, number_of_people) VALUES
  ('1b9472e1-a85e-43bf-9898-6f44e2b20809', 500, 2000, 'solo', 'leisure', 1);
