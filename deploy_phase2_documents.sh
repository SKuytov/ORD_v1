#!/bin/bash
# Deploy Phase 2: Multi-Order Document Management System
# Run this script on the server to deploy the upgrade

set -e  # Exit on error

echo "====================================="
echo "Phase 2: Document Management Upgrade"
echo "====================================="
echo ""

# Step 1: Pull latest changes
echo "[1/4] Pulling latest changes from GitHub..."
git pull
echo "✅ Git pull complete"
echo ""

# Step 2: Run database migration
echo "[2/4] Running database migration..."
cd backend
if [ -f "migrations/004_documents_many_to_many.sql" ]; then
    sqlite3 ../database/orders.db < migrations/004_documents_many_to_many.sql
    echo "✅ Migration complete"
else
    echo "❌ Migration file not found!"
    exit 1
fi
cd ..
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
echo "Next Steps:"
echo "  1. Login as admin/procurement user"
echo "  2. Click 'View' on any order"
echo "  3. Click 'Documents' tab (new!)"
echo "  4. Click 'Upload Document'"
echo "  5. Select multiple orders from checkbox list"
echo "  6. Upload and verify!"
echo ""
echo "Documentation: DOCUMENT_MANAGEMENT_UPGRADE.md"
echo ""
