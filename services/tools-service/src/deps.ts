/**
 * deps.ts — the dependencies every router needs, injected from the
 * composition root (index.ts) through app.ts into each routes/*.ts file.
 *
 * Wiring is deliberately explicit instead of module-level singletons so a
 * first-time reader can trace index → app → routes → repositories top-down
 * and see exactly which collaborator each route talks to.
 */
import { Storage, TokenVerifier } from "@smart/shared";
import { Pool } from "pg";
import { ItineraryClient } from "./itineraryClient";
import { EventPublisher } from "./eventPublisher";

export interface ToolsRouteDeps {
  /** Verifies Bearer/cookie tokens (dev or Cognito mode, see adapters/jwt.ts). */
  verifier: TokenVerifier;
  /** Owns the tools-db tables (groups, group_members, itinerary_shares, pdf_exports). */
  pool: Pool;
  /** Fetches itinerary aggregates from the itinerary-service (internal HTTP). */
  itineraryClient: ItineraryClient;
  /** Best-effort publisher for group.invited / itinerary.shared (RabbitMQ). */
  events: EventPublisher;
  /** Object storage (MinIO locally / S3 on AWS) for PDF exports. */
  storage: Storage;
  /** Where share links point: `${webPublicUrl}/shared/<token>` (the web app). */
  webPublicUrl: string;
}
