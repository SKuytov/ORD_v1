# Debug Autocomplete Issues

## Quick Fix - Deploy Latest Code

```bash
cd /var/www/partpulse-orders
git pull origin main
pm2 restart partpulse-orders
```

Then **clear browser cache** (Ctrl+Shift+R) and try again.

---

## What Was Fixed

### Issue: "Autocomplete error: Failed to fetch suggestions"

**Root Cause**: Autocomplete was initializing **before user login**, trying to fetch data without authentication token.

**Fix Applied**:
1. ✅ Added token check before making API requests
2. ✅ Delayed initialization until after successful login
3. ✅ Improved error messages to show HTTP status codes
4. ✅ Added console logging for debugging

---

## Testing After Deployment

### Step 1: Open Browser Console
1. Press **F12** to open DevTools
2. Go to **Console** tab
3. Clear console (trash icon)

### Step 2: Login
You should see:
```
📚 Intelligent Autocomplete module loaded
🔒 Autocomplete: Waiting for user login...
```

### Step 3: After Login Success
You should see:
```
🔍 Initializing intelligent autocomplete...
✅ Item Description autocomplete initialized
✅ Category autocomplete initialized
✅ Part Number autocomplete initialized
```

### Step 4: Test Autocomplete
1. Go to "Create New Order" form
2. Type in **Item Description** field: `Ла`
3. Watch console for:
   - API request URL
   - Response data
   - Any errors

---

## Manual Testing Commands

### Test 1: Check API Endpoint Exists
```bash
# SSH into server
grep -r "autocomplete" backend/routes/
grep -r "autocomplete" backend/server.js
```

**Expected output**:
```
backend/routes/autocomplete.js:router.get('/item-descriptions'...
backend/routes/autocomplete.js:router.get('/categories'...
backend/server.js:const autocompleteRoutes = require('./routes/autocomplete');
backend/server.js:app.use('/api/autocomplete', autocompleteRoutes);
```

### Test 2: Check Server Logs
```bash
pm2 logs partpulse-orders --lines 50 | grep -i autocomplete
```

### Test 3: Test API Manually

**From browser console** (after login):
```javascript
// Get your token
const token = localStorage.getItem('token');
console.log('Token:', token);

// Test categories endpoint
fetch('/api/autocomplete/categories?q=Be', {
    headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(data => console.log('Categories:', data))
.catch(err => console.error('Error:', err));
```

**Expected response**:
```json
{
  "suggestions": [
    {
      "text": "Bearings",
      "usage_count": 45,
      "last_used": "2026-02-20T10:30:00.000Z"
    }
  ]
}
```

### Test 4: Test from Command Line

**Get a token first** (from browser localStorage), then:

```bash
# Test categories
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  "http://localhost:3000/api/autocomplete/categories?q=Be"

# Test item descriptions
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  "http://localhost:3000/api/autocomplete/smart-suggestions?q=Bearing"
```

---

## Common Issues

### Issue 1: "Autocomplete: No auth token found"

**Cause**: Not logged in or token expired

**Fix**: 
1. Make sure you're logged in
2. Check `localStorage.getItem('token')` in console
3. If null, logout and login again

### Issue 2: "HTTP 404: Not Found"

**Cause**: Autocomplete routes not registered in server.js

**Fix**:
```bash
cd /var/www/partpulse-orders
cat backend/server.js | grep autocomplete
```

Should show:
```javascript
const autocompleteRoutes = require('./routes/autocomplete');
app.use('/api/autocomplete', autocompleteRoutes);
```

If missing:
```bash
git pull origin main
pm2 restart partpulse-orders
```

### Issue 3: "HTTP 500: Internal Server Error"

**Cause**: Database connection or query error

**Check PM2 logs**:
```bash
pm2 logs partpulse-orders --err --lines 50
```

**Common fixes**:

**Database not connected**:
```bash
# Check MySQL is running
sudo systemctl status mysql

# Test database connection
mysql -u your_user -p -e "SELECT COUNT(*) FROM partpulse_orders.orders;"
```

