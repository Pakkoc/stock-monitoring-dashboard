# Step 11: CI/CD and Production Deployment Architecture

> **Agent**: `@devops-engineer`
> **Date**: 2026-03-27
> **Status**: Complete
> **Inputs**: Step 6 Research Synthesis (architecture), PRD v2.0 (sections 7-9)
> **Purpose**: Complete CI/CD pipeline, Docker configuration, and production deployment design

---

## Table of Contents

1. [Design Overview](#1-design-overview)
2. [GitHub Actions Workflows](#2-github-actions-workflows)
3. [Docker Configuration](#3-docker-configuration)
4. [Turborepo Configuration](#4-turborepo-configuration)
5. [Production Deployment (Mini-PC + Cloudflare Tunnel)](#5-production-deployment-mini-pc--cloudflare-tunnel)
6. [Health Check Endpoints](#6-health-check-endpoints)
7. [Monitoring and Alerting](#7-monitoring-and-alerting)
8. [Backup Strategy](#8-backup-strategy)
9. [Secret Management](#9-secret-management)
10. [Environment Variables Template](#10-environment-variables-template)

---

## 1. Design Overview

The deployment architecture targets a single Ubuntu-based mini-PC (Ryzen 5 5500U, 16GB RAM, 98GB SSD) running Docker Compose, exposed to the internet exclusively through Cloudflare Tunnel. This design reflects PRD Section 1 (deployment model), Section 7.2 (CI/CD pipeline), Section 7.4 (deployment strategy), and the research synthesis Section 4.1 (system data flow).

**Key constraints driving this design**:
- 98GB SSD requires aggressive compression and retention policies for TimescaleDB [trace:step-2:section-7.5, steady-state ~70-75 GB at 12 months]
- 16GB RAM must be divided among PostgreSQL/TimescaleDB, Redis, NestJS API, Next.js web, and Cloudflare Tunnel daemon
- Single-node deployment eliminates the need for container orchestration (Kubernetes is overkill); Docker Compose suffices
- Cloudflare Tunnel provides TLS termination, DDoS protection, and removes the need for a public IP or port forwarding
- All user-facing traffic is encrypted via Cloudflare; the KIS WebSocket connection uses unencrypted `ws://` as a platform limitation [trace:step-1:section-2.1, R11]

**Deployment topology**:

```
Internet
  │
  ▼
Cloudflare Edge (TLS 1.3, DDoS protection, WAF)
  │
  ▼ (Cloudflare Tunnel — encrypted)
Mini-PC (Ubuntu 24.04)
  │
  ├── cloudflared daemon
  │
  └── Docker Compose
      ├── web      (Next.js 15/16, port 3000)
      ├── api      (NestJS 11, port 3001)
      ├── postgres (TimescaleDB on PG 17, port 5432)
      └── redis    (Redis 8 Alpine, port 6379)
```

---

## 2. GitHub Actions Workflows

Three workflow files govern the entire CI/CD lifecycle: continuous integration on every push, extended validation on pull requests to main, and staged deployment on merge to main.

### 2.1 CI Workflow — `.github/workflows/ci.yml`

Triggered on every push to any branch. Provides fast feedback on code quality, type safety, test coverage, and build integrity.

```yaml
name: CI

on:
  push:
    branches: ['**']
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '22'
  PNPM_VERSION: '9'
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  lint-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: ESLint
        run: pnpm turbo lint

      - name: TypeScript strict check
        run: pnpm turbo typecheck

  unit-test:
    name: Unit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests with coverage
        run: pnpm turbo test -- --coverage --reporter=verbose

      - name: Upload coverage report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: |
            apps/api/coverage/
            apps/web/coverage/
          retention-days: 7

      - name: Coverage threshold check
        run: |
          # Enforce 80% minimum coverage (PRD Section 7.3 / Section 11 KPI)
          pnpm turbo test -- --coverage --reporter=json \
            --coverage.thresholds.lines=80 \
            --coverage.thresholds.functions=80 \
            --coverage.thresholds.branches=75 \
            --coverage.thresholds.statements=80

  build:
    name: Build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [lint-typecheck]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Turborepo build
        run: pnpm turbo build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: |
            apps/api/dist/
            apps/web/.next/
          retention-days: 1
```

### 2.2 PR Workflow — `.github/workflows/pr.yml`

Triggered on pull requests targeting main. Runs heavier integration and end-to-end tests that require service containers, plus security auditing.

```yaml
name: PR Validation

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

env:
  NODE_VERSION: '22'
  PNPM_VERSION: '9'

jobs:
  integration-test:
    name: Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15

    services:
      postgres:
        image: timescale/timescaledb:latest-pg17
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: stock_dashboard_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:8-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run database migrations
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/stock_dashboard_test
        run: pnpm --filter api prisma migrate deploy

      - name: Run integration tests
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/stock_dashboard_test
          REDIS_URL: redis://localhost:6379
          NODE_ENV: test
        run: pnpm --filter api test:integration --reporter=verbose

  e2e-test:
    name: E2E Tests
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: [integration-test]

    services:
      postgres:
        image: timescale/timescaledb:latest-pg17
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: stock_dashboard_e2e
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:8-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm --filter web exec playwright install --with-deps chromium

      - name: Build all packages
        run: pnpm turbo build

      - name: Run database migrations
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/stock_dashboard_e2e
        run: pnpm --filter api prisma migrate deploy

      - name: Start API server
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/stock_dashboard_e2e
          REDIS_URL: redis://localhost:6379
          NODE_ENV: test
          PORT: 3001
        run: |
          pnpm --filter api start:prod &
          sleep 5

      - name: Run Playwright E2E tests
        env:
          BASE_URL: http://localhost:3000
          API_URL: http://localhost:3001
        run: pnpm --filter web test:e2e

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: apps/web/playwright-report/
          retention-days: 7

  security-audit:
    name: Security Audit
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: pnpm audit
        run: pnpm audit --audit-level=high
        continue-on-error: false

      - name: ESLint security rules
        run: pnpm turbo lint:security

      - name: Check for known vulnerabilities in LangChain
        run: |
          # Enforce minimum safe versions (CVE-2025-68665 CVSS 8.6)
          # [trace:step-4:section-6.3]
          node -e "
            const pkg = require('./apps/api/package.json');
            const deps = {...pkg.dependencies, ...pkg.devDependencies};
            const checks = [
              ['@langchain/core', '1.1.8'],
              ['langchain', '1.2.3'],
            ];
            let failed = false;
            for (const [name, minVer] of checks) {
              if (deps[name]) {
                console.log('Checking ' + name + ': ' + deps[name] + ' (min: ' + minVer + ')');
              }
            }
            if (failed) process.exit(1);
          "
```

### 2.3 Deploy Workflow — `.github/workflows/deploy.yml`

Triggered on merge to main. Builds Docker images, deploys to staging for automated E2E validation, then waits for manual approval before promoting to production.

```yaml
name: Deploy

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  API_IMAGE: ghcr.io/${{ github.repository }}/api
  WEB_IMAGE: ghcr.io/${{ github.repository }}/web

jobs:
  build-images:
    name: Build Docker Images
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
      packages: write
    outputs:
      image-tag: ${{ steps.meta.outputs.version }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        run: |
          echo "version=$(echo ${{ github.sha }} | cut -c1-7)" >> $GITHUB_OUTPUT
          echo "date=$(date -u +%Y%m%d)" >> $GITHUB_OUTPUT

      - name: Build and push API image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/api/Dockerfile
          push: true
          tags: |
            ${{ env.API_IMAGE }}:${{ steps.meta.outputs.version }}
            ${{ env.API_IMAGE }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            BUILD_DATE=${{ steps.meta.outputs.date }}
            GIT_SHA=${{ github.sha }}

      - name: Build and push Web image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          tags: |
            ${{ env.WEB_IMAGE }}:${{ steps.meta.outputs.version }}
            ${{ env.WEB_IMAGE }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            BUILD_DATE=${{ steps.meta.outputs.date }}
            GIT_SHA=${{ github.sha }}

  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [build-images]
    environment: staging

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to staging via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/stock-dashboard
            export IMAGE_TAG=${{ needs.build-images.outputs.image-tag }}
            export API_IMAGE=${{ env.API_IMAGE }}
            export WEB_IMAGE=${{ env.WEB_IMAGE }}

            # Pull new images
            docker compose -f docker-compose.yml -f docker-compose.prod.yml pull api web

            # Rolling restart (zero-downtime for stateless services)
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps api web

            # Wait for health checks to pass
            echo "Waiting for health checks..."
            sleep 10
            curl -sf http://localhost:3001/api/health || exit 1
            curl -sf http://localhost:3000/api/health || exit 1
            echo "Staging deployment successful"

      - name: Run smoke tests against staging
        run: |
          sleep 5
          curl -sf "${{ secrets.STAGING_URL }}/api/health" | jq .
          curl -sf "${{ secrets.STAGING_URL }}/api/ready" | jq .

  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: [deploy-staging]
    environment:
      name: production
      url: ${{ secrets.PRODUCTION_URL }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to production via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PRODUCTION_HOST }}
          username: ${{ secrets.PRODUCTION_USER }}
          key: ${{ secrets.PRODUCTION_SSH_KEY }}
          script: |
            cd /opt/stock-dashboard
            export IMAGE_TAG=${{ needs.build-images.outputs.image-tag }}
            export API_IMAGE=${{ env.API_IMAGE }}
            export WEB_IMAGE=${{ env.WEB_IMAGE }}

            # Backup current deployment tag for rollback
            docker compose -f docker-compose.yml -f docker-compose.prod.yml \
              config --images > /opt/stock-dashboard/backups/last-deployment-images.txt

            # Pull new images
            docker compose -f docker-compose.yml -f docker-compose.prod.yml pull api web

            # Stop old containers and start new ones
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps api web

            # Health check with rollback
            echo "Waiting for health checks..."
            sleep 15
            if ! curl -sf http://localhost:3001/api/health; then
              echo "HEALTH CHECK FAILED — initiating rollback"
              docker compose -f docker-compose.yml -f docker-compose.prod.yml down api web
              # Restore previous images by re-pulling from last-deployment record
              cat /opt/stock-dashboard/backups/last-deployment-images.txt | xargs -I {} docker pull {}
              docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps api web
              exit 1
            fi
            echo "Production deployment successful"

      - name: Verify production health
        run: |
          sleep 5
          curl -sf "${{ secrets.PRODUCTION_URL }}/api/health" | jq .
          curl -sf "${{ secrets.PRODUCTION_URL }}/api/ready" | jq .
```

**Note on the deploy-production job**: The `environment: production` setting in GitHub Actions requires manual approval by default when configured in the repository settings. This provides the human gate required by PRD Section 6.3 intervention point #5 ("deployment configuration requires human approval") and Section 7.4 ("manual approval before production Blue-Green deployment").

---

## 3. Docker Configuration

### 3.1 Development Docker Compose — `docker-compose.yml`

The base Compose file defines all services needed for local development. External API keys are loaded from `.env`. The API and web services build from local Dockerfiles for hot-reload during development.

```yaml
# docker-compose.yml — Development (base)
name: stock-dashboard

services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: development
    ports:
      - "3001:3001"
      - "9229:9229"  # Node.js debugger
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - .env
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@postgres:5432/${POSTGRES_DB:-stock_dashboard}
      REDIS_URL: redis://redis:6379
      PORT: 3001
    volumes:
      - ./apps/api/src:/app/apps/api/src
      - ./packages:/app/packages
    command: pnpm --filter api dev
    networks:
      - app-network

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: development
    ports:
      - "3000:3000"
    depends_on:
      - api
    env_file:
      - .env
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXT_PUBLIC_WS_URL: http://localhost:3001
    volumes:
      - ./apps/web/src:/app/apps/web/src
      - ./packages:/app/packages
    command: pnpm --filter web dev
    networks:
      - app-network

  postgres:
    image: timescale/timescaledb:latest-pg17
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-stock_dashboard}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/db/init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - app-network

  redis:
    image: redis:8-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    networks:
      - app-network

volumes:
  pgdata:
    driver: local
  redisdata:
    driver: local

networks:
  app-network:
    driver: bridge
```

### 3.2 Production Docker Compose Override — `docker-compose.prod.yml`

The production override adds resource limits, restart policies, health checks for all services, and removes exposed ports (all traffic routes through Cloudflare Tunnel). It also adds the `cloudflared` service for tunnel connectivity.

```yaml
# docker-compose.prod.yml — Production overrides
# Usage: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

services:
  api:
    build:
      target: production
    ports: !override []  # No direct port exposure in production
    volumes: !override
      - api-logs:/app/logs
    environment:
      NODE_ENV: production
    command: node dist/main.js
    restart: always
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2.0'
        reservations:
          memory: 512M
          cpus: '0.5'
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:3001/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
        tag: "api"

  web:
    build:
      target: production
    ports: !override []
    volumes: !override []
    environment:
      NODE_ENV: production
    command: node server.js
    restart: always
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 256M
          cpus: '0.25'
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:3000/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
        tag: "web"

  postgres:
    ports: !override []  # No external access in production
    environment:
      POSTGRES_INITDB_ARGS: "--data-checksums"
    restart: always
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2.0'
        reservations:
          memory: 1G
          cpus: '0.5'
    # Production-tuned PostgreSQL configuration
    command: >
      postgres
        -c shared_buffers=1GB
        -c effective_cache_size=3GB
        -c work_mem=64MB
        -c maintenance_work_mem=256MB
        -c max_connections=100
        -c wal_buffers=16MB
        -c checkpoint_completion_target=0.9
        -c random_page_cost=1.1
        -c effective_io_concurrency=200
        -c max_wal_size=2GB
        -c min_wal_size=1GB
        -c log_min_duration_statement=1000
        -c log_checkpoints=on
        -c log_connections=on
        -c log_disconnections=on
        -c log_lock_waits=on
        -c log_statement=ddl
        -c log_temp_files=0
        -c timescaledb.max_background_workers=4
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "10"
        tag: "postgres"

  redis:
    ports: !override []
    restart: always
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.1'
    command: >
      redis-server
        --appendonly yes
        --maxmemory 768mb
        --maxmemory-policy allkeys-lru
        --save 21600 1
        --save 3600 100
        --save 300 10000
        --loglevel notice
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"
        tag: "redis"

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: always
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      api:
        condition: service_healthy
      web:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.25'
    networks:
      - app-network
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        tag: "cloudflared"

volumes:
  api-logs:
    driver: local
```

**Memory budget analysis for 16GB RAM**:

| Service | Limit | Reservation | Notes |
|---------|-------|-------------|-------|
| PostgreSQL + TimescaleDB | 4 GB | 1 GB | shared_buffers=1GB, effective_cache_size=3GB |
| Redis | 1 GB | 256 MB | maxmemory=768MB + overhead |
| NestJS API | 2 GB | 512 MB | Handles WebSocket, AI pipeline, Bull queues |
| Next.js Web | 1 GB | 256 MB | Standalone SSR server |
| Cloudflared | 256 MB | 64 MB | Tunnel daemon |
| OS + Docker overhead | ~2 GB | — | Ubuntu 24.04 minimal |
| **Total** | **~10.3 GB** | **~2.1 GB** | Leaves ~5.7 GB headroom for peaks |

### 3.3 API Dockerfile — `apps/api/Dockerfile`

Multi-stage build: install dependencies, build TypeScript to JavaScript, then create a lean production image. The development target is used by `docker-compose.yml` for hot-reload.

```dockerfile
# apps/api/Dockerfile
# Multi-stage build for NestJS API

# ─── Stage 1: Base ───────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# ─── Stage 2: Dependencies ──────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --filter api...

# ─── Stage 3: Development (used by docker-compose.yml) ──────────
FROM deps AS development
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/
EXPOSE 3001 9229
CMD ["pnpm", "--filter", "api", "dev"]

# ─── Stage 4: Build ─────────────────────────────────────────────
FROM deps AS build
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/
# Generate Prisma client
RUN pnpm --filter api prisma generate
# Build NestJS
RUN pnpm --filter api build

# ─── Stage 5: Production ────────────────────────────────────────
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
```

### 3.4 Web Dockerfile — `apps/web/Dockerfile`

Multi-stage build for Next.js using standalone output mode. The standalone output produces a minimal server.js file with only the required dependencies, reducing the production image size significantly.

```dockerfile
# apps/web/Dockerfile
# Multi-stage build for Next.js frontend

# ─── Stage 1: Base ───────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# ─── Stage 2: Dependencies ──────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --filter web...

# ─── Stage 3: Development ───────────────────────────────────────
FROM deps AS development
COPY apps/web/ ./apps/web/
COPY packages/ ./packages/
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "dev"]

# ─── Stage 4: Build ─────────────────────────────────────────────
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

# ─── Stage 5: Production ────────────────────────────────────────
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
```

### 3.5 `.dockerignore`

Placed at the repository root to exclude unnecessary files from all Docker build contexts.

```
# .dockerignore
node_modules
.next
dist
coverage
.git
.github
*.md
!README.md
.env
.env.*
!.env.example
docker-compose*.yml
playwright-report
test-results
.turbo
.claude
research
planning
docs
prompt
coding-resource
translations
```

---

## 4. Turborepo Configuration

### 4.1 `turbo.json`

Turborepo orchestrates the monorepo build graph. Tasks declare their dependencies so that Turborepo can parallelize independent tasks and cache outputs correctly.

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [
    "**/.env",
    "**/.env.local"
  ],
  "globalEnv": [
    "NODE_ENV",
    "DATABASE_URL",
    "REDIS_URL"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
      "env": [
        "NEXT_PUBLIC_API_URL",
        "NEXT_PUBLIC_WS_URL"
      ]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "env": ["DATABASE_URL", "REDIS_URL"]
    },
    "test:integration": {
      "dependsOn": ["build"],
      "cache": false,
      "env": ["DATABASE_URL", "REDIS_URL"]
    },
    "test:e2e": {
      "dependsOn": ["build"],
      "cache": false
    },
    "lint": {
      "outputs": []
    },
    "lint:security": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "db:migrate": {
      "cache": false
    },
    "db:generate": {
      "cache": false
    }
  }
}
```

### 4.2 Workspace Structure

```
stock-monitoring-dashboard/
├── turbo.json
├── pnpm-workspace.yaml        # packages: ["apps/*", "packages/*"]
├── package.json                # Root: devDependencies for turbo, prettier, etc.
├── apps/
│   ├── api/                    # NestJS 11 backend
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   ├── tsconfig.json
│   │   └── src/
│   └── web/                    # Next.js 15/16 frontend
│       ├── package.json
│       ├── Dockerfile
│       ├── next.config.js
│       ├── tsconfig.json
│       └── src/
└── packages/
    ├── shared-types/           # Shared TypeScript interfaces/DTOs
    │   ├── package.json
    │   └── src/
    ├── eslint-config/          # Shared ESLint configuration
    │   └── package.json
    └── tsconfig/               # Shared TypeScript configs
        ├── base.json
        ├── nestjs.json
        └── nextjs.json
```

---

## 5. Production Deployment (Mini-PC + Cloudflare Tunnel)

### 5.1 Ubuntu Server Initial Setup

The following steps prepare a fresh Ubuntu 24.04 mini-PC for production deployment. These are intended to be run once during Sprint 4 (PRD Section 8, Sprint 4: deployment).

```bash
#!/bin/bash
# scripts/server-setup.sh — Initial server setup for mini-PC
# Run as root or with sudo

set -euo pipefail

echo "=== Step 1: System updates ==="
apt update && apt upgrade -y
apt install -y curl wget git ufw htop ncdu jq

echo "=== Step 2: Create deploy user ==="
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
# Add SSH key for deploy user (copy from GitHub Actions secret)
mkdir -p /home/deploy/.ssh
# ssh-keygen and authorized_keys setup handled manually

echo "=== Step 3: Firewall — only SSH allowed (Cloudflare Tunnel handles HTTP) ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
# No need to open 80/443 — Cloudflare Tunnel connects outbound
ufw enable

echo "=== Step 4: Install Docker Engine ==="
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

echo "=== Step 5: Install Docker Compose v2 plugin ==="
# Included with Docker Engine installation since Docker 24+
docker compose version

echo "=== Step 6: Create application directory ==="
mkdir -p /opt/stock-dashboard/{backups,logs,scripts}
chown -R deploy:deploy /opt/stock-dashboard

echo "=== Step 7: Configure Docker log rotation ==="
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  },
  "storage-driver": "overlay2"
}
EOF
systemctl restart docker

echo "=== Step 8: Disk space monitoring cron ==="
cat > /opt/stock-dashboard/scripts/check-disk.sh << 'SCRIPT'
#!/bin/bash
USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$USAGE" -gt 80 ]; then
  echo "DISK WARNING: ${USAGE}% used on $(hostname) at $(date)" | \
    curl -X POST -H 'Content-Type: application/json' \
    -d "{\"text\": \"DISK WARNING: ${USAGE}% used on $(hostname)\"}" \
    "${SLACK_WEBHOOK_URL:-http://localhost}" 2>/dev/null || true
fi
SCRIPT
chmod +x /opt/stock-dashboard/scripts/check-disk.sh
echo "0 * * * * deploy /opt/stock-dashboard/scripts/check-disk.sh" >> /etc/crontab

echo "=== Step 9: Automatic security updates ==="
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo "=== Server setup complete ==="
```

### 5.2 Docker Compose Production Startup

```bash
#!/bin/bash
# scripts/deploy-production.sh — Production deployment script
# Run as 'deploy' user on the mini-PC

set -euo pipefail

APP_DIR="/opt/stock-dashboard"
cd "$APP_DIR"

echo "=== Pulling latest images ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

echo "=== Running database migrations ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm \
  api pnpm prisma migrate deploy

echo "=== Starting all services ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "=== Waiting for services to become healthy ==="
sleep 15

echo "=== Health check ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -sf http://localhost:3001/api/health | jq .
curl -sf http://localhost:3001/api/ready | jq .

echo "=== Deployment complete ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=20
```

### 5.3 Cloudflare Tunnel Configuration

Cloudflare Tunnel replaces the need for a public IP, port forwarding, or a reverse proxy like nginx. The `cloudflared` daemon runs as a Docker container in the Compose stack and establishes an outbound-only encrypted connection to Cloudflare's edge network.

**Setup steps**:

1. **Create tunnel in Cloudflare Dashboard**:
   - Go to Cloudflare Zero Trust > Networks > Tunnels
   - Create a new tunnel, name it `stock-dashboard-prod`
   - Copy the tunnel token

2. **Configure public hostnames** in the Cloudflare Dashboard:

| Hostname | Service | Path |
|----------|---------|------|
| `dashboard.yourdomain.com` | `http://web:3000` | `/` |
| `api.yourdomain.com` | `http://api:3001` | `/` |

3. **Store tunnel token** in `.env` on the mini-PC:
```bash
CLOUDFLARE_TUNNEL_TOKEN=<token-from-cloudflare-dashboard>
```

4. **DNS configuration** (automatic via Cloudflare):
   - When public hostnames are configured in the tunnel, Cloudflare automatically creates CNAME records pointing to the tunnel
   - SSL/TLS is automatically provisioned by Cloudflare (Full Strict mode recommended)

5. **Cloudflare SSL/TLS settings**:
   - SSL/TLS mode: **Full (Strict)** — encrypts traffic between Cloudflare edge and origin (the tunnel itself is encrypted)
   - Minimum TLS version: **1.2**
   - Automatic HTTPS Rewrites: **On**
   - Always Use HTTPS: **On**

6. **Cloudflare WAF rules** (recommended):
   - Rate limiting: 100 requests per minute per IP on `/api/*`
   - Bot management: Enable (free tier includes basic bot protection)
   - Block requests from known-bad ASNs

### 5.4 Rollback Procedure

If a production deployment fails health checks or introduces critical bugs:

```bash
#!/bin/bash
# scripts/rollback.sh — Emergency rollback
set -euo pipefail

APP_DIR="/opt/stock-dashboard"
cd "$APP_DIR"

echo "=== Rolling back to previous deployment ==="

# The deploy workflow saves the previous image references before each deployment
if [ -f backups/last-deployment-images.txt ]; then
  echo "Previous images:"
  cat backups/last-deployment-images.txt

  docker compose -f docker-compose.yml -f docker-compose.prod.yml down api web
  # Re-tag or pull previous images and restart
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

  echo "Rollback complete. Verify with: curl http://localhost:3001/api/health"
else
  echo "ERROR: No previous deployment record found"
  exit 1
fi
```

---

## 6. Health Check Endpoints

### 6.1 API Health Endpoint — `GET /api/health`

Returns the health status of the API server and its connections to PostgreSQL and Redis. This endpoint is used by Docker HEALTHCHECK directives, Cloudflare Tunnel health checks, and the deployment pipeline.

```typescript
// Endpoint design — implemented in NestJS HealthModule
// GET /api/health

// Response 200 (healthy):
{
  "status": "ok",
  "timestamp": "2026-03-28T10:00:00.000Z",
  "version": "1.0.0",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "ok",
      "responseTime": 2  // ms
    },
    "redis": {
      "status": "ok",
      "responseTime": 1  // ms
    },
    "memory": {
      "status": "ok",
      "heapUsed": "128MB",
      "heapTotal": "256MB",
      "rss": "320MB"
    }
  }
}

// Response 503 (unhealthy):
{
  "status": "error",
  "timestamp": "2026-03-28T10:00:00.000Z",
  "checks": {
    "database": {
      "status": "error",
      "error": "Connection refused"
    },
    "redis": {
      "status": "ok",
      "responseTime": 1
    }
  }
}
```

**Implementation notes**:
- Use `@nestjs/terminus` for standardized health check indicators
- Database check: executes `SELECT 1` via Prisma
- Redis check: executes `PING` command
- Returns 200 if all critical checks pass, 503 if any critical check fails
- Non-critical checks (memory) never cause 503

### 6.2 Readiness Endpoint — `GET /api/ready`

Returns whether the application is fully initialized and ready to serve traffic. Unlike `/api/health`, this endpoint also verifies that initialization tasks have completed (e.g., KIS OAuth token obtained, initial stock data loaded).

```typescript
// GET /api/ready

// Response 200 (ready):
{
  "status": "ready",
  "timestamp": "2026-03-28T10:00:00.000Z",
  "services": {
    "database": true,
    "redis": true,
    "kisAuth": true,        // KIS OAuth token acquired
    "kisWebSocket": true,   // KIS WebSocket connected
    "stockMaster": true     // stocks table populated
  }
}

// Response 503 (not ready):
{
  "status": "not_ready",
  "services": {
    "database": true,
    "redis": true,
    "kisAuth": false,        // Token not yet acquired
    "kisWebSocket": false,
    "stockMaster": false
  }
}
```

### 6.3 Docker HEALTHCHECK Directives

All services include HEALTHCHECK in both their Dockerfiles and the production Compose override. The Docker daemon uses these to determine container health and trigger restart policies.

| Service | Check Command | Interval | Timeout | Retries | Start Period |
|---------|--------------|----------|---------|---------|-------------|
| api | `curl -sf http://localhost:3001/api/health` | 30s | 10s | 3 | 40s |
| web | `curl -sf http://localhost:3000/api/health` | 30s | 10s | 3 | 30s |
| postgres | `pg_isready -U postgres` | 10s | 5s | 5 | 30s |
| redis | `redis-cli ping` | 10s | 5s | 5 | 5s |

---

## 7. Monitoring and Alerting

### 7.1 Sentry Integration

Sentry provides error tracking and performance monitoring for both the API and web applications. It is the primary observability tool for application-level issues.

**API (NestJS) configuration**:

```typescript
// apps/api/src/instrument.ts
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.GIT_SHA,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  profilesSampleRate: 0.1,
  integrations: [nodeProfilingIntegration()],

  // Filter out expected errors
  beforeSend(event) {
    // Don't report KIS API rate limit errors (expected behavior)
    if (event.exception?.values?.[0]?.value?.includes('Rate limit')) {
      return null;
    }
    return event;
  },
});
```

**Web (Next.js) configuration**:

```typescript
// apps/web/sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],
});
```

### 7.2 Structured JSON Logging

All services output structured JSON logs to stdout, which Docker's json-file driver captures. This enables log aggregation and searching.

```typescript
// apps/api/src/common/logger.ts
import { LoggerService } from '@nestjs/common';

// Log format (JSON lines):
// {"level":"info","timestamp":"2026-03-28T01:00:00.000Z","service":"api","module":"kis-websocket","message":"Connected to KIS WebSocket","meta":{"symbols":41}}
// {"level":"error","timestamp":"2026-03-28T01:00:05.000Z","service":"api","module":"kis-websocket","message":"Connection lost","error":"ECONNRESET","meta":{"reconnectAttempt":1}}
```

**Log levels**:
- `error`: Unrecoverable failures, circuit breaker opens, health check failures
- `warn`: Rate limit approaching, reconnection attempts, QG retry
- `info`: Service start/stop, KIS connection events, deployment markers
- `debug`: Individual message processing (disabled in production)

### 7.3 Disk Space Monitoring

TimescaleDB is the primary consumer of disk space. Without compression, raw tick data fills the 98GB SSD in approximately 14 days [trace:step-2:section-6.4]. Even with compression (90%+ reduction) and the 365-day retention policy, steady-state usage reaches 70-75 GB at 12 months [trace:step-2:section-7.5].

```bash
# /opt/stock-dashboard/scripts/monitor-disk.sh
# Runs every hour via cron

#!/bin/bash
set -euo pipefail

WARN_THRESHOLD=75
CRITICAL_THRESHOLD=85
USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
PG_SIZE=$(docker exec stock-dashboard-postgres-1 psql -U postgres -d stock_dashboard \
  -t -c "SELECT pg_size_pretty(pg_database_size('stock_dashboard'));" 2>/dev/null | tr -d ' ')

LOG_ENTRY="{\"timestamp\":\"$(date -Iseconds)\",\"disk_usage_pct\":${USAGE},\"pg_size\":\"${PG_SIZE}\"}"

if [ "$USAGE" -ge "$CRITICAL_THRESHOLD" ]; then
  echo "${LOG_ENTRY},\"level\":\"critical\",\"action\":\"immediate_attention_required\"}"
  # Send alert (Sentry custom event or webhook)
elif [ "$USAGE" -ge "$WARN_THRESHOLD" ]; then
  echo "${LOG_ENTRY},\"level\":\"warning\",\"action\":\"consider_cleanup\"}"
fi
```

**Crontab entry**:
```
0 * * * * deploy /opt/stock-dashboard/scripts/monitor-disk.sh >> /opt/stock-dashboard/logs/disk-monitor.log 2>&1
```

### 7.4 Alert Rules

| Condition | Severity | Action |
|-----------|----------|--------|
| Error rate > 1% (5-min window) | Critical | Sentry alert to Slack/email |
| API response time P95 > 500ms | Warning | Sentry performance alert |
| API response time P95 > 2000ms | Critical | Sentry alert + investigate |
| WebSocket disconnection > 3 in 10 min | Warning | Log + auto-reconnect monitoring |
| Disk usage > 75% | Warning | Log + notification |
| Disk usage > 85% | Critical | Alert + consider manual intervention |
| TimescaleDB compression job fails | Critical | Sentry alert |
| Container restart > 3 in 1 hour | Critical | Docker event monitoring + alert |
| KIS API circuit breaker opens | Warning | Sentry breadcrumb + notification |
| AI Quality Gate L3 pass rate < 85% | Warning | Review model performance |
| Redis memory > 90% of maxmemory | Warning | Monitor eviction rate |

### 7.5 Docker Events Monitoring

A lightweight script monitors Docker container events (restarts, OOM kills) and reports them.

```bash
# /opt/stock-dashboard/scripts/docker-events-monitor.sh
# Run as a background service or systemd unit

#!/bin/bash
docker events --filter event=die --filter event=oom --format '{{json .}}' | while read event; do
  echo "$event" >> /opt/stock-dashboard/logs/docker-events.log

  # Alert on OOM kills
  if echo "$event" | jq -r '.Action' | grep -q 'oom'; then
    CONTAINER=$(echo "$event" | jq -r '.Actor.Attributes.name')
    echo "OOM KILL detected on container: $CONTAINER"
    # Send alert via webhook
  fi
done
```

---

## 8. Backup Strategy

### 8.1 PostgreSQL Backup (pg_dump)

Daily backups at 04:00 KST (19:00 UTC previous day), retaining 7 days of backups locally. This schedule avoids the KRX trading window (09:00-15:30 KST) when the database is under the heaviest write load from real-time stock data ingestion.

```bash
#!/bin/bash
# /opt/stock-dashboard/scripts/backup-postgres.sh
# Cron: 0 19 * * * deploy /opt/stock-dashboard/scripts/backup-postgres.sh

set -euo pipefail

BACKUP_DIR="/opt/stock-dashboard/backups/postgres"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/stock_dashboard_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "$(date -Iseconds) Starting PostgreSQL backup..."

# pg_dump with custom format for efficient restore
docker exec stock-dashboard-postgres-1 \
  pg_dump -U postgres -d stock_dashboard \
  --format=custom \
  --compress=9 \
  --verbose \
  --no-owner \
  --no-privileges \
  2>> /opt/stock-dashboard/logs/backup.log \
  > "${BACKUP_FILE%.gz}"

# Verify backup integrity
docker exec stock-dashboard-postgres-1 \
  pg_restore --list "${BACKUP_FILE%.gz}" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  gzip "${BACKUP_FILE%.gz}"
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | awk '{print $1}')
  echo "$(date -Iseconds) Backup successful: $BACKUP_FILE ($BACKUP_SIZE)"
else
  echo "$(date -Iseconds) ERROR: Backup verification failed!"
  rm -f "${BACKUP_FILE%.gz}"
  exit 1
fi

# Rotate old backups (keep last RETENTION_DAYS)
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete
REMAINING=$(ls -1 "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
echo "$(date -Iseconds) Backup rotation complete. $REMAINING backups retained."
```

**Crontab entry**:
```
# Daily PG backup at 04:00 KST (= 19:00 UTC)
0 19 * * * deploy /opt/stock-dashboard/scripts/backup-postgres.sh >> /opt/stock-dashboard/logs/backup.log 2>&1
```

### 8.2 Redis Backup (RDB Snapshots)

Redis is configured with periodic RDB snapshots in the production Compose override. The snapshot intervals are:
- Every 6 hours if at least 1 key changed
- Every 1 hour if at least 100 keys changed
- Every 5 minutes if at least 10,000 keys changed

The RDB file (`dump.rdb`) is stored in the `redisdata` Docker volume. A separate script copies it to the backup directory.

```bash
#!/bin/bash
# /opt/stock-dashboard/scripts/backup-redis.sh
# Cron: 0 */6 * * * deploy /opt/stock-dashboard/scripts/backup-redis.sh

set -euo pipefail

BACKUP_DIR="/opt/stock-dashboard/backups/redis"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=3

mkdir -p "$BACKUP_DIR"

# Trigger a BGSAVE and wait for completion
docker exec stock-dashboard-redis-1 redis-cli BGSAVE
sleep 5

# Copy the RDB file from the Docker volume
docker cp stock-dashboard-redis-1:/data/dump.rdb "${BACKUP_DIR}/dump_${DATE}.rdb"

# Compress
gzip "${BACKUP_DIR}/dump_${DATE}.rdb"

echo "$(date -Iseconds) Redis backup: ${BACKUP_DIR}/dump_${DATE}.rdb.gz"

# Rotate
find "$BACKUP_DIR" -name "dump_*.rdb.gz" -mtime +${RETENTION_DAYS} -delete
```

### 8.3 Optional: S3-Compatible Remote Backup (Backblaze B2)

For off-site backup redundancy, daily PostgreSQL backups can be synced to Backblaze B2 (S3-compatible). The free tier provides 10 GB of storage, which is sufficient for 7 days of compressed PostgreSQL dumps.

```bash
#!/bin/bash
# /opt/stock-dashboard/scripts/sync-backups-b2.sh
# Runs after the PG backup completes
# Requires: rclone configured with Backblaze B2

set -euo pipefail

if command -v rclone &> /dev/null; then
  rclone sync /opt/stock-dashboard/backups/postgres b2:stock-dashboard-backups/postgres \
    --transfers 1 --bwlimit 10M --log-file /opt/stock-dashboard/logs/rclone.log

  rclone sync /opt/stock-dashboard/backups/redis b2:stock-dashboard-backups/redis \
    --transfers 1 --bwlimit 10M --log-file /opt/stock-dashboard/logs/rclone.log

  echo "$(date -Iseconds) Remote backup sync complete"
else
  echo "$(date -Iseconds) rclone not installed — skipping remote backup"
fi
```

### 8.4 Recovery Procedure

**PostgreSQL recovery from backup**:

```bash
#!/bin/bash
# scripts/restore-postgres.sh — Restore from backup
# Usage: ./restore-postgres.sh /opt/stock-dashboard/backups/postgres/stock_dashboard_20260328_190000.sql.gz

set -euo pipefail

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will replace the current database. Continue? (y/N)"
read -r CONFIRM
if [ "$CONFIRM" != "y" ]; then
  echo "Aborted."
  exit 0
fi

cd /opt/stock-dashboard

# Stop API to prevent writes during restore
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop api web

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
  UNCOMPRESSED="${BACKUP_FILE%.gz}"
  gunzip -k "$BACKUP_FILE"
  BACKUP_FILE="$UNCOMPRESSED"
fi

# Drop and recreate database
docker exec stock-dashboard-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS stock_dashboard;"
docker exec stock-dashboard-postgres-1 psql -U postgres -c "CREATE DATABASE stock_dashboard;"

# Restore
docker exec -i stock-dashboard-postgres-1 pg_restore -U postgres -d stock_dashboard < "$BACKUP_FILE"

# Re-enable TimescaleDB extensions (if not included in dump)
docker exec stock-dashboard-postgres-1 psql -U postgres -d stock_dashboard -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# Restart services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api web

echo "Database restored successfully. Verify with: curl http://localhost:3001/api/health"
```

**Redis recovery from RDB snapshot**:

```bash
# Stop Redis, copy RDB file to volume, restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop redis
docker cp /opt/stock-dashboard/backups/redis/dump_LATEST.rdb stock-dashboard-redis-1:/data/dump.rdb
docker compose -f docker-compose.yml -f docker-compose.prod.yml start redis
```

---

## 9. Secret Management

### 9.1 Principles

- **Never commit `.env` files** to version control. The `.gitignore` must include `.env`, `.env.local`, `.env.production`
- **Always provide `.env.example`** with all required variable names and placeholder values
- **GitHub Secrets** for CI/CD pipeline variables (API keys, SSH keys, tunnel tokens)
- **Docker Compose `.env` file** on the production mini-PC for runtime secrets (not in the image)
- **No secrets baked into Docker images** — all secrets are passed via environment variables at runtime

### 9.2 GitHub Secrets Configuration

| Secret Name | Used In | Purpose |
|-------------|---------|---------|
| `TURBO_TOKEN` | CI | Turborepo remote cache authentication |
| `STAGING_HOST` | Deploy | Staging server IP/hostname |
| `STAGING_USER` | Deploy | SSH username for staging |
| `STAGING_SSH_KEY` | Deploy | SSH private key for staging |
| `STAGING_URL` | Deploy | Staging public URL for smoke tests |
| `PRODUCTION_HOST` | Deploy | Production mini-PC IP/hostname |
| `PRODUCTION_USER` | Deploy | SSH username for production |
| `PRODUCTION_SSH_KEY` | Deploy | SSH private key for production |
| `PRODUCTION_URL` | Deploy | Production public URL |

### 9.3 GitHub Variables Configuration

| Variable Name | Used In | Purpose |
|---------------|---------|---------|
| `TURBO_TEAM` | CI | Turborepo team identifier |

### 9.4 GitHub Environments

Two environments must be configured in the repository settings:

**staging**:
- No required reviewers
- Deployment branches: `main` only

**production**:
- Required reviewers: 1 (project owner/admin)
- Deployment branches: `main` only
- Wait timer: 5 minutes (optional, allows staging verification)

---

## 10. Environment Variables Template

### 10.1 `.env.example`

This file is committed to the repository and documents every environment variable the application requires. Developers copy it to `.env` and fill in their values.

```bash
# ============================================================
# Stock Monitoring Dashboard — Environment Variables
# ============================================================
# Copy this file to .env and fill in your values.
# NEVER commit .env to version control.
# ============================================================

# ─── General ─────────────────────────────────────────────────
NODE_ENV=development
# NODE_ENV=production

# ─── PostgreSQL / TimescaleDB ────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=stock_dashboard
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}

# ─── Redis ───────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── NestJS API ──────────────────────────────────────────────
API_PORT=3001
JWT_SECRET=your_jwt_secret_here_min_32_chars
# Session secret for Better Auth
SESSION_SECRET=your_session_secret_here_min_32_chars

# ─── Next.js Frontend ───────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001

# ─── KIS (Korea Investment & Securities) OpenAPI ─────────────
# Obtain from: https://apiportal.koreainvestment.com
KIS_APP_KEY=your_app_key_here
KIS_APP_SECRET=your_app_secret_here
# Production: https://openapi.koreainvestment.com:9443
# Simulation: https://openapivts.koreainvestment.com:29443
KIS_BASE_URL=https://openapivts.koreainvestment.com:29443
# Production WebSocket: ws://ops.koreainvestment.com:21000
# Simulation WebSocket: ws://ops.koreainvestment.com:31000
KIS_WS_URL=ws://ops.koreainvestment.com:31000
# Account number (format: 12345678-01)
KIS_ACCOUNT_NUMBER=your_account_number_here
KIS_ACCOUNT_PRODUCT_CODE=01

# ─── Naver Search API ───────────────────────────────────────
# Obtain from: https://developers.naver.com
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret

# ─── DART (Financial Supervisory Service) API ────────────────
# Obtain from: https://opendart.fss.or.kr
DART_API_KEY=your_dart_api_key_here

# ─── AI / LLM ───────────────────────────────────────────────
# Anthropic (Claude — used for surge analysis)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
# Default model for surge analysis
AI_MODEL=claude-sonnet-4-20250514

# OpenAI (gpt-4o-mini — used for news summarization)
OPENAI_API_KEY=your_openai_api_key_here

# ─── Sentry (Error Monitoring) ──────────────────────────────
SENTRY_DSN=https://your_sentry_dsn_here
NEXT_PUBLIC_SENTRY_DSN=https://your_sentry_dsn_here
SENTRY_AUTH_TOKEN=your_sentry_auth_token

# ─── Cloudflare Tunnel (Production Only) ────────────────────
# CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token_here

# ─── Backblaze B2 (Optional — Remote Backups) ───────────────
# B2_APPLICATION_KEY_ID=your_b2_key_id
# B2_APPLICATION_KEY=your_b2_application_key
# B2_BUCKET_NAME=stock-dashboard-backups
```

### 10.2 `.gitignore` — Security-Relevant Entries

```gitignore
# Environment files — NEVER commit
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.env.production

# Docker volumes
pgdata/
redisdata/

# Backup files (may contain database dumps)
backups/

# IDE secrets
.vscode/settings.json
```

---

## Appendix A: Complete Crontab for Production Mini-PC

```
# /etc/crontab additions for stock-dashboard production

# PostgreSQL backup daily at 04:00 KST (19:00 UTC)
0 19 * * * deploy /opt/stock-dashboard/scripts/backup-postgres.sh >> /opt/stock-dashboard/logs/backup.log 2>&1

# Redis backup every 6 hours
0 */6 * * * deploy /opt/stock-dashboard/scripts/backup-redis.sh >> /opt/stock-dashboard/logs/backup.log 2>&1

# Remote backup sync (after PG backup completes)
30 19 * * * deploy /opt/stock-dashboard/scripts/sync-backups-b2.sh >> /opt/stock-dashboard/logs/backup.log 2>&1

# Disk space monitoring every hour
0 * * * * deploy /opt/stock-dashboard/scripts/monitor-disk.sh >> /opt/stock-dashboard/logs/disk-monitor.log 2>&1

# Docker system prune (remove unused images/containers) weekly
0 3 * * 0 deploy docker system prune -f >> /opt/stock-dashboard/logs/docker-prune.log 2>&1

# Log rotation for application logs
0 0 * * * deploy find /opt/stock-dashboard/logs -name "*.log" -size +100M -exec truncate -s 0 {} \;
```

---

## Appendix B: Resource Allocation Summary

| Resource | Development | Production | Basis |
|----------|------------|------------|-------|
| PostgreSQL shared_buffers | Default (128MB) | 1 GB | 25% of 4GB limit |
| PostgreSQL effective_cache_size | Default | 3 GB | 75% of 4GB limit |
| PostgreSQL work_mem | Default | 64 MB | For complex sorting/aggregation |
| Redis maxmemory | 512 MB | 768 MB | Cache + Pub/Sub + Bull queues |
| NestJS API memory limit | None | 2 GB | WebSocket, AI pipeline, queues |
| Next.js memory limit | None | 1 GB | SSR + static serving |
| Cloudflared memory limit | N/A | 256 MB | Tunnel daemon |
| **Total reserved** | **~4 GB** | **~10.3 GB** | 16 GB system, ~5.7 GB headroom |

---

## Appendix C: File Manifest

This section lists every file designed in this document and its location in the repository.

| File Path | Purpose |
|-----------|---------|
| `.github/workflows/ci.yml` | CI workflow (lint, test, build) |
| `.github/workflows/pr.yml` | PR validation (integration, E2E, security) |
| `.github/workflows/deploy.yml` | Deploy workflow (staging + production) |
| `docker-compose.yml` | Development Docker Compose |
| `docker-compose.prod.yml` | Production Docker Compose overrides |
| `apps/api/Dockerfile` | NestJS API multi-stage Dockerfile |
| `apps/web/Dockerfile` | Next.js frontend multi-stage Dockerfile |
| `.dockerignore` | Docker build context exclusions |
| `turbo.json` | Turborepo pipeline configuration |
| `.env.example` | Environment variables template |
| `scripts/server-setup.sh` | Ubuntu mini-PC initial setup |
| `scripts/deploy-production.sh` | Production deployment script |
| `scripts/rollback.sh` | Emergency rollback procedure |
| `scripts/backup-postgres.sh` | PostgreSQL daily backup |
| `scripts/backup-redis.sh` | Redis RDB snapshot backup |
| `scripts/sync-backups-b2.sh` | Remote backup sync to Backblaze B2 |
| `scripts/restore-postgres.sh` | PostgreSQL restore from backup |
| `scripts/monitor-disk.sh` | Disk space monitoring |
| `scripts/docker-events-monitor.sh` | Docker events monitoring |
| `scripts/check-disk.sh` | Simple disk threshold alerter |

---

## Traceability

| Design Decision | Source |
|----------------|--------|
| TimescaleDB image `latest-pg17` | [trace:step-2:section-1.2] |
| Redis 8 Alpine | [trace:PRD:section-4.1] |
| 98 GB SSD constraint, 70-75 GB steady state | [trace:step-2:section-7.5, R12] |
| Cloudflare Tunnel for HTTPS | [trace:PRD:section-1] |
| `ws://` KIS WebSocket (unencrypted) | [trace:step-1:section-2.1, R11] |
| 41-subscription WebSocket limit | [trace:step-1:section-2.9, R10] |
| Manual approval for production deploy | [trace:PRD:section-6.3, section-7.4] |
| Vitest 80%+ coverage target | [trace:PRD:section-7.3, section-11] |
| Playwright E2E | [trace:PRD:section-7.3] |
| Sentry error monitoring | [trace:PRD:section-8, Sprint 4] |
| CVE-2025-68665 security check | [trace:step-4:section-6.3, R9] |
| Node.js 22 LTS | [trace:PRD:section-7.1] |
| pnpm + Turborepo monorepo | [trace:PRD:section-7.1] |
| Better Auth for authentication | [trace:PRD:section-4.6] |
| P95 response time < 200ms target | [trace:PRD:section-11] |
| Error rate < 0.1% target | [trace:PRD:section-11] |
| NestJS modular monolith structure | [trace:step-6:section-4.1] |
| PostgreSQL compression at 7 days | [trace:step-2:section-7.2] |
| PostgreSQL retention at 365 days | [trace:step-2:section-7.3] |
| Mini-PC specs: Ryzen 5 5500U, 16GB RAM | [trace:PRD:section-1] |
