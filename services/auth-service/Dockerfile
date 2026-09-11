# Build context: repository root (see docker-compose.yml)
FROM node:20-alpine
WORKDIR /app

# Install workspace production dependencies first (better layer caching)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/auth-service/package.json services/auth-service/
# --foreground-scripts: npm runs postinstall scripts (esbuild's binary
# install) one at a time instead of spawning them mid-install — without it,
# parallel image builds race esbuild's ETXTBSY-prone validate step.
RUN npm ci --omit=dev --foreground-scripts

# Copy the sources needed at runtime (shared is a pure-TS package, run via tsx)
COPY packages/shared/ packages/shared/
COPY services/auth-service/ services/auth-service/

WORKDIR /app/services/auth-service
EXPOSE 8081
CMD ["npx", "tsx", "src/index.ts"]
