# apps/web/Dockerfile
# Multi-stage build for Next.js frontend

# --- Stage 1: Base ---
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# --- Stage 2: Dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --filter web...

# --- Stage 3: Development ---
FROM deps AS development
COPY apps/web/ ./apps/web/
COPY packages/ ./packages/
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "dev"]

# --- Stage 4: Build ---
FROM deps AS build

# Build arguments for Next.js public env vars (baked at build time)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}

COPY apps/web/ ./apps/web/
COPY packages/ ./packages/

# Build Next.js with standalone output
RUN pnpm --filter web build

# --- Stage 5: Production ---
FROM node:22-alpine AS production

ARG BUILD_DATE
ARG GIT_SHA
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.title="stock-dashboard-web" \
      org.opencontainers.image.description="Stock Monitoring Dashboard — Next.js Frontend"

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs
WORKDIR /app

# Copy standalone Next.js output
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
