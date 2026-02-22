# Phase 2: Multi-Order Document Management System (MySQL)

## Overview
Upgrade from single-order documents to many-to-many relationships allowing one document (invoice, delivery note, etc.) to be linked to multiple orders.

**✅ MySQL Compatible** - Fully integrated with your existing MySQL database.

## Key Features
- **Tabbed UI**: Separate "Order Details" and "Documents" tabs in order detail panel
- **Multi-Order Documents**: One PDF can be attached to orders #3, #5, #10 simultaneously
- **Smart Upload Dialog**: Checkbox selection for linking documents to multiple orders
- **Document Tracking**: See which orders each document is linked to
- **Efficient Storage**: One file, multiple order references

---

## Quick Deployment

### Automatic (Recommended)
```bash
cd /var/www/partpulse-orders
git pull
chmod +x deploy_mysql_documents.sh
./deploy_mysql_documents.sh
```

### Manual Steps
```bash
cd /var/www/partpulse-orders

# 1. Pull changes
git pull

# 2. Run MySQL migration
mysql -u partpulse_user -p'410010Kuyto-' partpulse_orders < backend/migrations/005_documents_many_to_many_mysql.sql

# 3. Create uploads directory
mkdir -p backend/uploads/documents
chmod 755 backend/uploads/documents

# 4. Restart server
pm2 restart partpulse-orders
```

---

## Database Changes

### New Table: `order_documents_link`
Junction table for many-to-many relationships:

```sql
CREATE TABLE order_documents_link (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    document_id INT NOT NULL,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    linked_by INT NOT NULL,
    UNIQUE KEY unique_order_document (order_id, document_id),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_by) REFERENCES users(id)
);
```

### Modified: `documents` table
- `order_id` made nullable (no longer required)
- New relationships via `order_documents_link` instead
- Existing data automatically migrated to junction table

---

## API Endpoints

### GET `/api/documents/order/:orderId`
Get all documents linked to a specific order.

**Response**:
```json
{
  "success": true,
  "documents": [
    {
      "id": 42,
      "file_name": "Invoice_2026_001.pdf",
      "file_size": 245678,
      "mime_type": "application/pdf",
      "document_type": "invoice",
      "uploaded_by_name": "John Admin",
      "uploaded_at": "2026-02-22T13:00:00Z",
      "linked_order_ids": [15, 17, 19],
      "description": "Combined invoice for February orders"
    }
  ]
}
```

### POST `/api/documents/upload`
Upload document and link to multiple orders.

**Body** (FormData):
- `file`: File to upload
- `orderIds`: Comma-separated order IDs (e.g. "3,5,10") or array
- `documentType`: Type (invoice, delivery_note, etc.)
- `description`: Optional description

**Response**:
```json
{
  "success": true,
  "message": "Document uploaded and linked to 3 order(s)",
  "document": {
    "id": 42,
    "file_name": "invoice.pdf",
    "linked_order_ids": [3, 5, 10]
  }
}
```

### DELETE `/api/documents/:documentId/unlink/:orderId`
Unlink document from specific order (deletes document if no more links).

### DELETE `/api/documents/:documentId`
Delete document entirely (all links + file).

---

## Frontend Features

### Tabbed Interface
Order detail panel now has two tabs:
1. **Order Details** - Original order information
2. **Documents** - All documents for this order

### Upload Dialog
- File selection (PDF, images, Office docs, etc.)
- Document type dropdown
- Description field
- **Checkbox list of all orders** (current order pre-selected)
- Can link to as many orders as needed

