import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ExportPdfResponseSchema, envInt } from "@smart/shared/src/server";
import { parseParam } from "../http/params";
import { createRequireAuth } from "../http/require-auth";
import { ToolsRouteDeps } from "../deps";
import * as toolsRepository from "../repositories/toolsRepository";
import { parsePdfItinerary, renderItineraryPdf } from "../pdf/renderItineraryPdf";

/**
 * export.routes.ts — the "Export PDF" half of the Tools Service (diagram:
 * "Tools Service — Export PDF"), mounted at /api/tools/export by src/app.ts.
 *
 * Pipeline for GET /export/itinerary/:id/pdf:
 *   itinerary-service (internal HTTP fetch) → pdfkit render (in-memory
 *   buffer) → MinIO/S3 upload (shared storage adapter) → pdf_exports audit
 *   row → presigned download URL handed back to the caller.
 *
 * The web Export-PDF button (T2.5) and any Bearer-token client hit this
 * through the gateway; the download itself happens browser → MinIO/S3
 * directly via the presigned URL, so no PDF bytes flow through the gateway.
 */
export function createExportRouter(deps: ToolsRouteDeps): Router {
  const router = Router();
  const requireAuth = createRequireAuth(deps.verifier);

  /** All exported PDFs live under this prefix in the bucket (see DDL note in pdf_exports). */
  const PDF_KEY_PREFIX = "pdf-exports";

  /** Presign TTL mirrors the storage adapter's default (S3_PRESIGN_TTL_SECONDS). */
  const PRESIGN_TTL_SECONDS = envInt("S3_PRESIGN_TTL_SECONDS", 3600);

  /**
   * GET /api/tools/export/itinerary/:id/pdf — render one itinerary as a PDF.
   * Responds 200 with ExportPdfResponseSchema ({ downloadUrl, expiresAt,
   * storageKey }); 404 when the itinerary does not exist (mapped from the
   * itinerary-service's 404), 502 when that service is unreachable.
   */
  router.get(
    "/itinerary/:id/pdf",
    asyncHandler(async (req, res) => {
      const claims = await requireAuth(req);
      const itineraryId = parseParam(z.string().uuid(), req.params.id, "itinerary id");

      // 1. The itinerary lives in another service's DB — fetch it over HTTP
      //    with the caller's own credentials (see itineraryClient.ts).
      const aggregate = await deps.itineraryClient(itineraryId, {
        authorization: req.headers.authorization,
        cookie: req.headers.cookie,
      });

      // 2. Validate against the shared contract, then render in memory.
      const pdfBuffer = await renderItineraryPdf(parsePdfItinerary(aggregate));

      // 3. Upload to MinIO/S3 through the shared storage adapter. Millisecond
      //    timestamps keep repeated exports of one itinerary distinct.
      const storageKey = `${PDF_KEY_PREFIX}/${itineraryId}/${Date.now()}.pdf`;
      await deps.storage.putObject(storageKey, pdfBuffer, "application/pdf");

      // 4. Audit row (pdf_exports) before answering — the export "counts"
      //    once it is durably recorded.
      await toolsRepository.recordPdfExport(deps.pool, {
        itineraryId,
        storageKey,
        createdBy: claims.sub,
      });

      // 5. Hand back a time-limited download URL (browser → MinIO directly).
      const downloadUrl = await deps.storage.presignGetUrl(storageKey, PRESIGN_TTL_SECONDS);
      res.status(200).json(
        ExportPdfResponseSchema.parse({
          downloadUrl,
          expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString(),
          storageKey,
        })
      );
    })
  );

  return router;
}
