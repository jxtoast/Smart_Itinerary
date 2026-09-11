/**
 * render-fixture-pdf.ts — offline proof that tools-service can generate real
 * PDFs (T1.6 verification requirement; the full HTTP → MinIO round trip is
 * proven at integration when docker compose is up).
 *
 * It exercises exactly the pipeline the export route runs, minus the network:
 *   fixture itinerary (same shape itinerary-service GET returns)
 *     → parsePdfItinerary (shared zod contract)
 *     → renderItineraryPdf (pdfkit, in memory)
 *     → structural PDF assertions
 * and writes the buffer to /tmp so a human can open it.
 *
 * Run: npm run render-fixture-pdf --workspace @smart/tools-service
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parsePdfItinerary, renderItineraryPdf } from "../src/pdf/renderItineraryPdf";

const FIXTURE_PATH = join(__dirname, "..", "fixtures", "itinerary.json");
const OUTPUT_PATH = join(tmpdir(), "fixture-itinerary-export.pdf");

/** Smallest believable multi-section PDF; anything below means a render bug. */
const MIN_PDF_BYTES = 1500;

async function main(): Promise<void> {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

  // 1. Contract check: the fixture must satisfy the exact schema the export
  //    route enforces on fetched itineraries.
  const itinerary = parsePdfItinerary(fixture);
  console.log("contract ok:", itinerary.destination, `(${itinerary.itineraryDays.length} days)`);

  // 2. Render to an in-memory buffer, exactly like the export route does.
  const pdf = await renderItineraryPdf(itinerary);
  console.log("render ok:", pdf.length, "bytes");

  // 3. Structural assertions — pdfkit writes plain object headers, so the
  //    PDF version line, page objects and EOF marker are greppable bytes.
  const asLatin1 = pdf.toString("latin1");
  if (!asLatin1.startsWith("%PDF-1.")) {
    throw new Error("output does not start with a %PDF header");
  }
  const pageObjects = asLatin1.match(/\/Type \/Page(?![s])/g)?.length ?? 0;
  if (pageObjects < 1) {
    throw new Error("output contains no PDF page objects");
  }
  if (!asLatin1.includes("%%EOF")) {
    throw new Error("output is missing the %%EOF trailer");
  }
  if (pdf.length < MIN_PDF_BYTES) {
    throw new Error(`output suspiciously small (${pdf.length} bytes)`);
  }

  writeFileSync(OUTPUT_PATH, pdf);
  console.log(`pages: ${pageObjects}`);
  console.log(`written: ${OUTPUT_PATH} — open it to eyeball the layout`);
  console.log("\nfixture PDF render: ALL GREEN");
}

main().catch((error) => {
  console.error("FIXTURE RENDER FAILED:", error);
  process.exit(1);
});
