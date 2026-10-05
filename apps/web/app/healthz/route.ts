/**
 * GET /healthz — liveness probe for container platforms (the ECS task
 * definition's health check wgets this path, same convention as the six
 * backend services). It answers "this process is up" only: deeper health —
 * gateway reachability, upstream aggregates — is the gateway's own /healthz
 * (which the ALB targets for the API path). Static by design: no auth, no
 * I/O, nothing that can fail but the server itself.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json({ status: "ok", service: "web" });
}
