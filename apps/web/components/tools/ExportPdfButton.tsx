"use client";
/**
 * ExportPdfButton (T2.5) — the web face of the diagram's
 * "Tools Service (Export PDF)" box, mounted on the itinerary view.
 *
 * Click flow: GET /api/tools/export/itinerary/:id/pdf (through the gateway,
 * JWT-authenticated) answers { downloadUrl, expiresAt, storageKey } where
 * downloadUrl is a MinIO/S3 PRESIGNED URL — the browser then downloads the
 * PDF straight from object storage, so no file bytes ever pass through the
 * web server or the gateway, and no credentials are needed for that hop
 * (the signature in the URL is the authorization). The button opens the URL
 * in a new tab and keeps a plain link as a fallback in case the browser
 * blocks the popup.
 */
import { useState } from "react";
import type { ExportPdfResponse } from "@smart/shared";
import { getSessionApiClient } from "@/lib/apiClientSession";
import { describeApiClientError } from "@/lib/apiError";

interface ExportPdfButtonProps {
  /** The saved itinerary to render as PDF (its id in itinerary-service). */
  itineraryId: string;
}

export default function ExportPdfButton({ itineraryId }: ExportPdfButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ExportPdfResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const pdf = await getSessionApiClient().tools.exportItineraryPdf(itineraryId);
      setResult(pdf);
      // Browser → MinIO directly; a PDF answers inline as a new tab. A falsy
      // return means the popup was blocked — the link below is the fallback.
      window.open(pdf.downloadUrl, "_blank", "noopener");
    } catch (caught) {
      setError(describeApiClientError(caught));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <button
        type="button"
        className="btn bg-main-3 border-none text-black hover:bg-main-4 shadow-md"
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting ? (
          <span className="flex items-center gap-2">
            <span className="loading loading-spinner"></span>
            Exporting PDF…
          </span>
        ) : (
          "Export as PDF"
        )}
      </button>

      {result && (
        <p className="text-sm text-colortext-2">
          PDF ready —{" "}
          <a
            href={result.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="link link-primary"
          >
            open the download
          </a>
          {result.expiresAt ? ` (link expires ${new Date(result.expiresAt).toLocaleTimeString()})` : ""}
        </p>
      )}
      {error && (
        <div role="alert" className="alert alert-error max-w-md text-sm">
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
