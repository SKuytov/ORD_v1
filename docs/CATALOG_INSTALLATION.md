# Supplier Catalog System - Installation Guide

## 💻 Prerequisites

- Node.js 16+ installed
- PostgreSQL database (you're using Supabase)
- Existing PartPulse Orders v2.5+ installation

---

## 🚀 Quick Installation

### Step 1: Install Dependencies

```bash
cd backend
npm install exceljs
```

This will install the ExcelJS library needed for Excel file generation and parsing.

### Step 2: Update Database Schema

Run the SQL schema file to create the `supplier_products` table:

```bash
# Connect to your Supabase database via SQL Editor
# Or use psql command:
psql -h [your-supabase-host] -U postgres -d postgres < backend/database/supplier-products-schema.sql
```

**SQL creates:**
- `supplier_products` table
- Indexes for fast searching
- Full-text search index
- Auto-update timestamp trigger
- Sample data (optional)

### Step 3: Restart Server

```bash
cd backend
npm start
# Or for development:
npm run dev
```

### Step 4: Verify Installation

1. Log in to PartPulse as **Admin** or **Procurement**
2. Navigate to **Suppliers** tab
3. Click on any supplier
4. Scroll down - you should see **"Product Catalog"** section
5. Try clicking **"Download Template"**

---

## ✅ Verification Checklist

- [ ] ExcelJS package installed (check `node_modules/exceljs`)
- [ ] `supplier_products` table created in database
- [ ] Server starts without errors
- [ ] Product Catalog section visible in supplier detail panel
- [ ] Template downloads successfully
- [ ] Upload works (test with sample data)

---

## 📝 Configuration

### Environment Variables

No additional environment variables needed. System uses existing:

```env
DATABASE_URL=your_supabase_url
JWT_SECRET=your_jwt_secret
```

### File Upload Limits

Default: 10MB max file size

To change, edit `backend/routes/supplier-catalog.js`:

```javascript
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // Change to 20MB
    // ...
});
```

---

## 🛠 Testing

### Test Template Generation

```bash
curl -X GET http://localhost:3000/api/suppliers/1/catalog-template \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output test_template.xlsx
```

### Test Upload

```bash
curl -X POST http://localhost:3000/api/suppliers/1/catalog-upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "catalog=@test_template.xlsx" \
  -F "replaceExisting=false"
```

### Test Search

```bash
curl -X GET "http://localhost:3000/api/suppliers/products/search?q=bearing" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module 'exceljs'"

**Solution:**
```bash
cd backend
npm install exceljs
```

### Error: "Table supplier_products does not exist"

**Solution:**
```bash
# Run the schema SQL file
psql -h your_host -U postgres < backend/database/supplier-products-schema.sql
```

### Error: "Cannot read property 'getWorksheet' of undefined"

**Solution:** Invalid Excel file uploaded. Ensure:
- File has "Product Catalog" sheet
- File is valid .xlsx format
- Download fresh template and try again

### UI Not Showing Catalog Section

**Solution:**
1. Check browser console for JavaScript errors
2. Verify `supplier-catalog.js` is loaded
3. Hard refresh browser (Ctrl+Shift+R)
4. Check user role (must be Admin or Procurement)

---

## 📊 Performance Optimization

### For Large Catalogs (10,000+ products)

**Database indexes** (already created by schema):
```sql
CREATE INDEX idx_supplier_products_supplier ON supplier_products(supplier_id);
CREATE INDEX idx_supplier_products_category ON supplier_products(category);
CREATE INDEX idx_supplier_products_search ON supplier_products USING gin(...);
```

**Batch inserts** (already implemented):
- Uses transactions
- Bulk operations
- Prepared statements

**Search optimization:**
- Full-text search with PostgreSQL GIN index
- Limit results to 100 by default
- Category filtering before text search

---

## 🔐 Security Notes

### Access Control

Endpoints are protected by role-based authentication:

```javascript
router.get('/:id/catalog-template', 
    authenticateToken, 
    requireRole(['admin', 'procurement']),
    // ...
);
```

**Only Admin and Procurement** can:
- Download templates
- Upload catalogs
- View supplier products
- Search products

**Requesters and Managers** cannot access catalog management.

### File Validation

**File type checking:**
```javascript
allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
];
```

**Data validation:**
- Required fields checked
- Data types validated
- SQL injection prevented (prepared statements)
- XSS prevention (no HTML in data)

---

## 🔄 Migration from Existing System

If you have existing supplier product data:

### Option 1: Manual Entry
1. Download templates for each supplier
2. Fill manually
3. Upload

### Option 2: Database Migration

```sql
-- Example: Migrate from old products table
INSERT INTO supplier_products (
    supplier_id, category, part_number, description,
    brand_name, unit_price, lead_time_days, stock_status
)
SELECT 
    supplier_id,
    COALESCE(category, 'Other'),
    part_number,
    description,
    COALESCE(brand, 'Generic'),
    price,
    COALESCE(lead_time, 7),
    COALESCE(availability, 'In Stock')
FROM old_products_table;
```

### Option 3: CSV Import

```javascript
// Create CSV file and upload as catalog
const csv = `Category,Part Number,Description,Brand Name,Unit Price,Currency,Lead Time (days),Min Order Qty,Stock Status
Bearings,BRG-001,Ball Bearing,SKF,10.50,EUR,5,1,In Stock
Bearings,BRG-002,Roller Bearing,FAG,15.00,EUR,7,1,Made to Order`;

// Save as .csv and upload via UI
```

---

## 📚 API Documentation

See full API documentation in [SUPPLIER_CATALOG_GUIDE.md](./SUPPLIER_CATALOG_GUIDE.md)

---

## ⚙️ Integration with AI Suggestions

The supplier catalog automatically integrates with the AI suggestion system:

**Training happens automatically when:**
1. Catalog is uploaded
2. Products are indexed
3. Brand names are extracted
4. Keywords are processed

**No manual training needed!**

When creating an order, the AI will:
1. Analyze order description
2. Search brand names in catalogs
3. Match keywords
4. Suggest suppliers with matching products

---

## 📈 Next Steps

1. ✅ Install system (you're here)
2. 📦 Download templates for your top suppliers
3. 📧 Email templates to suppliers
4. ⏳ Wait for completed catalogs
5. ⬆️ Upload catalogs
6. 🤖 Test AI suggestions
7. 🎉 Enjoy automated supplier matching!

---

## 📞 Support

If you encounter issues during installation:

1. Check server logs: `tail -f backend/logs/error.log`
2. Check database connection
3. Verify user permissions
4. Review this troubleshooting guide

---

*Installation guide for PartPulse Orders v2.6 - Supplier Catalog System*
