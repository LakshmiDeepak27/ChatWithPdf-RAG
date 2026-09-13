# Multi-stage Dockerfile for TalkToPdf Express API
FROM node:22-alpine AS deps
WORKDIR /app

# Install build dependencies if needed
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Create application user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure uploads directory exists and is writable
RUN mkdir -p uploads && chown -R appuser:nodejs uploads

USER appuser

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

CMD ["npm", "run", "server"]
