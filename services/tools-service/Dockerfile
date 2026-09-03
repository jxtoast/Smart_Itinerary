# Build context: repository root (see docker-compose.yml)
FROM node:20-alpine
WORKDIR /app

# Install workspace production dependencies first (better layer caching)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/tools-service/package.json services/tools-service/
RUN npm ci --omit=dev

# Copy the sources needed at runtime (shared is a pure-TS package, run via tsx)
COPY packages/shared/ packages/shared/
COPY services/tools-service/ services/tools-service/

WORKDIR /app/services/tools-service
EXPOSE 8084
CMD ["npx", "tsx", "src/index.ts"]
