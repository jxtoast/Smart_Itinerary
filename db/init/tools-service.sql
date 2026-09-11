-- Tools Service database (matches diagram: "Amazon RDS (Tools DB)")
-- Groups, group membership, itinerary shares and PDF export records
-- (Export PDF, Sharing per the diagram).

CREATE TABLE groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  owner_user_id uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  id           bigserial PRIMARY KEY,
  group_id     uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  email        text NOT NULL,
  user_id      uuid,                     -- set once the invitee joins
  status       text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'joined')),
  invite_token text UNIQUE,
  invited_at   timestamptz NOT NULL DEFAULT now(),
  joined_at    timestamptz,
  UNIQUE (group_id, email)
);

CREATE TABLE itinerary_shares (
  id           bigserial PRIMARY KEY,
  itinerary_id uuid NOT NULL,
  group_id     uuid REFERENCES groups (id) ON DELETE SET NULL,
  share_token  text NOT NULL UNIQUE,
  created_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pdf_exports (
  id           bigserial PRIMARY KEY,
  itinerary_id uuid NOT NULL,
  storage_key  text NOT NULL,            -- S3/MinIO object key
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed: a demo group owned by the mock-auth user with one invited peer.
INSERT INTO groups (id, name, owner_user_id) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Japan Trip Crew', '1b9472e1-a85e-43bf-9898-6f44e2b20809');

INSERT INTO group_members (group_id, email, status, invite_token) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'peer1@example.com', 'joined', NULL),
  ('00000000-0000-0000-0000-0000000000a1', 'peer2@example.com', 'invited', 'seed-invite-token-peer2');
