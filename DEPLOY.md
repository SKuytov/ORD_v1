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

### 3. Database Migration (MySQL)

**Option A: Direct MySQL command (Recommended)**
```bash
mysql -u root -p < backend/database/supplier-products-schema-mysql.sql
```

**Option B: Connect and run manually**
```bash
mysql -u root -p
# Then:
USE your_database_name;
source /path/to/ORD_v1/backend/database/supplier-products-schema-mysql.sql;
```

**Option C: Via init-db script**
```bash
cd backend
npm run init-db
# Then paste the contents of supplier-products-schema-mysql.sql
```

### 4. Restart PM2
```bash
pm2 restart partpulse-orders
```

---

## ✅ Quick Verification

```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs partpulse-orders --lines 20

# Verify ExcelJS installed
npm list exceljs

# Verify database table created
mysql -u root -p -e "DESCRIBE supplier_products;"
```

**In Browser:**
1. Login → Suppliers tab
2. Click a supplier
3. Scroll down → See "Product Catalog" section
4. Click "Download Template" → Should work!

---

## 🐛 If Something Breaks

```bash
# Check PM2 logs
pm2 logs partpulse-orders --err

# Restart
pm2 restart partpulse-orders

# Reload (zero downtime)
pm2 reload partpulse-orders

# Full restart
pm2 delete partpulse-orders
pm2 start backend/server.js --name partpulse-orders

# Check database
mysql -u root -p -e "SELECT COUNT(*) FROM supplier_products;"
```

---

## 📝 What's New in v2.6

- ✅ Excel template generation for suppliers
- ✅ Catalog upload and parsing
- ✅ Product database with search
- ✅ AI integration ready
- ✅ Full documentation in `docs/`
- ✅ MySQL full-text search optimization

---

## 🗄️ Database Notes

**Table created:** `supplier_products`
**Indexes:** 9 indexes including full-text search
**View created:** `v_supplier_catalog`
**Sample data:** 3 example products (optional)

---

**Full guides:**
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Installation Guide](docs/CATALOG_INSTALLATION.md)
- [User Guide](docs/SUPPLIER_CATALOG_GUIDE.md)
