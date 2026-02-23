# Supplier Catalog System - User Guide

## 📦 Overview

The Supplier Catalog System allows suppliers to provide their product catalogs to PartPulse, enabling:

- **Automated supplier suggestions** when creating orders
- **Smart AI-powered matching** of orders to suppliers based on product data
- **Price transparency** with automatic price lookup
- **Lead time estimates** for better planning
- **Product search** across all supplier catalogs

---

## 🚀 Quick Start

### For Administrators & Procurement Staff

1. **Navigate to Suppliers Tab** in PartPulse Orders
2. **Click on a supplier** from the suppliers list
3. **Scroll to Product Catalog section** in the supplier detail panel
4. **Download the Excel template** for that supplier
5. **Send the template** to the supplier via email
6. **Upload the completed catalog** when received back

### For Suppliers (External)

1. **Receive the Excel template** from PartPulse
2. **Fill out the Product Catalog sheet** with your products
3. **Follow the instructions** in the Instructions sheet
4. **Save and return** the file to PartPulse

---

## 📋 Excel Template Structure

### Sheet 1: Instructions

Contains detailed instructions and column descriptions. **Do not modify this sheet.**

### Sheet 2: Product Catalog

This is where suppliers enter their product data.

#### Required Fields (*)

| Column | Description | Example |
|--------|-------------|----------|
| **Category*** | Product category | Bearings, Motors, Sensors |
| **Part Number*** | Your SKU/part number | BRG-6205-2RS |
| **Description*** | Detailed product description | Deep groove ball bearing 6205 2RS, sealed both sides |
| **Brand Name*** | Brand/trademark name | SKF, Siemens, Bosch |
| **Unit Price*** | Price per unit (numbers only) | 12.50 |
| **Lead Time (days)*** | Delivery time in days | 5 |
| **Stock Status*** | In Stock / Made to Order / Special Order | In Stock |

#### Optional Fields

| Column | Description | Example |
|--------|-------------|----------|
| **Manufacturer** | Original equipment manufacturer | SKF |
| **Currency** | Price currency | EUR, USD, BGN |
| **Min Order Qty** | Minimum order quantity | 1 |
| **Product Image URL** | Link to product image | https://... |
| **Datasheet URL** | Link to technical datasheet | https://... |
| **Keywords** | Comma-separated search terms | bearing, ball, 6205, SKF |

### Data Validation

The template includes:
- **Dropdown lists** for Category and Stock Status
- **Number validation** for Unit Price and Lead Time
- **Header row** is frozen for easy scrolling

---

## 📊 How It Works

### 1. Download Template

```javascript
// Admin/Procurement clicks "Download Template" button
// System generates Excel file with:
// - Pre-filled supplier information
// - Instructions sheet
// - Empty Product Catalog sheet with example row
// - Data validation dropdowns
```

**Template filename format:**
```
PartPulse_Catalog_[SupplierName]_[Date].xlsx
```

### 2. Fill Out Catalog

Suppliers fill out the Product Catalog sheet:

- Start from row 3 (row 2 is an example)
- Use dropdown menus where provided
- Enter accurate brand names (important for AI)
- Add keywords to improve search matching
- Can add hundreds or thousands of products

### 3. Upload Catalog

Admin/Procurement uploads the completed file:

- Click "Upload Catalog" button
- Select the Excel file
- Choose upload mode:
  - **Update mode** (default): Updates existing products, adds new ones
  - **Replace mode**: Deletes all existing products first

### 4. System Processing

PartPulse automatically:

✅ Validates all required fields  
✅ Checks data types (prices, lead times)  
✅ Imports products to database  
✅ Updates existing products (by part number)  
✅ Indexes for fast searching  
✅ Trains AI suggestion engine  

---

## 📊 Catalog Statistics

The system displays real-time statistics:

- **Total Products** - Number of products in catalog
- **Categories** - Number of unique categories
- **Brands** - Number of unique brands

---

## 🔍 Viewing Products

Click **"View Products"** to see the complete catalog:

- **Search** across all fields
- **Filter** by category
- **View** detailed product information
- **See** pricing, lead times, stock status

---

## ⚡ Benefits

### For PartPulse Administrators

✅ **Automated supplier matching** - AI suggests best suppliers  
✅ **Price transparency** - Know prices before requesting quotes  
✅ **Lead time planning** - Better delivery estimates  
✅ **Product search** - Find products across all suppliers  
✅ **Brand tracking** - Know which suppliers carry which brands  

### For Suppliers

✅ **Visibility** - Your products are visible in PartPulse  
✅ **Automated matching** - Get more relevant order requests  
✅ **Easy updates** - Update catalog anytime  
✅ **Digital catalog** - No more manual price lists  

### For Requesters

✅ **Faster ordering** - System suggests appropriate suppliers  
✅ **Better information** - See available products upfront  
✅ **Price estimates** - Know approximate costs  

---

## 🛠 Technical Details

### Database Schema

