#!/bin/bash
# =============================================================================
# Production Deployment Script — Stock Monitoring Dashboard
# =============================================================================
#
# Usage:
#   ./scripts/deploy.sh
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - .env file configured with production values
#   - docker-compose.prod.yml present at project root
#
# This script:
#   1. Builds and starts all services in production mode
#   2. Runs database migrations
#   3. Verifies health check
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "========================================="
echo " Stock Monitoring Dashboard — Deploy"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="
echo ""

# Step 1: Build and start services
echo "[1/4] Building and starting production services..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Step 2: Wait for database to be ready
echo "[2/4] Waiting for database to be ready..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres -q 2>/dev/null; then
    echo "  Database is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  ERROR: Database did not become ready within 30 seconds."
    exit 1
  fi
  sleep 1
done

# Step 3: Run database migrations
echo "[3/4] Running database migrations..."
docker compose exec -T api npx prisma migrate deploy

# Step 4: Verify health
echo "[4/4] Verifying deployment health..."
sleep 3

HEALTH_URL="http://localhost:3001/api/health"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo ""
  echo "========================================="
  echo " Deployment complete!"
  echo " Health check: $HEALTH_URL -> 200 OK"
  echo "========================================="
else
  echo ""
  echo "========================================="
  echo " WARNING: Health check returned $HTTP_STATUS"
  echo " Check logs: docker compose logs api"
  echo "========================================="
  exit 1
fi
