#!/bin/bash
# ============================================================
# PartPulse Orders — Production Backup Script
# Run this on the production server BEFORE deploying v5
# Server: 100.89.57.33
# ============================================================

set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_ROOT="/var/backups/partpulse"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
APP_DIR="/var/www/partpulse-orders"

DB_NAME="partpulse_orders"
DB_USER="partpulse_user"
DB_PASS="410010Kuyto-"

echo "========================================"
echo "  PartPulse Production Backup"
echo "  Timestamp: $TIMESTAMP"
echo "========================================"

# 1. Create backup directory
echo "[1/4] Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# 2. Backup app files (excluding node_modules and logs)
echo "[2/4] Backing up app files (excluding node_modules & logs)..."
tar -czf "$BACKUP_DIR/app_files.tar.gz" \
  --exclude="$APP_DIR/node_modules" \
  --exclude="$APP_DIR/logs" \
  --exclude="$APP_DIR/*.log" \
  -C /var/www \
  partpulse-orders

echo "      ✔ App files → $BACKUP_DIR/app_files.tar.gz"

# 3. Backup MySQL database
echo "[3/4] Dumping MySQL database '$DB_NAME'..."
mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  -u "$DB_USER" \
  -p"$DB_PASS" \
  "$DB_NAME" | gzip > "$BACKUP_DIR/database.sql.gz"

echo "      ✔ Database → $BACKUP_DIR/database.sql.gz"

# 4. Backup uploads folder separately (if it exists)
UPLOADS_DIR="$APP_DIR/uploads"
if [ -d "$UPLOADS_DIR" ]; then
  echo "[4/4] Backing up uploads folder..."
  tar -czf "$BACKUP_DIR/uploads.tar.gz" -C "$APP_DIR" uploads
  echo "      ✔ Uploads → $BACKUP_DIR/uploads.tar.gz"
else
  echo "[4/4] No uploads folder found — skipping."
fi

# 5. Summary
echo ""
echo "========================================"
echo "  BACKUP COMPLETE"
echo "  Location: $BACKUP_DIR"
echo ""
ls -lh "$BACKUP_DIR"
echo ""
echo "  Total size:"
du -sh "$BACKUP_DIR"
echo "========================================"
echo ""
echo "  You can now safely deploy v5."
echo "  To restore if needed:"
echo "    tar -xzf $BACKUP_DIR/app_files.tar.gz -C /var/www/"
echo "    zcat $BACKUP_DIR/database.sql.gz | mysql -u $DB_USER -p'$DB_PASS' $DB_NAME"
echo "========================================"
