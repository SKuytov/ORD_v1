# 🚀 Quick Deploy - PartPulse v2.6

## Your PM2 Deployment Steps

### 1. Pull Code
```bash
cd /path/to/ORD_v1
git pull origin main
```

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Database Migration

**Go to Supabase Dashboard → SQL Editor → Run this:**

```sql
-- Copy/paste contents of: backend/database/supplier-products-schema.sql
```

Or via command line:
```bash
psql -h db.xxx.supabase.co -U postgres -d postgres -f backend/database/supplier-products-schema.sql
```

### 4. Restart PM2
```bash
pm2 restart partpulse-orders
```

---

## ✅ Quick Verification

```bash
# Check status
pm2 status

# Check logs
pm2 logs partpulse-orders --lines 20

# Verify ExcelJS installed
npm list exceljs
```

**In Browser:**
1. Login → Suppliers tab
2. Click a supplier
3. Scroll down → See "Product Catalog" section
4. Click "Download Template" → Should work!

---

## 🐛 If Something Breaks

```bash
# Check logs
pm2 logs partpulse-orders --err

# Restart
pm2 restart partpulse-orders

# Reload (zero downtime)
pm2 reload partpulse-orders

# Full restart
pm2 delete partpulse-orders
pm2 start backend/server.js --name partpulse-orders
```

---

## 📝 What's New in v2.6

- ✅ Excel template generation for suppliers
- ✅ Catalog upload and parsing
- ✅ Product database with search
- ✅ AI integration ready
- ✅ Full documentation in `docs/`

---

**Full guides:**
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Installation Guide](docs/CATALOG_INSTALLATION.md)
- [User Guide](docs/SUPPLIER_CATALOG_GUIDE.md)