```sql
CREATE TABLE supplier_products (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER REFERENCES suppliers(id),
    category VARCHAR(255) NOT NULL,
    part_number VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    brand_name VARCHAR(255) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'EUR',
    lead_time_days INTEGER NOT NULL,
    stock_status VARCHAR(50) NOT NULL,
    keywords TEXT,
    -- Full-text search indexed
    UNIQUE(supplier_id, part_number)
);
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/suppliers/:id/catalog-template` | GET | Download Excel template |
| `/api/suppliers/:id/catalog-upload` | POST | Upload completed catalog |
| `/api/suppliers/:id/products` | GET | Get supplier products |
| `/api/suppliers/:id/catalog-stats` | GET | Get catalog statistics |
| `/api/suppliers/products/search` | GET | Search all products |

### Supported File Formats

- `.xlsx` - Excel 2007+ (recommended)
- `.xls` - Excel 97-2003
- `.csv` - Comma-separated values

### File Size Limits

- **Maximum file size:** 10 MB
- **Maximum rows:** 1,048,576 (Excel limit)
- **Recommended:** Keep under 10,000 rows for best performance

---

## 📝 Example Workflow

### Scenario: Adding SKF Bearings Catalog

**Step 1: Download Template**
```
Admin navigates to Suppliers → SKF Bulgaria → Download Template
File generated: PartPulse_Catalog_SKF_Bulgaria_2026-02-23.xlsx
```

**Step 2: Send to Supplier**
```
Email template to supplier:
"Please fill out the attached product catalog template with your 
available bearings. Focus on:
- Brand names (SKF, FAG, etc.)
- Accurate part numbers
- Current pricing in EUR
- Lead times
- Keywords for search"
```

**Step 3: Supplier Fills Catalog**
```
Supplier adds 500+ bearing products:
- Categories: Ball Bearings, Roller Bearings, Angular Contact
- Part numbers: 6205-2RS, 6206-Z, 7210-BEP, etc.
- Brands: SKF, FAG, NSK
- Prices, lead times, stock status
```

**Step 4: Upload**
```
Admin uploads file:
✅ Validation passed
✅ 450 new products inserted
✅ 50 existing products updated
✅ Total: 500 products
```

**Step 5: AI Training**
```
System automatically:
- Indexes brand names (SKF, FAG, NSK)
- Indexes keywords (bearing, ball, roller, sealed)
- Updates supplier suggestion model
```

**Step 6: Usage**
```
When requester creates order:
"Need bearing 6205 2RS sealed"

→ AI suggests: SKF Bulgaria (95% match)
→ Shows: BRG-6205-2RS, €12.50, 5 days, In Stock
```

---

## ❗ Important Notes

### For Administrators

1. **Brand names are critical** - They train the AI suggestion engine
2. **Keywords improve matching** - Encourage suppliers to add them
3. **Regular updates** - Ask suppliers to update catalogs quarterly
4. **Replace vs Update** - Use "Replace" only when completely restructuring
5. **Validation errors** - System will show row numbers for any issues

### For Suppliers

1. **Don't modify column headers** - System expects exact format
2. **Don't rename sheets** - Keep "Instructions" and "Product Catalog"
3. **Use dropdowns** - Category and Stock Status have predefined values
4. **Be accurate** - Wrong prices/lead times cause issues
5. **Add keywords** - Helps customers find your products
6. **Update regularly** - Keep prices and availability current

---

## 🐛 Troubleshooting

### Upload Fails

**"Invalid template: Product Catalog sheet not found"**
- Sheet was renamed or deleted
- **Solution:** Download fresh template, copy data

**"Row X: Missing required fields"**
- Required field (*) is empty
- **Solution:** Fill all required fields

**"Row X: Invalid unit price"**
- Price is not a number or is negative
- **Solution:** Enter valid positive number

### Search Not Working

**"No products found"**
- Catalog not uploaded yet
- **Solution:** Upload catalog first

**"Products don't match search"**
- Keywords not added
- **Solution:** Re-upload with better keywords

### AI Not Suggesting

**"Supplier not suggested for relevant orders"**
- Brand names missing or incorrect
- **Solution:** Ensure accurate brand names in catalog

---

## 📈 Future Enhancements

- ✅ Excel template generation
- ✅ Catalog upload and parsing
- ✅ Product search
- ✅ AI training integration
- 🔄 **Planned:** API for automated catalog updates
- 🔄 **Planned:** Bulk price adjustments
- 🔄 **Planned:** Product image gallery
- 🔄 **Planned:** Category management
- 🔄 **Planned:** Supplier portal for self-service updates

---

## 📞 Support

For questions or issues:

- **Email:** [your-support-email]
- **Internal:** Contact PartPulse administrator
- **Documentation:** This guide + in-app instructions

---

## 📝 Version History

**v2.6.0** (2026-02-23)
- Initial supplier catalog system release
- Excel template generation
- Catalog upload and parsing
- Product search functionality
- AI integration for supplier suggestions

---

*This feature is part of PartPulse Orders v2.6 - Phase 5: Supplier Catalog System*
