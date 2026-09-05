import type { Pool } from "pg";
import { createLogger, queryOne } from "@smart/shared";
import type { GeminiService } from "../gemini/GeminiService";
// type-only: no runtime coupling between auditing and prompt building
import type { GeminiGeneration } from "../gemini/prompts";

/**
 * Audit repository — every SQL statement that writes the gemini-service's
 * own database (diagram: "Amazon RDS (Gemini DB)"; locally the gemini-db
 * container, DDL in db/init/gemini-service.sql).
 *
 * Tables owned (matching that DDL):
 *   generations     — one row per Gemini call (prompt, response, latency)
 *   hotel_searches  — one row per hotel search (query, result count)
 *
 * This audit trail is what justifies the Gemini (Hotel) Service having a
 * dedicated database in the diagram: AI calls cost money and their
 * inputs/outputs are worth a record the rest of the platform can trust.
 *
 * Auditing is deliberately BEST-EFFORT: a failed insert is logged and
 * swallowed so a broken audit table can never fail a user's generation.
 */

const logger = createLogger("gemini-service");

export interface GenerationAuditRow {
  /** itinerary | weather | hotel-suggestion (see db/init DDL comment). */
  kind: string;
  model: string;
  prompt: string;
  response: string | null;
  durationMs: number;
}

/** Insert one row per AI generation. Never throws. */
export async function recordGeneration(pool: Pool, row: GenerationAuditRow): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO generations (kind, model, prompt, response, duration_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.kind, row.model, row.prompt, row.response, row.durationMs]
    );
  } catch (error) {
    logger.error({ err: error, kind: row.kind, model: row.model }, "failed to audit generation — the generation itself is unaffected");
  }
}

/**
 * Run one Gemini call AND write its audit row — the single entry point every
 * caller uses (routes for the standalone generations, ItineraryPlannerFacade
 * for /plan) so no AI call can bypass the audit trail. Returns the raw
 * response text, null when the model call failed (logged in GeminiService).
 */
export async function runAuditedGeneration(
  pool: Pool,
  service: GeminiService,
  kind: string,
  generation: GeminiGeneration
): Promise<string | null> {
  const startedAt = Date.now();
  const text = await service.generateContent(generation.prompt, generation.generationConfig);
  await recordGeneration(pool, {
    kind,
    model: service.model,
    prompt: generation.prompt,
    response: text,
    durationMs: Date.now() - startedAt,
  });
  return text;
}

/** Insert one row per hotel search (query + how many hotels came back). Never throws. */
export async function recordHotelSearch(pool: Pool, searchQuery: string, resultCount: number): Promise<void> {
  try {
    await queryOne(
      pool,
      `INSERT INTO hotel_searches (query, result_count)
       VALUES ($1, $2)
       RETURNING id`,
      [searchQuery, resultCount]
    );
  } catch (error) {
    logger.error({ err: error, query: searchQuery }, "failed to audit hotel search — the search itself is unaffected");
  }
}
