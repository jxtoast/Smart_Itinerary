import PDFDocument from "pdfkit";
import { z } from "zod";
import { ItineraryPayloadSchema } from "@smart/shared";

/**
 * renderItineraryPdf — turns an itinerary aggregate into a PDF buffer
 * (diagram: "Tools Service — Export PDF", rendered with pdfkit).
 *
 * The route pipeline around this module is: fetch the aggregate from the
 * itinerary-service (itineraryClient) → validate it with the shared
 * ItineraryPayloadSchema (parsePdfItinerary, below) → render → upload the
 * buffer to MinIO/S3 via the shared storage adapter. Keeping the render pure
 * (bytes in → buffer out) is what lets `scripts/render-fixture-pdf.ts` prove
 * PDF generation offline, without a database, broker or MinIO.
 *
 * pdfkit's built-in Helvetica fonts are used on purpose — no font files to
 * ship, and standard-14 metrics keep the Docker image slim.
 */

/** The validated aggregate shape the renderer works with. */
export type PdfItinerary = z.infer<typeof ItineraryPayloadSchema>;

/**
 * Validate a fetched itinerary against the shared contract before rendering.
 * Export/save flows already produce this shape (same schema validates the
 * save request), so a failure here means cross-service drift, not user error.
 */
export function parsePdfItinerary(raw: unknown): PdfItinerary {
  return ItineraryPayloadSchema.parse(raw);
}

/** "1500 JPY" for a cost, "—" when the planner did not estimate one. */
function formatCost(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return "—";
  return `${amount.toLocaleString("en-US")} ${currency}`;
}

/**
 * pdfkit's built-in Helvetica uses the WinAnsi encoding, which cannot render
 * arbitrary Unicode (an arrow "→" turned into mojibake, "Sensō-ji" lost its
 * macron in testing). Sanitize before drawing: transliterate what we can,
 * then replace anything the font cannot encode with "?". Embedding a real
 * Unicode TTF per language would be the full fix — deliberately out of scope
 * for a demo exporter.
 */
function toWinAnsiSafe(text: string): string {
  return text
    .replace(/\u2192/g, "-") // arrows ("→") have no transliteration
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics: ō → o, é → e, ...
    .replace(
      // keep ASCII, Latin-1 and the few typographic chars WinAnsi knows
      /[^\x20-\x7E\u00A0-\u00FF\u2018-\u201D\u2013\u2014\u2022\u00B7\u2026\u20AC]/g,
      "?"
    );
}

/** document.text with WinAnsi sanitization — every section writer goes through this. */
function put(document: PDFKit.PDFDocument, text: string, options?: PDFKit.Mixins.TextOptions) {
  return document.text(toWinAnsiSafe(text), options);
}

/** Render the whole document; resolves when pdfkit has flushed every byte. */
export function renderItineraryPdf(itinerary: PdfItinerary): Promise<Buffer> {
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 56, left: 56, right: 56 },
    info: {
      Title: `Itinerary — ${itinerary.destination}`,
      Author: "Smart Itinerary",
      Creator: "smart-itinerary tools-service",
    },
  });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    try {
      writeHeader(document, itinerary);
      writeSummary(document, itinerary);
      writeNotes(document, itinerary);
      writeAccommodation(document, itinerary);
      writeDayByDay(document, itinerary);
      writeFooter(document);
    } catch (error) {
      // Without end() the stream never finishes and the promise would hang;
      // reject so the route answers 500 instead.
      reject(error);
      return;
    }

    document.end();
  });
}

// ---------------------------------------------------------------------------
// Sections — each writes one block of the document and relies on pdfkit's
// automatic text flow / page breaks. `document.text()` returns the document,
// so consecutive writes simply chain.
// ---------------------------------------------------------------------------

/** Heading: destination + the trip's route and dates. */
function writeHeader(document: PDFKit.PDFDocument, itinerary: PdfItinerary): void {
  document.fontSize(24).fillColor("#111");
  put(document, itinerary.destination, { paragraphGap: 4 });
  document.fontSize(11).fillColor("#555");
  // en dash rather than "→": WinAnsi has no arrow glyph (see toWinAnsiSafe)
  document
    .text(`${itinerary.sourceCountry} – ${itinerary.destination}`, { continued: true })
    .text(`   ${itinerary.startDate} to ${itinerary.endDate}`);
  document.moveDown(1.2);
}

