# Build context: repository root (see docker-compose.yml)
FROM node:20-alpine
WORKDIR /app

# Install workspace production dependencies first (better layer caching)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/gemini-service/package.json services/gemini-service/
RUN npm ci --omit=dev

# Copy the sources needed at runtime (shared is a pure-TS package, run via tsx)
COPY packages/shared/ packages/shared/
COPY services/gemini-service/ services/gemini-service/

WORKDIR /app/services/gemini-service
EXPOSE 8083
CMD ["npx", "tsx", "src/index.ts"]
