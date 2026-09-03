# Build context: repository root (see docker-compose.yml)
FROM node:20-alpine
WORKDIR /app

# Install workspace production dependencies first (better layer caching)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/email-service/package.json services/email-service/
RUN npm ci --omit=dev

# Copy the sources needed at runtime (shared is a pure-TS package, run via tsx)
COPY packages/shared/ packages/shared/
COPY services/email-service/ services/email-service/

WORKDIR /app/services/email-service
EXPOSE 8085
CMD ["npx", "tsx", "src/index.ts"]
