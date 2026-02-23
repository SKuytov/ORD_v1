# Deployment Guide - Supplier Catalog System

## 🚀 Your Current Workflow (PM2)

Since you're using PM2 with `git pull`, here's your streamlined deployment process:

---

## 📋 Standard Deployment Steps

### 1. Pull Latest Code

```bash
cd /path/to/ORD_v1
git pull origin main
```

This gets all the new files:
- `backend/routes/supplier-catalog.js`
- `backend/database/supplier-products-schema.sql`
- `backend/package.json` (updated with ExcelJS)
- `frontend/js/supplier-catalog.js`
- Documentation files

### 2. Install New Dependencies

```bash
cd backend
npm install
```

This will install the new `exceljs` package that was added to `package.json`.

### 3. Run Database Migration

You need to create the `supplier_products` table in your Supabase database.

**Option A: Via Supabase Dashboard (Recommended)**
1. Go to your Supabase project dashboard
2. Click **SQL Editor**
3. Create new query
4. Copy/paste contents of `backend/database/supplier-products-schema.sql`
5. Click **Run**

**Option B: Via psql command**
```bash
psql -h db.xxx.supabase.co -U postgres -d postgres -f backend/database/supplier-products-schema.sql
# You'll be prompted for your Supabase password
```

**Option C: Via your server if you have direct DB access**
```bash
# If you have database connection configured
node -e "
const db = require('./backend/config/database');
const fs = require('fs');
const sql = fs.readFileSync('./backend/database/supplier-products-schema.sql', 'utf8');
db.query(sql, (err) => {
  if (err) console.error(err);
  else console.log('Schema created successfully');
  process.exit();
});
"
```

### 4. Restart PM2

```bash
pm2 restart partpulse-orders
```

That's it! The system should now be live with the supplier catalog feature.

---

## ✅ Verification Steps

After deployment, verify everything works:

### Check PM2 Status
```bash
pm2 status
pm2 logs partpulse-orders --lines 50
```

Look for any errors in the logs.

### Check Dependencies
```bash
cd backend
npm list exceljs
# Should show: exceljs@4.4.0
```

### Check Database Table
```bash
# Via Supabase SQL Editor, run:
SELECT COUNT(*) FROM supplier_products;
# Should return 0 rows (or sample data if you kept it)

# Check table structure:
\d supplier_products
```

### Test Frontend
1. Open your PartPulse Orders app
2. Log in as **Admin** or **Procurement** user
3. Go to **Suppliers** tab
4. Click any supplier
5. Scroll down - you should see **"Product Catalog"** section
6. Click **"Download Template"**
7. Verify Excel file downloads correctly

### Test Upload
1. Open the downloaded template
2. Add a test product (or use the example row)
3. Save the file
4. Click **"Upload Catalog"**
5. Select the file and upload
6. Should see success message

---

## 🔧 Troubleshooting

### Error: "Cannot find module 'exceljs'"

**Cause:** npm install didn't run or failed

**Solution:**
```bash
cd backend
npm install exceljs --save
pm2 restart partpulse-orders
```

### Error: "relation supplier_products does not exist"

**Cause:** Database migration didn't run

**Solution:** Run the schema SQL file (see Step 3 above)

### PM2 Won't Restart

```bash
# Check PM2 status
pm2 status

# View error logs
pm2 logs partpulse-orders --err

# If stuck, try:
pm2 delete partpulse-orders
pm2 start backend/server.js --name partpulse-orders

# Or reload instead of restart
pm2 reload partpulse-orders
```

### UI Shows "Product Catalog" But Buttons Don't Work

**Check browser console (F12):**
- Look for 404 errors (API routes not registered)
- Look for CORS errors
- Verify frontend file loaded: `frontend/js/supplier-catalog.js`

**Hard refresh browser:**
```
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)
```

**Verify API routes are registered:**
```bash
# Check if routes are loaded
pm2 logs partpulse-orders | grep "catalog"
# Should see route registration logs
```

---

## 📦 Complete Deployment Checklist

- [ ] `git pull origin main` completed
- [ ] `npm install` in backend directory completed
- [ ] ExcelJS package installed (check with `npm list exceljs`)
- [ ] Database schema applied via Supabase SQL Editor
- [ ] `supplier_products` table created (verify with SELECT query)
- [ ] PM2 restarted successfully
- [ ] No errors in PM2 logs
- [ ] Frontend shows Product Catalog section
- [ ] Template downloads successfully
- [ ] Upload works (tested with sample data)

