#!/bin/bash
set -e

echo "=========================================="
echo "  PartPulse Orders - Deploy Script v2.8"
echo "=========================================="

APP_DIR="/var/www/partpulse-orders"
BACKEND_DIR="$APP_DIR/backend"
DB_NAME="partpulse_orders"
DB_USER="partpulse_user"

cd "$APP_DIR"

echo ""
echo "1. Pulling latest from GitHub..."
git pull origin main

echo ""
echo "2. Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install --production

echo ""
echo "3. Running database migrations..."
echo "   (You will be prompted for MySQL password)"
mysql -u "$DB_USER" -p "$DB_NAME" < "$BACKEND_DIR/migrations/009_supplier_notes_alt_product.sql" && echo "   ✓ Migration 009 done" || echo "   ⚠ Migration 009 may have already run"

echo ""
echo "4. Restarting backend with PM2..."
pm2 restart backend 2>/dev/null || pm2 start "$BACKEND_DIR/server.js" --name backend --instances 2 --exec-mode cluster

echo ""
echo "5. Checking service status..."
pm2 list

echo ""
echo "6. Health check..."
sleep 2
curl -sf http://localhost:3000/api/health && echo "" && echo "   ✓ API is responding" || echo "   ⚠ API not responding yet - check pm2 logs"

echo ""
echo "=========================================="
echo "  Deployment complete!"
echo "  App running at: http://100.89.57.33"
echo "=========================================="