**Wrong database credentials**:
```bash
cd /var/www/partpulse-orders/backend
cat .env | grep DB_
```

Should show valid credentials.

### Issue 4: Suggestions Empty Even With Data

**Check database has orders**:
```sql
-- Connect to MySQL
mysql -u your_user -p partpulse_orders

-- Check orders exist
SELECT COUNT(*) FROM orders;
SELECT DISTINCT category FROM orders WHERE category IS NOT NULL LIMIT 10;
SELECT DISTINCT item_description FROM orders LIMIT 10;
```

If empty, **autocomplete won't have data to learn from**. Create some test orders first.

### Issue 5: Slow Performance

**Add database indexes**:
```sql
CREATE INDEX idx_orders_item_description ON orders(item_description(100));
CREATE INDEX idx_orders_category ON orders(category(50));
CREATE INDEX idx_orders_part_number ON orders(part_number(50));
CREATE INDEX idx_orders_status ON orders(status);
```

---

## Debug Mode

### Enable Verbose Logging

Edit `backend/routes/autocomplete.js` temporarily:

```javascript
router.get('/categories', authenticateToken, async (req, res) => {
    console.log('=== AUTOCOMPLETE DEBUG ===');
    console.log('Query params:', req.query);
    console.log('User:', req.user);
    
    try {
        const { q, limit = 10 } = req.query;
        console.log('Searching for:', q);
        
        // ... rest of code
        
        console.log('Results found:', results.length);
        console.log('Results:', results);
        
    } catch (error) {
        console.error('AUTOCOMPLETE ERROR:', error);
        // ... error handling
    }
});
```

Then:
```bash
pm2 restart partpulse-orders
pm2 logs partpulse-orders
```

Type in browser, watch logs in real-time.

---

## Manual Initialization

If autocomplete doesn't initialize automatically, run in browser console:

```javascript
// Force initialization
window.initAutocomplete();
```

This will show detailed console output about what's happening.

---

## Network Tab Debugging

1. Open DevTools (F12)
2. Go to **Network** tab
3. Type in autocomplete field
4. Look for requests to `/api/autocomplete/*`
5. Click on request to see:
   - Request headers (Authorization token)
   - Response status
   - Response body

**Healthy request**:
- Status: 200 OK
- Response: `{"suggestions": [...]}`

**Failed request**:
- Status: 401 Unauthorized → Token issue
- Status: 404 Not Found → Route not registered
- Status: 500 Internal Server Error → Backend error (check PM2 logs)

---

## Success Checklist

- [ ] Git pull completed
- [ ] PM2 restarted
- [ ] Browser cache cleared
- [ ] Can login successfully
- [ ] Console shows "Autocomplete module loaded"
- [ ] Console shows "initialized" messages after login
- [ ] Typing in Item Description shows suggestions
- [ ] Typing in Category shows suggestions
- [ ] No errors in console
- [ ] Network tab shows 200 OK responses
- [ ] PM2 logs show no errors

---

## Still Not Working?

### Get Full Diagnostic

Run this in browser console after login:

```javascript
console.log('=== AUTOCOMPLETE DIAGNOSTIC ===');
console.log('Token exists:', !!localStorage.getItem('token'));
console.log('Item Description field:', document.getElementById('itemDescription'));
console.log('Category field:', document.getElementById('category'));
console.log('Autocomplete instances:', {
    itemDescription: window.itemDescriptionAutocomplete,
    category: window.categoryAutocomplete,
    partNumber: window.partNumberAutocomplete
});

// Test API
fetch('/api/autocomplete/categories?q=test', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
})
.then(async response => {
    console.log('API Status:', response.status);
    console.log('API Response:', await response.json());
})
.catch(error => {
    console.error('API Error:', error);
});
```

Copy the output and share for further debugging.

---

**Last Updated**: Feb 23, 2026  
**Version**: 2.5.1