---

## 🎯 Quick Reference Commands

```bash
# Standard deployment
cd /path/to/ORD_v1
git pull origin main
cd backend
npm install
pm2 restart partpulse-orders

# Check status
pm2 status
pm2 logs partpulse-orders

# If issues
pm2 restart partpulse-orders --update-env
pm2 reload partpulse-orders

# View logs in real-time
pm2 logs partpulse-orders --lines 100
```

---

## 🔄 Future Updates

When I create more features, your deployment process remains the same:

1. `git pull origin main`
2. `cd backend && npm install` (if package.json changed)
3. Run any new database migrations (I'll tell you)
4. `pm2 restart partpulse-orders`

---

## 📊 What Gets Deployed

### Backend
- ✅ New API routes: `/api/suppliers/:id/catalog-template`, `/catalog-upload`, etc.
- ✅ Excel generation logic
- ✅ File upload handling
- ✅ Product search endpoints
- ✅ Database queries

### Frontend
- ✅ New UI section in supplier detail panel
- ✅ Download/Upload buttons
- ✅ Statistics display
- ✅ Product viewer modal
- ✅ Form validation

### Database
- ✅ New table: `supplier_products`
- ✅ Indexes for performance
- ✅ Full-text search configuration

---

## 🛡️ Rollback Plan (If Something Breaks)

If the deployment causes issues:

### Quick Rollback
```bash
cd /path/to/ORD_v1
git log --oneline -5  # Find previous commit
git revert HEAD  # Or specific commit hash
pm2 restart partpulse-orders
```

### Database Rollback
```sql
-- Via Supabase SQL Editor
DROP TABLE IF EXISTS supplier_products;
```

### Clean Reinstall
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
pm2 restart partpulse-orders
```

---

## 💾 Backup Recommendations

Before deploying, consider backing up:

### Database
```bash
# Via Supabase Dashboard:
# Project Settings → Database → Create Backup

# Or via pg_dump:
pg_dump -h db.xxx.supabase.co -U postgres -d postgres -t suppliers > suppliers_backup.sql
```

### Code
```bash
# Your git history is your backup!
git log
git checkout <commit-hash>  # If needed
```

---

## 🔐 Environment Variables

No new environment variables needed! The catalog system uses your existing:

```env
# .env (already configured)
DATABASE_URL=your_supabase_url
JWT_SECRET=your_jwt_secret
PORT=3000
```

---

## 📈 Monitoring

### PM2 Monitoring
```bash
pm2 monit  # Real-time monitoring
pm2 status  # Process status
pm2 logs partpulse-orders --lines 100  # Recent logs
```

### Application Logs
Watch for these in PM2 logs after restart:
```
✓ Connected to database
✓ Server running on port 3000
✓ Routes registered: /api/suppliers
```

### Database Performance
```sql
-- Check table size
SELECT 
    pg_size_pretty(pg_total_relation_size('supplier_products')) as total_size,
    COUNT(*) as row_count
FROM supplier_products;

-- Check recent uploads
SELECT 
    supplier_id,
    COUNT(*) as products,
    MAX(updated_at) as last_update
FROM supplier_products
GROUP BY supplier_id;
```

---

## 🎉 Post-Deployment

Once deployed successfully:

1. **Notify your team** that the catalog feature is live
2. **Download templates** for your top 5 suppliers
3. **Email templates** to suppliers (I can help draft emails)
4. **Wait for catalogs** to come back
5. **Upload and test** the system
6. **Monitor performance** for the first week

---

## 📞 Need Help?

If you encounter any deployment issues:

1. Check PM2 logs: `pm2 logs partpulse-orders`
2. Check browser console (F12)
3. Verify database connection
4. Check file permissions
5. Come back here with error messages!

---

## 📝 Deployment Notes for This Release

**Version:** v2.6.0 - Supplier Catalog System  
**Date:** 2026-02-23  
**Breaking Changes:** None  
**Database Changes:** New table `supplier_products` (safe to add)  
**Dependencies Added:** `exceljs@^4.4.0`  
**Downtime Required:** ~30 seconds (PM2 restart)  

---

*Happy deploying! 🚀*
