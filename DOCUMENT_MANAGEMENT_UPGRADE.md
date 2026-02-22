# Phase 2: Multi-Order Document Management System

## Overview
Upgrade from single-order documents to many-to-many relationships allowing one document (invoice, delivery note, etc.) to be linked to multiple orders.

## Key Features
- **Tabbed UI**: Separate "Order Details" and "Documents" tabs in order detail panel
- **Multi-Order Documents**: One PDF can be attached to orders #3, #5, #10 simultaneously
- **Smart Upload Dialog**: Checkbox selection for linking documents to multiple orders
- **Document Tracking**: See which orders each document is linked to
- **Efficient Storage**: One file, multiple order references

---

## Implementation Steps

### 1. Database Migration
**File**: `backend/migrations/004_documents_many_to_many.sql`

**Run Migration**:
```bash
cd /var/www/partpulse-orders/backend
sqlite3 ../database/orders.db < migrations/004_documents_many_to_many.sql
```

**Changes**:
- Drops old `order_documents` table
- Creates new `documents` table (no direct order_id)
- Creates `order_documents_link` junction table for many-to-many relationships
- Adds indexes for performance

---

### 2. Backend API Updates
**File**: `backend/routes/documents.js`

**New Endpoints**:
- `GET /api/documents/order/:orderId` - Get documents for specific order
- `GET /api/documents` - Get all documents (for selection)
- `POST /api/documents/upload` - Upload document and link to multiple orders
- `POST /api/documents/:documentId/link` - Link existing document to more orders
- `DELETE /api/documents/:documentId/unlink/:orderId` - Unlink from one order
- `DELETE /api/documents/:documentId` - Delete document entirely

**Key Features**:
- Accepts `orderIds` as array or comma-separated string
- Automatic cleanup when document has no more links
- Transaction support for linking to multiple orders

---

### 3. Frontend UI Redesign
**File**: `frontend/documents.js`

**Tabbed Interface**:
- Automatically adds "Order Details" and "Documents" tabs
- Smooth tab switching
- Documents section hidden by default until "Documents" tab clicked

**Upload Dialog**:
- Modal overlay with file input
- Document type selector (Invoice, Delivery Note, Quote, etc.)
- Description field
- **Checkbox list** of all orders (current order pre-selected)
- Can select multiple orders to link the document

**Document Cards**:
- File icon based on type
- File name, size, upload date
- Shows linked orders with badges (#3, #5, #10)
- Download button
- Unlink button (admin/procurement only)

---

### 4. CSS Styling
**File**: `frontend/documents.css`

**New Styles**:
- `.detail-tabs` - Tab navigation bar
- `.detail-tab` - Individual tab buttons with active state
- `.upload-dialog-overlay` - Full-screen modal backdrop
- `.upload-dialog` - Upload form modal
- `.order-selection-list` - Scrollable checkbox list
- `.checkbox-label` - Order selection checkboxes
- `.document-card` - Modern card layout with hover effects
- `.order-badge` - Inline order ID badges

---

## Deployment Steps

### Step 1: Pull Changes
```bash
cd /var/www/partpulse-orders
git pull
```

### Step 2: Run Database Migration
```bash
cd backend
sqlite3 ../database/orders.db < migrations/004_documents_many_to_many.sql
```

### Step 3: Restart Server
```bash
pm2 restart partpulse-orders
```

### Step 4: Test
1. Login as admin/procurement
2. Click "View" on any order
3. Click **"Documents" tab** (new!)
4. Click **"Upload Document"**
5. Select file, choose document type
6. **Select multiple orders** from checkbox list
7. Click "Upload"
8. Verify document appears on all selected orders

---

## Usage Examples

### Example 1: Invoice for Multiple Orders
**Scenario**: One invoice covers orders #15, #17, #19

1. Open order #15
2. Go to "Documents" tab
3. Click "Upload Document"
4. Select invoice PDF
5. Set type to "Invoice"
6. Check orders #15, #17, #19
7. Upload

**Result**: Same invoice appears on all three orders

### Example 2: Delivery Note
**Scenario**: Shipment includes orders #20, #21, #22, #23

1. Open any of the orders
2. Documents tab → Upload
3. Select delivery note PDF
4. Set type to "Delivery Note"
5. Check all 4 orders
6. Upload

**Result**: One delivery note linked to 4 orders

---

## Benefits

### Before (Phase 1):
- ❌ Same PDF uploaded 3 times for orders #3, #5, #10
- ❌ 3x storage space wasted
- ❌ No way to see document connections
- ❌ Difficult to manage shared documents

### After (Phase 2):
- ✅ Upload once, link to multiple orders
- ✅ Efficient storage (1 file vs 3 files)
- ✅ See which orders share each document
- ✅ Easy to manage multi-order invoices/deliveries
- ✅ Clean tabbed interface

---

## Technical Details

### Database Schema

**documents table**:
```sql
CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT,
    uploaded_by TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    document_type TEXT DEFAULT 'general'
);
```

**order_documents_link table**:
```sql
CREATE TABLE order_documents_link (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    document_id INTEGER NOT NULL,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    linked_by TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    UNIQUE(order_id, document_id)
);
```

### API Response Example

**GET /api/documents/order/15**:
```json
{
  "success": true,
  "documents": [
    {
      "id": 42,
      "file_name": "Invoice_2026_001.pdf",
      "file_path": "backend/uploads/documents/...",
      "file_size": 245678,
      "file_type": "application/pdf",
      "uploaded_by": "admin",
      "uploaded_at": "2026-02-22T13:00:00Z",
      "description": "Combined invoice for February orders",
      "document_type": "invoice",
      "linked_order_ids": [15, 17, 19]
    }
  ]
}
```

---

## Troubleshooting

### Documents tab doesn't appear
- Clear browser cache
- Check browser console for JavaScript errors
- Verify `documents.js` and `documents.css` are loaded

### Upload fails
- Check file size (max 50MB)
- Verify `backend/uploads/documents/` directory exists and is writable
- Check server logs: `pm2 logs partpulse-orders`

### Documents don't show linked orders
- Run migration again to ensure junction table exists
- Check database: `sqlite3 database/orders.db "SELECT * FROM order_documents_link;"`

---

## Future Enhancements (Phase 3)

- [ ] Document version control
- [ ] Document preview (PDF viewer)
- [ ] Drag-and-drop upload
- [ ] Bulk document operations
- [ ] Document approval workflow
- [ ] Email attachments directly from documents
- [ ] OCR for invoice data extraction
- [ ] Document templates

---

## Version History

- **Phase 1** (v2.2.0): Basic single-order document upload
- **Phase 2** (v2.3.0): Many-to-many relationships + tabbed UI

---

## Support

For issues or questions:
1. Check browser console for errors
2. Review `pm2 logs partpulse-orders`
3. Verify database migration completed successfully
4. Test with a simple upload to one order first

---

**Last Updated**: February 22, 2026
**Author**: System Integration Team
