#!/bin/bash
# =============================================================================
# Database Backup Script — Stock Monitoring Dashboard
# =============================================================================
#
# Usage:
#   ./scripts/backup.sh [backup_dir]
#
# Default backup directory: /backups/YYYYMMDD_HHMMSS
#
# This script:
#   1. Creates a timestamped backup directory
#   2. Dumps the PostgreSQL database (including TimescaleDB data)
#   3. Compresses the dump file
#   4. Reports backup size and location
#   5. Cleans up backups older than 30 days
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEFAULT_BACKUP_BASE="/backups"
BACKUP_BASE="${1:-$DEFAULT_BACKUP_BASE}"
BACKUP_DIR="$BACKUP_BASE/$TIMESTAMP"
RETENTION_DAYS=30

DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-stock_dashboard}"

echo "========================================="
echo " Database Backup — Stock Dashboard"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="
echo ""

# Step 1: Create backup directory
echo "[1/4] Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Step 2: Dump database
echo "[2/4] Dumping database '$DB_NAME'..."
docker compose exec -T postgres pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --verbose \
  2>"$BACKUP_DIR/backup.log" \
  > "$BACKUP_DIR/db.sql"

DUMP_SIZE=$(du -h "$BACKUP_DIR/db.sql" | cut -f1)
echo "  Raw dump size: $DUMP_SIZE"

# Step 3: Compress
echo "[3/4] Compressing backup..."
gzip "$BACKUP_DIR/db.sql"

COMPRESSED_SIZE=$(du -h "$BACKUP_DIR/db.sql.gz" | cut -f1)
echo "  Compressed size: $COMPRESSED_SIZE"

# Step 4: Cleanup old backups
echo "[4/4] Cleaning up backups older than $RETENTION_DAYS days..."
if [ -d "$BACKUP_BASE" ]; then
  DELETED=$(find "$BACKUP_BASE" -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -print -exec rm -rf {} \; 2>/dev/null | wc -l)
  echo "  Removed $DELETED old backup(s)."
fi

echo ""
echo "========================================="
echo " Backup complete!"
echo " Location: $BACKUP_DIR/db.sql.gz"
echo " Size: $COMPRESSED_SIZE"
echo "========================================="