/** Key figures: total cost, budget, travel style, purpose. */
function writeSummary(document: PDFKit.PDFDocument, itinerary: PdfItinerary): void {
  const currency = itinerary.demographics.currency || "";
  const budget = [
    itinerary.demographics.budgetMin,
    itinerary.demographics.budgetMax,
  ]
    .filter((value): value is number => value !== null && value !== undefined)
    .map((value) => formatCost(value, currency))
    .join(" – ");

  const rows: Array<[string, string]> = [
    ["Estimated total cost", formatCost(itinerary.estimatedTotalCost, currency)],
    ["Budget", budget || "—"],
    ["Travel type", itinerary.demographics.travelerType || "—"],
    ["Purpose", itinerary.demographics.purpose || "—"],
  ];

  document.fontSize(13).fillColor("#111");
  put(document, "Trip summary", { paragraphGap: 6 });
  for (const [label, value] of rows) {
    // ": " + continued keeps label and value on one line (continued text
    // never inserts its own spacing — that glued them together in testing).
    document.fontSize(10).fillColor("#555").text(`${label}:  `, { continued: true });
    document.fillColor("#111").text(value);
  }
  document.moveDown(1);
}

/** Planner warnings/tips as a simple bullet list (skipped when empty). */
function writeNotes(document: PDFKit.PDFDocument, itinerary: PdfItinerary): void {
  if (itinerary.importantNotes.length === 0) return;
  document.fontSize(13).fillColor("#111");
  put(document, "Important notes", { paragraphGap: 6 });
  document.fontSize(10).fillColor("#333");
  for (const note of itinerary.importantNotes) {
    put(document, `•  ${note}`);
  }
  document.moveDown(1);
}

/** Hotels/stays with their per-stay cost estimate (skipped when empty). */
function writeAccommodation(document: PDFKit.PDFDocument, itinerary: PdfItinerary): void {
  if (itinerary.accommodation.length === 0) return;
  const currency = itinerary.demographics.currency || "";
  document.fontSize(13).fillColor("#111");
  put(document, "Where you'll stay", { paragraphGap: 6 });
  for (const stay of itinerary.accommodation) {
    document.fontSize(10).fillColor("#333");
    put(document, `•  ${stay.name} — ${formatCost(stay.estimatedCost, currency)}`);
    if (stay.hotelDescription) {
      document.fontSize(9).fillColor("#666");
      put(document, `   ${stay.hotelDescription}`);
    }
  }
  document.moveDown(1);
}

/** One block per day: date + location heading, description, activity bullets. */
function writeDayByDay(document: PDFKit.PDFDocument, itinerary: PdfItinerary): void {
  const currency = itinerary.demographics.currency || "";
  document.fontSize(13).fillColor("#111");
  put(document, "Day by day", { paragraphGap: 6 });

  itinerary.itineraryDays.forEach((day, index) => {
    document.fontSize(11).fillColor("#111");
    put(document, `Day ${index + 1} — ${day.date} · ${day.location}`, { paragraphGap: 2 });
    if (day.description) {
      document.fontSize(10).fillColor("#444");
      put(document, day.description, { paragraphGap: 3 });
    }
    document.fontSize(10).fillColor("#333");
    for (const activity of day.activities) {
      const timing = activity.timing ? ` (${activity.timing})` : "";
      put(
        document,
        `•  ${activity.name}${timing} — ${formatCost(activity.estimatedCost, currency)}`
      );
    }
    document.moveDown(0.6);
  });
}

/** Closing line on the last page — where the file came from and when. */
function writeFooter(document: PDFKit.PDFDocument): void {
  document.moveDown(1.5);
  document.fontSize(8).fillColor("#999");
  put(document, `Generated by Smart Itinerary tools-service on ${new Date().toISOString()}`);
}
