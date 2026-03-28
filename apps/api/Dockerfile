# apps/api/Dockerfile
# Multi-stage build for NestJS API

# --- Stage 1: Base ---
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# --- Stage 2: Dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --filter api...

# --- Stage 3: Development (used by docker-compose.yml) ---
FROM deps AS development
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/
EXPOSE 3001 9229
CMD ["pnpm", "--filter", "api", "dev"]

# --- Stage 4: Build ---
FROM deps AS build
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/
# Generate Prisma client
RUN pnpm --filter api prisma generate
# Build NestJS
RUN pnpm --filter api build

# --- Stage 5: Production ---
FROM node:22-alpine AS production

ARG BUILD_DATE
ARG GIT_SHA
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.title="stock-dashboard-api" \
      org.opencontainers.image.description="Stock Monitoring Dashboard — NestJS API"

RUN corepack enable && corepack prepare pnpm@9 --activate
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs
WORKDIR /app

# Copy only production dependencies and built output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/package.json ./package.json

# Create logs directory
RUN mkdir -p /app/logs && chown nestjs:nodejs /app/logs

USER nestjs
EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "dist/main.js"]
