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

export class GeminiService {
  private readonly genAI: GoogleGenerativeAI;
  /** Exposed so audit rows can record which model produced a response. */
  public readonly model: string;

  constructor(apiKey: string, model: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  /**
   * Run one prompt through Gemini and return the raw text, or null when the
   * call fails (network/quota/model error — already logged). Callers decide
   * whether null means an empty response body or a 502/503.
   */
  public async generateContent(prompt: string, generationConfig: GeminiConfig): Promise<string | null> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model, generationConfig });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      logger.error({ err: error, model: this.model }, "Gemini generateContent failed");
      return null;
    }
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
