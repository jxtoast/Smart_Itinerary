# Build context: repository root (see docker-compose.yml)
FROM node:20-alpine
WORKDIR /app

# Install workspace production dependencies first (better layer caching)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/itinerary-service/package.json services/itinerary-service/
RUN npm ci --omit=dev

# Copy the sources needed at runtime (shared is a pure-TS package, run via tsx)
COPY packages/shared/ packages/shared/
COPY services/itinerary-service/ services/itinerary-service/

WORKDIR /app/services/itinerary-service
EXPOSE 8082
CMD ["npx", "tsx", "src/index.ts"]
