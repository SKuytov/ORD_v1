#!/bin/bash
# Deploy Phase 2: Multi-Order Document Management (MySQL)
# Run this script on the server to deploy the upgrade

set -e  # Exit on error

echo "====================================="
echo "Phase 2: Document Management Upgrade"
echo "MySQL Edition"
echo "====================================="
echo ""

# Configuration
DB_USER="partpulse_user"
DB_PASS="410010Kuyto-"
DB_NAME="partpulse_orders"

# Step 1: Pull latest changes
echo "[1/4] Pulling latest changes from GitHub..."
git pull
echo "✅ Git pull complete"
echo ""

# Step 2: Run database migration
echo "[2/4] Running MySQL migration..."
if [ -f "backend/migrations/005_documents_many_to_many_mysql.sql" ]; then
    mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < backend/migrations/005_documents_many_to_many_mysql.sql
    echo "✅ Migration complete"
else
    echo "❌ Migration file not found!"
    exit 1
fi
echo ""

# Step 3: Ensure uploads directory exists
echo "[3/4] Checking uploads directory..."
mkdir -p backend/uploads/documents
chmod 755 backend/uploads/documents
echo "✅ Uploads directory ready"
echo ""

# Step 4: Restart PM2
echo "[4/4] Restarting PM2..."
pm2 restart partpulse-orders
echo "✅ Server restarted"
echo ""

echo "====================================="
echo "✅ Phase 2 Deployment Complete!"
echo "====================================="
echo ""
echo "What's New:"
echo "  • Tabbed UI: 'Order Details' and 'Documents' tabs"
echo "  • Multi-Order Upload: Link one document to multiple orders"
echo "  • Smart Document Tracking: See which orders share documents"
echo ""
echo "Verification:"
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT 'Documents table:' as ''; SELECT COUNT(*) as count FROM documents; SELECT 'Links table:' as ''; SELECT COUNT(*) as count FROM order_documents_link;"
echo ""
echo "Next Steps:"
echo "  1. Login as admin/procurement user"
echo "  2. Click 'View' on any order"
echo "  3. Click 'Documents' tab (new!)"
echo "  4. Click 'Upload Document'"
echo "  5. Select multiple orders from checkbox list"
echo "  6. Upload and verify!"
echo ""
echo "For help: See DOCUMENT_MANAGEMENT_UPGRADE_MYSQL.md"
echo ""