### Document Cards
- File icon based on type (📕 PDF, 🖼️ Image, 📘 Word, etc.)
- File name, size, upload date
- Uploader name
- **Order badges** showing linked orders (#3, #5, #10)
- Download button
- Unlink button (admin/procurement only)

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

### Example 3: Linking Existing Document
If you uploaded a document to order #15 but realize it also applies to #17:

1. Open order #17
2. Documents tab → Upload
3. *(Future enhancement: Will add "Link Existing" button)*

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
- ✅ MySQL transaction safety

---

## Technical Details

### Database Schema

**Existing `documents` table** (modified):
- `order_id` now nullable
- All other columns unchanged
- Existing data preserved

**New `order_documents_link` table**:
- Stores order ↔ document relationships
- One row per link
- Cascading deletes (remove order → remove links)
- Unique constraint prevents duplicate links

### Migration Strategy
1. Create `order_documents_link` table
2. Copy existing `order_id` relationships to junction table
3. Make `order_id` nullable in `documents`
4. All existing documents still work!

### File Storage
- Files stored in `backend/uploads/documents/`
- One physical file per document
- Multiple database references via junction table
- Automatic cleanup when last link removed

---

## Troubleshooting

### Documents tab doesn't appear
- Clear browser cache: `Ctrl + Shift + R`
- Check browser console for JavaScript errors
- Verify `documents.js` and `documents.css` are loaded:
  ```bash
  ls -lh /var/www/partpulse-orders/frontend/documents.*
  ```

### Upload fails
- Check file size (max 50MB)
- Verify uploads directory exists and is writable:
  ```bash
  ls -ld /var/www/partpulse-orders/backend/uploads/documents/
  # Should show: drwxr-xr-x
  ```
- Check server logs:
  ```bash
  pm2 logs partpulse-orders --err --lines 30
  ```

### Documents don't show linked orders
- Verify migration ran successfully:
  ```bash
  mysql -u partpulse_user -p'410010Kuyto-' partpulse_orders -e "SHOW TABLES LIKE 'order_documents_link';"
  ```
- Check links exist:
  ```bash
  mysql -u partpulse_user -p'410010Kuyto-' partpulse_orders -e "SELECT * FROM order_documents_link LIMIT 5;"
  ```

### Login fails after deployment
- **This was the issue we fixed!** Make sure you're on the correct branch:
  ```bash
  git log --oneline -1
  # Should show: "Add complete MySQL documentation for Phase 2" or similar
  ```
- Verify MySQL is running:
  ```bash
  systemctl status mysql
  ```

---

## Performance Considerations

### Indexes Added
- `order_documents_link(order_id)` - Fast lookup by order
- `order_documents_link(document_id)` - Fast lookup by document
- `documents(uploaded_at)` - Sorting by date
- `documents(document_type)` - Filtering by type

### Query Optimization
- Uses `GROUP_CONCAT` to fetch all linked orders in one query
- Efficient joins with proper indexes
- Transaction support for multi-order uploads

---

## Future Enhancements (Phase 3)

- [ ] Link existing documents to additional orders (UI button)
- [ ] Document version control
- [ ] PDF preview in browser
- [ ] Drag-and-drop upload
- [ ] Bulk document operations
- [ ] Document approval workflow
- [ ] Email attachments directly from documents
- [ ] OCR for invoice data extraction
- [ ] Document templates

---

## Rollback Plan

If you need to revert:

```bash
cd /var/www/partpulse-orders

# Revert to before Phase 2
git reset --hard e75a56a

# Restart
pm2 restart partpulse-orders

# Optional: Remove junction table
mysql -u partpulse_user -p'410010Kuyto-' partpulse_orders -e "DROP TABLE IF EXISTS order_documents_link;"
```

---

## Version History

- **Phase 1** (v2.2.0): Basic single-order document upload (SQLite initially, MySQL later)
- **Phase 2** (v2.3.0): Many-to-many relationships + tabbed UI (MySQL)

---

## Support

For issues or questions:
1. Check browser console for errors
2. Review `pm2 logs partpulse-orders`
3. Verify database migration completed:
   ```bash
   mysql -u partpulse_user -p'410010Kuyto-' partpulse_orders -e "DESC order_documents_link;"
   ```
4. Test with a simple upload to one order first

---

**Last Updated**: February 22, 2026  
**Database**: MySQL 8.0+  
**Backend**: Node.js + Express + mysql2  
**Frontend**: Vanilla JavaScript  
