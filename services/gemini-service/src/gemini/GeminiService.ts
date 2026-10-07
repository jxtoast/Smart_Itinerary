import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiConfig, createLogger } from "@smart/shared/src/server";

/**
 * Thin wrapper around the Google Gemini SDK (moved from the monolith's
 * apps/web/services/GeminiService.ts, where it ran in the BROWSER with a
 * NEXT_PUBLIC_ key — now the key stays on the server, per docs/TASKS.md
 * hard constraint 7).
 *
 * Deviations from the monolith, both deliberate:
 *  - the API key is injected instead of read from process.env, so the service
 *    can boot without a key (only AI endpoints answer 503 — see index.ts);
 *  - a failed/unparseable generation logs and returns null instead of letting
 *    the error escape, matching the monolith's "generation is best-effort"
 *    contract with its callers.
 */

const logger = createLogger("gemini-service");

/**
 * Parses the key pool: GEMINI_API_KEYS (comma-separated) wins when set,
 * falling back to the single GEMINI_API_KEY. Trims whitespace, drops empty
 * entries, dedupes — so "k1, k1,,k2" yields [k1, k2]. Exported for tests.
 */
export function parseGeminiKeys(
  keysVar: string | undefined,
  singleKeyVar: string | undefined
): string[] {
  const raw = (keysVar ?? singleKeyVar ?? "").split(",");
  const keys = [...new Set(raw.map((k) => k.trim()).filter((k) => k.length > 0))];
  return keys;
}

/**
 * True when a Gemini call failed in a way ANOTHER key could fix: the day's
 * quota is exhausted (429 RESOURCE_EXHAUSTED) or the key itself was
 * rejected/revoked (400 API_KEY_INVALID). Model 404s and 5xx capacity
 * errors are NOT key-specific — rotating would not help.
 */
export function isKeySpecificError(error: unknown): boolean {
  const err = error as { status?: number; message?: string };
  if (err?.status === 429) return true;
  if (err?.status === 400 && /api key not valid/i.test(err?.message ?? "")) return true;
  return false;
}

export class GeminiService {
  /** One SDK client per pooled key; index = the key currently in use. */
  private readonly clients: GoogleGenerativeAI[];
  private currentIndex = 0;
  /** Exposed so audit rows can record which model produced a response. */
  public readonly model: string;
  /** How many keys are pooled (0 = AI endpoints answer 503). */
  public get keyCount(): number {
    return this.clients.length;
  }

  constructor(apiKeys: string[], model: string) {
    this.clients = apiKeys.map((apiKey) => new GoogleGenerativeAI(apiKey));
    this.model = model;
  }

  /**
   * Run one prompt through Gemini and return the raw text, or null when the
   * call fails (network/quota/model error — already logged). Callers decide
   * whether null means an empty response body or a 502/503.
   *
   * Key rotation: when a call fails with a KEY-SPECIFIC error (quota
   * exhausted, revoked key) and another key is pooled, the same prompt is
   * retried with the next key immediately — a day-quota wall on one key no
   * longer produces a null plan while spare keys exist. Capacity/model
   * errors do not rotate (another key hits the same wall).
   */
  public async generateContent(prompt: string, generationConfig: GeminiConfig): Promise<string | null> {
    for (let attempt = 0; attempt < this.clients.length; attempt += 1) {
      const client = this.clients[this.currentIndex];
      try {
        const model = client.getGenerativeModel({ model: this.model, generationConfig });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (error) {
        logger.error(
          { err: error, model: this.model, keyIndex: this.currentIndex, keyCount: this.clients.length },
          "Gemini generateContent failed"
        );
        if (isKeySpecificError(error) && attempt < this.clients.length - 1) {
          this.currentIndex = (this.currentIndex + 1) % this.clients.length;
          logger.warn(
            { keyIndex: this.currentIndex, model: this.model },
            "Gemini key quota/rejection — rotating to the next pooled key and retrying"
          );
          continue;
        }
        return null;
      }
    }
    return null;
  }
}

/**
 * Parse a Gemini response that was requested with
 * `responseMimeType: "application/json"`. Returns null when the text is empty
 * or not valid JSON (e.g. the model hit its token cap mid-object) — the
 * monolith called JSON.parse bare, which crashed the whole plan flow on a
 * truncated response.
 */
export function parseGeminiJson<T>(text: string | null): T | null {
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    logger.warn({ err: error }, "Gemini returned text that is not valid JSON — treating as no data");
    return null;
  }
}
