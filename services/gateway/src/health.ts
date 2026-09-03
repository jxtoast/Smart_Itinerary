/**
 * GET /healthz — gateway health with per-upstream aggregation.
 *
 * The gateway reports itself always as process-alive (HTTP 200) so the compose
 * healthcheck / ALB target check doesn't cascade-restart a perfectly healthy
 * gateway when one backend is down. The per-upstream truth is in the body:
 * `status: "ok"` when every upstream answers, `"degraded"` otherwise.
 *
 * This is what Check-in 2 relies on: every service curl-able *through* the
 * gateway, with the gateway honestly reporting what it can reach.
 */

import { RequestHandler } from "express";
import { createLogger } from "@smart/shared";
import { asyncRoute } from "./async-route";
import { UPSTREAM_ROUTES, UpstreamState, resolveUpstreamUrl } from "./upstreams";

const logger = createLogger("gateway-health");

/** Short on purpose: /healthz should answer fast even when backends hang. */
const HEALTH_CHECK_TIMEOUT_MS = 2_000;

/** Ask one upstream for its /healthz. Any answer ≥ 200 < 500 counts as up. */
async function checkUpstream(baseUrl: string): Promise<UpstreamState> {
  const startedAt = Date.now();
  try {
    const response = await fetch(new URL("/healthz", baseUrl), {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });
    if (response.ok) {
      return { status: "up", url: baseUrl, latencyMs: Date.now() - startedAt };
    }
    return {
      status: "down",
      url: baseUrl,
      reason: `upstream /healthz responded HTTP ${response.status}`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn({ upstream: baseUrl, reason }, "upstream health check failed");
    return { status: "down", url: baseUrl, reason };
  }
}

export const healthHandler: RequestHandler = asyncRoute(async (_req, res) => {
  // Probe all upstreams in parallel so the total wait is one timeout, not N.
  const states: Record<string, UpstreamState> = {};
  await Promise.all(
    UPSTREAM_ROUTES.map(async (route) => {
      const url = resolveUpstreamUrl(route);
      states[route.serviceName] = url
        ? await checkUpstream(url)
        // Absent upstream env = that area is down, stated plainly.
        : { status: "down", url: null, reason: `${route.urlEnvVar} is not set` };
    })
  );

  const allUp = Object.values(states).every((state) => state.status === "up");
  res.json({
    status: allUp ? "ok" : "degraded",
    service: process.env.SERVICE_NAME ?? "gateway",
    upstreams: states,
  });
});
