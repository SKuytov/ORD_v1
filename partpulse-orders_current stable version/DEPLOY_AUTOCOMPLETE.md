# Quick Deployment: Intelligent Autocomplete

## 🚀 Deploy to Production

### Prerequisites
- Server access via SSH
- PM2 running PartPulse Orders
- Git repository configured

---

## Step-by-Step Deployment

### 1. Pull Latest Code
```bash
cd /var/www/partpulse-orders
git pull origin main
```

**Expected output**:
```
remote: Enumerating objects: ...
remote: Counting objects: 100% ...
Updating 00eb9e5..afdc273
Fast-forward
 backend/routes/autocomplete.js              | 245 ++++++++++++++++++++++++
 backend/server.js                           |   5 +-
 frontend/css/intelligent-autocomplete.css   | 197 +++++++++++++++++++
 frontend/js/intelligent-autocomplete.js     | 321 +++++++++++++++++++++++++++++++
 frontend/index.html                         |   6 +-
 docs/INTELLIGENT_AUTOCOMPLETE.md            | 400 ++++++++++++++++++++++++++++++++++++++
 DEPLOY_AUTOCOMPLETE.md                      |  95 +++++++++
 7 files changed, 1267 insertions(+), 2 deletions(-)
```

### 2. Restart PM2
```bash
pm2 restart partpulse-orders
```

**Expected output**:
```
[PM2] Applying action restartProcessId on app [partpulse-orders]
[PM2] [partpulse-orders](0) ✓
```

### 3. Verify Server Started
```bash
pm2 logs partpulse-orders --lines 20
```

**Look for**:
```
PartPulse Orders Server v2.5.1 running on port 3000
Features: Smart Autocomplete + Document Management + Approvals + Procurement
```

### 4. Test in Browser
1. Open your PartPulse Orders application
2. Login with any user
3. Go to "Create New Order" form
4. Type in "Item Description" field:
   - Type: `Ла` (Bulgarian)
   - Type: `Bear` (English)
5. **You should see suggestions appear!** ✅

---

## ✅ Verification Checklist

- [ ] Git pull completed successfully
- [ ] PM2 restart completed
- [ ] Server logs show v2.5.1
- [ ] No errors in PM2 logs
- [ ] Login page loads
- [ ] Can login successfully
- [ ] "Create New Order" form visible
- [ ] Typing in "Item Description" shows suggestions
- [ ] Typing in "Category" shows suggestions
- [ ] Suggestions display usage count badges
- [ ] Arrow keys navigate suggestions
- [ ] Enter key selects suggestion
- [ ] Both English and Bulgarian text work

---

## 🐛 If Something Goes Wrong

### Issue: Server Won't Start

**Check logs**:
```bash
pm2 logs partpulse-orders --err --lines 50
```

**Common fixes**:
```bash
# Check if port 3000 is already in use
sudo lsof -i :3000

# Kill process on port 3000 if needed
sudo kill -9 <PID>

# Restart PM2
pm2 restart partpulse-orders
```

### Issue: Suggestions Not Appearing

**Check browser console** (F12):
- Look for JavaScript errors
- Look for failed API requests

**Test API directly**:
```bash
# Get your token from browser localStorage
# Then test API:
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/autocomplete/categories?q=Be"
```

**Expected response**:
```json
{
  "suggestions": [
    {
      "text": "Bearings",
      "usage_count": 45,
      "last_used": "2026-02-20T10:30:00Z"
    }
  ]
}
```

### Issue: Performance is Slow

**Add database indexes**:
```bash
# Connect to MySQL
mysql -u your_user -p partpulse_orders
```

```sql
-- Add indexes for faster autocomplete
CREATE INDEX idx_orders_item_description ON orders(item_description(100));
CREATE INDEX idx_orders_category ON orders(category(50));
CREATE INDEX idx_orders_part_number ON orders(part_number(50));

-- Verify indexes created
SHOW INDEX FROM orders;
```

### Issue: Old Version Still Showing

**Clear browser cache**:
- Chrome/Edge: `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (Mac)
- Firefox: `Ctrl + F5` or `Cmd + Shift + R`

**Or clear cache via DevTools**:
1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

---

## 📊 Performance Optimization

### Optional: Add Database Indexes

If you have **1000+ orders** in the database, add these indexes for better performance:

```sql
-- Connect to database
mysql -u your_user -p partpulse_orders

-- Add indexes
CREATE INDEX idx_orders_item_description ON orders(item_description(100));
CREATE INDEX idx_orders_category ON orders(category(50));
CREATE INDEX idx_orders_part_number ON orders(part_number(50));
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Verify
SHOW INDEX FROM orders;
```

**Expected speedup**: 5-10x faster queries on large datasets

---

## 🔄 Rollback (If Needed)

### Quick Rollback to Previous Version

```bash
cd /var/www/partpulse-orders

# Find previous commit
git log --oneline -5

# Rollback to commit before autocomplete (00eb9e5)
git checkout 00eb9e5259a999dd7177b7abaebd15d0a6b8dc9b

# Restart
pm2 restart partpulse-orders
```

**To return to latest**:
```bash
git checkout main
pm2 restart partpulse-orders
```

---

## 📞 Support

If you encounter any issues:

1. **Check logs**: `pm2 logs partpulse-orders --lines 100`
2. **Check browser console**: F12 → Console tab
3. **Review documentation**: [INTELLIGENT_AUTOCOMPLETE.md](docs/INTELLIGENT_AUTOCOMPLETE.md)
4. **Test API manually**: Use curl commands above

---

## 🎉 Success!

If all checks pass, you've successfully deployed the Intelligent Autocomplete feature!

**What your users will experience**:
- ⚡ Faster order creation
- 🧠 Smart suggestions based on history
- 🌍 Multi-language support (EN/BG)
- ✨ Beautiful, responsive UI
- ⏱️ Time savings on repetitive entries

---

**Deployment Date**: _____________  
**Deployed By**: _____________  
**Version**: 2.5.1  
**Status**: ☐ Success ☐ Issues (describe): _____________
