/**
 * Gateway smoke test — the behind-a-proxy contract (run: npm run smoke).
 *
 * On AWS two proxies (CloudFront → ALB) sit in front of the gateway, and the
 * ALB always adds x-forwarded-for. The gateway must therefore declare a trust
 * proxy depth (src/index.ts): express-rate-limit v8 REFUSES requests that
 * carry x-forwarded-for while trust proxy is unset, and without per-client
 * keying every user would share one rate-limit bucket.
 *
 * This script boots the real gateway on a scratch port with a tight rate
 * limit and asserts, through plain HTTP:
 *   1. no request ever 500s (the unset-trust-proxy validation failure mode),
 *   2. two different x-forwarded-for clients each get their own bucket,
 *   3. the limiter still throttles one client once its bucket is full,
 *   4. /healthz (registered before the limiter) never throttles.
 */
import { spawn } from "node:child_process";

const PORT = 18098; // scratch port — compose uses 8080, other smokes 18080+
const BASE = `http://127.0.0.1:${PORT}`;
const RATE_LIMIT_MAX = 3;
const CLIENT_A = "10.0.0.1";
const CLIENT_B = "10.0.0.2";
/** Any JWT-gated /api path works: the limiter runs BEFORE the auth gate, so
 * an unauthenticated call still consumes budget (401 without token). */
const LIMITED_PATH = "/api/itineraries/user/00000000-0000-4000-8000-000000000000";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function get(path: string, ip?: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: ip ? { "x-forwarded-for": ip } : {},
  });
}

async function waitForGateway(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await get("/healthz");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`gateway did not become ready on ${BASE} within 10s`);
}

async function main(): Promise<void> {
  const gateway = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(PORT),
      RATE_LIMIT_WINDOW_MS: "15000", // longer than the test — no mid-run reset
      RATE_LIMIT_MAX: String(RATE_LIMIT_MAX),
      TOKEN_VERIFY_MODE: "dev",
      LOG_LEVEL: "warn", // keep the output readable; failures print here
      SERVICE_NAME: "gateway-smoke",
    },
    stdio: "ignore",
  });

  try {
    await waitForGateway();

    // 1. healthz is registered before the limiter — never throttled.
    const health = await get("/healthz", CLIENT_A);
    check("GET /healthz with x-forwarded-for answers 200", health.status === 200);

    // 2. Fill client A's bucket: RATE_LIMIT_MAX requests, all authenticated-or-not
    //    but always rate-limit-counted. Expect 401 (limiter passed, no token).
    const firstA = await get(LIMITED_PATH, CLIENT_A);
    check("first request from client A is 401 (not 500)", firstA.status === 401);
    for (let i = 0; i < RATE_LIMIT_MAX - 1; i += 1) await get(LIMITED_PATH, CLIENT_A);

    // 3. Bucket A is now full → 429 for A…
    const throttledA = await get(LIMITED_PATH, CLIENT_A);
    check("client A is throttled after the limit", throttledA.status === 429);

    // 4. …but client B (different x-forwarded-for) still has a fresh bucket —
    //    the proof that keying follows the real client, not the proxy socket.
    const freshB = await get(LIMITED_PATH, CLIENT_B);
    check("client B has an independent bucket", freshB.status === 401);

    // 5. No-header requests key on the socket — their own bucket too.
    const noHeader = await get(LIMITED_PATH);
    check("request without x-forwarded-for is not throttled by A/B", noHeader.status === 401);
  } finally {
    gateway.kill("SIGTERM");
  }

  if (failures > 0) {
    console.error(`gateway smoke: ${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("gateway smoke: ALL GREEN");
}

main().catch((error: unknown) => {
  console.error("gateway smoke crashed:", error);
  process.exit(1);
});
