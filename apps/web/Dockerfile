# Web frontend image (diagram: "Clients" — hosted as the 7th ECS service on
# AWS; local development keeps running `next dev` via compose/npm).
#
# Build context is the REPOSITORY ROOT, same as services/*/Dockerfile:
#   docker build -f apps/web/Dockerfile -t <ecr-repo>:latest .
#
# Runtime env (set by the ECS task definition; all optional locally):
#   API_GATEWAY_URL            — gateway base for the /api/* rewrite
#                                (defaults per next.config.ts; on ECS the ALB
#                                routes /api/* before Next ever sees it)
#   COGNITO_HOSTED_UI_DOMAIN, COGNITO_CLIENT_ID — the sign-in pool config
#   WEB_PUBLIC_URL             — the public origin (CloudFront URL) used for
#                                Cognito redirect/logout URLs (lib/auth/cognito.ts)
# Listens on $PORT (default 3000); GET /healthz answers for platform probes.

# --- deps + build -----------------------------------------------------------
FROM node:26-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Cypress sits in the web devDependencies; its ~300MB browser binary has no
# business inside a build stage — skip the download.
ENV CYPRESS_INSTALL_BINARY=0

# Workspace manifests first, so the `npm ci` layer caches independently of
# source edits. The web app depends on BOTH @smart workspaces (shared +
# api-client) — unlike the service images, which need only shared.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci --foreground-scripts

# Sources: the app plus the two workspace packages it imports.
COPY apps/web apps/web
COPY packages/shared packages/shared
COPY packages/api-client packages/api-client
RUN npm run build --workspace @smart/web

# --- runtime ----------------------------------------------------------------
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
# next/image needs sharp for production image optimization (several pages use
# it); the standalone output does not bundle optional native deps, so the
# runner installs it explicitly.
RUN npm install --no-save sharp
# The standalone tree mirrors the workspace layout: the server lives at
# apps/web/server.js (NOT the tree root — Next 15 emits it per-project), with
# pruned node_modules at the root. Static assets and public/ are not traced
# by the output tracer — copy them in.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
