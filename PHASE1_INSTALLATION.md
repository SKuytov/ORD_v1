# Phase 1: Smart Supplier Suggestions - Installation Guide

## ✅ What's Been Implemented

**Phase 1** adds AI-powered supplier recommendations when viewing order details. The system learns from historical patterns and suggests the best 2-3 suppliers for each order with reasoning.

## 🗄️ Step 1: Database Migration

Run this SQL migration to add the learning table:

```bash
cd /var/www/ORD_V1
mysql -u your_user -p your_database < backend/migrations/008_supplier_suggestions.sql
```

This creates:
- `supplier_selection_log` table (tracks which suppliers are selected for learning)
- `specialization` field in `suppliers` table (for better matching)

## 📝 Step 2: Update app.js

You need to modify the `renderOrderDetail` function in `frontend/app.js` to add the suggestions container.

### Find this section (around line 780-850):

```javascript
function renderOrderDetail(o) {
    // ... existing code ...
    
    // Only admin/procurement can edit orders
    if (currentUser.role === 'admin' || currentUser.role === 'procurement') {
        html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
        html += '<div class="detail-section-title">Update Order</div>';
```

### ADD THIS CODE **BEFORE** the "Update Order" section:

```javascript
    // ⭐ NEW: Phase 1 - Smart Supplier Suggestions
    if (currentUser.role === 'admin' || currentUser.role === 'procurement') {
        html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">';
        html += '<div>';
        html += '<div class="detail-section-title" style="margin:0;">💡 Suggested Suppliers</div>';
        html += '<div style="font-size:0.75rem;color:#94a3b8;margin-top:0.2rem;">AI-powered recommendations based on item description and history</div>';
        html += '</div>';
        
        // Option to open full supplier selector
        if (typeof openSupplierSelector === 'function') {
            html += '<button class="btn btn-secondary btn-sm" onclick="openSupplierSelector(' + o.id + ', ' + (o.supplier_id || 'null') + ')" style="white-space:nowrap;">🏢 Browse All</button>';
        }
        
        html += '</div>';
        html += '<div id="supplierSuggestionsContainer"></div>';
    }
```

### Then update the button attachment code at the end of renderOrderDetail:

```javascript
    orderDetailBody.innerHTML = html;

    // ⭐ NEW: Load supplier suggestions
    if ((currentUser.role === 'admin' || currentUser.role === 'procurement') && 
        typeof loadSupplierSuggestions === 'function') {
        loadSupplierSuggestions(o.id, o.supplier_id);
    }

    // ... rest of existing button handlers ...
```

## 🔄 Step 3: Deploy

```bash
cd /var/www/ORD_V1
git pull
pm2 restart all
```

Then **hard refresh** your browser (`Ctrl+Shift+R` or `Cmd+Shift+R`)

## 🎯 How It Works

### When you open an order detail:

1. **Suggestions Load** - System analyzes:
   - Item description keywords (e.g., "bearing" matches bearing suppliers)
   - Category history (suppliers who've supplied this category before)
   - Supplier specializations
   - Recent usage (prefer recently-used suppliers)
   - Performance scores (delivery success rate)

2. **You See 3 Cards** showing:
   - 🥇🥈🥉 **Rank** (best to third-best match)
   - **Match percentage** (how relevant this supplier is)
   - **Star rating** (performance score)
   - **Reasons** why it was suggested
   - **Contact info**
   - **One-click "Assign Supplier" button**

3. **Smart Learning** - When you assign a supplier:
   - System logs whether you used a suggestion or not
   - Tracks which rank you chose (1st, 2nd, or 3rd)
   - Uses this data to improve future suggestions

## 🏆 Benefits

- ✅ **No more guessing** which supplier to use
- ✅ **One-click assignment** from suggestions
- ✅ **Gets smarter over time** as you assign more orders
- ✅ **Visual reasoning** shows why each supplier was suggested
- ✅ **Performance scores** help you pick reliable suppliers
- ✅ **Still have full control** - "Browse All" button opens full selector

## 🧪 Testing

1. Login as **procurement** or **admin**
2. Click **View** on any order
3. Look for the "💡 Suggested Suppliers" section
4. You should see:
   - If new system: "No suggestions available yet" (normal!)
   - If you have order history: 1-3 supplier cards with suggestions
5. Click **"Assign Supplier"** on a suggestion
6. Verify order updates with that supplier

## 📊 Admin Stats (Optional)

Admins can see suggestion effectiveness at:

```
GET /api/orders/stats/suggestions
```

Returns:
- How many suppliers were selected from suggestions
- Average suggestion rank used
- Top 5 most-selected suppliers

## 🔧 Customization

### Adjust Scoring Algorithm

Edit `backend/controllers/supplierSuggestionsController.js` lines 60-100 to adjust:
- Keyword match weight (currently 15 points each)
- Category match weight (currently 20 points)
- Specialization match weight (currently 25 points)
- Recent usage bonus (currently 10 points)

### Change Number of Suggestions

Line 108: Change `.slice(0, 3)` to show more/fewer suggestions

## 🚀 Next Steps: Phase 2

Once Phase 1 is working, we can add:
- **Order Assignment & Ownership** (claiming orders to avoid conflicts)
- **Bulk Processing Tools** (assign same supplier to multiple orders)
- **Supplier Quick-Add** (create supplier on-the-fly while assigning)

---

**Questions?** Check the code comments or test with sample data!
