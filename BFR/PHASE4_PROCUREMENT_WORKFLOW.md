# Phase 4: Procurement Workflow Enhancements

## 🎯 Overview

Phase 4 introduces a comprehensive **Order Assignment System** that dramatically improves procurement workflow efficiency by:

1. **Preventing conflicts** - Only one person can work on an order at a time
2. **Clear ownership** - Everyone knows who's handling what
3. **Automatic tracking** - Activity timestamps and assignment history
4. **Smart auto-release** - Stale assignments automatically freed after 30 minutes
5. **Admin controls** - Force reassignment when needed

---

## 🚀 New Features

### 1. Order Claiming System

#### Auto-Claim on First Edit
- When a procurement user opens an unassigned order and starts editing, it's **automatically claimed**
- This prevents someone else from editing the same order simultaneously
- A green banner shows "Assigned to You"

#### Manual Claiming
- Click **✋ Claim Order** button in order detail
- Order becomes yours until you release it or 30 minutes of inactivity passes

#### Visual Indicators
- ✓ Green: Assigned to you
- 🔒 Red: Assigned to someone else
- ⭕ Blue: Unassigned (available)

---

### 2. Assignment Filters

Three new quick-filter chips in Orders tab:

| Filter | Description |
|--------|-------------|
| 📋 **All Orders** | Show all orders (default) |
| 👤 **My Orders** | Show only orders assigned to you |
| ⭕ **Unassigned** | Show orders needing attention |

**Usage:**
1. Navigate to Orders tab
2. Look for assignment filter chips on the right side
3. Click to toggle between views
4. Filter remains active while browsing

---

### 3. Permission System

#### Edit Permissions
- ✅ **Assigned User**: Can edit their assigned orders
- ✅ **Admin**: Can edit ANY order, even if assigned to someone else
- ❌ **Other Users**: Cannot edit orders assigned to someone else

#### Error Messages
If you try to edit someone else's order:
> ⚠️ "This order is currently being processed by [Name]. Only they or an admin can edit it."

---

### 4. Release & Reassignment

#### Release Order (Voluntary)
1. Open an order assigned to you
2. Click **🔓 Release** button
3. Optionally provide a reason
4. Order becomes unassigned and available

#### Request Reassignment
1. Open an order assigned to you
2. Click **🔄 Request Reassignment**
3. Provide reason (required)
4. Notification sent to admin
5. Wait for admin to reassign

#### Force Reassignment (Admin Only)
1. Admin opens any assigned order
2. Click **👤 Reassign (Admin)** button
3. Select new user from dropdown
4. Provide reason (optional)
5. Order immediately reassigned

---

### 5. Auto-Release System

#### How It Works
- Orders are auto-released after **30 minutes of inactivity**
- Inactivity = no edits to the order
- Viewing doesn't count as activity
- Editing updates the activity timestamp

#### Stale Assignment Warning
When viewing a stale assignment:
> ⚠️ "Inactive for 2 hours"

This warns that the assignment may be auto-released soon.

#### Manual Trigger (Admin)
Admins can manually trigger auto-release:
```bash
# API endpoint (for cron jobs)
POST /api/order-assignments/auto-release
```

---

### 6. Assignment History

Every order tracks its complete assignment history:
- Who claimed it
- Who released it
- Who reassigned it
- When auto-release occurred
- Reasons provided

Visible in order detail panel under "Assignment History" section.

---

## 💾 Database Changes

### New Tables

#### `order_assignment_history`
Tracks all assignment changes:
- assignment_type: `claim`, `release`, `reassign`, `auto_release`
- timestamps
- user references
- reason text

#### `supplier_item_history`
Learning data for future Phase 5 (Smart Supplier Suggestions):
- Which suppliers were used for which items
- Categories and keywords
- Match quality ratings

### Modified Tables

#### `orders`
New columns:
- `assigned_to_user_id` - Current owner
- `assigned_at` - When claimed
- `last_activity_at` - Last edit timestamp
- `assignment_notes` - Optional notes

#### `suppliers`
New metadata columns (for Phase 5):
- `specialization` - Primary category
- `keywords` - Searchable tags
- `category_tags` - Comma-separated
- `performance_score` - 0-10 rating
- `total_orders` - Count
- `last_order_date` - Most recent

---

## 🛠️ API Endpoints

### Order Assignment Endpoints

```http
# Get my assigned orders
GET /api/order-assignments/my-orders

# Get unassigned orders
GET /api/order-assignments/unassigned

# Claim an order
POST /api/order-assignments/:id/claim

# Release an order
POST /api/order-assignments/:id/release
Body: { reason: "optional" }

# Request reassignment
POST /api/order-assignments/:id/request-reassignment
Body: { reason: "required" }

# Reassign order (admin only)
POST /api/order-assignments/:id/reassign
Body: { 
  new_user_id: 123,
  reason: "optional" 
}

# Get assignment history
GET /api/order-assignments/:id/history

# Auto-release stale assignments (admin only)
POST /api/order-assignments/auto-release
```

### Modified Endpoints

```http
# Get orders with assignment data
GET /api/orders?assigned_filter=mine|unassigned|all

# Get single order (now includes assignment info)
GET /api/orders/:id
Response includes:
- assigned_to_id
- assigned_to_name
- assigned_to_username
- minutes_since_activity
- assignmentHistory[]
```

---

## 👥 User Roles & Permissions

| Action | Admin | Procurement | Manager | Requester |
|--------|-------|-------------|---------|----------|
| Claim order | ✅ | ✅ | ❌ | ❌ |
| Release own order | ✅ | ✅ | ❌ | ❌ |
| Request reassignment | ✅ | ✅ | ❌ | ❌ |
| Force reassign | ✅ | ❌ | ❌ | ❌ |
| Edit assigned order | ✅ | Own only | ❌ | ❌ |
| Edit unassigned | ✅ | ✅ | ❌ | ❌ |
| View assignment filters | ✅ | ✅ | ❌ | ❌ |

---

## 📝 Usage Examples

### Scenario 1: Normal Workflow

1. **Procurement User** logs in
2. Clicks **⭕ Unassigned** filter chip
3. Sees list of orders needing attention
4. Opens order #1234
5. Starts editing (e.g., adds supplier)
6. Order automatically claimed
7. Green banner appears: "Assigned to You"
8. Completes work, submits quote
9. Clicks **🔓 Release** when done

### Scenario 2: Conflict Prevention

1. **User A** claims order #5678
2. **User B** tries to open same order
3. Sees red banner: "Assigned to User A"
4. Cannot edit the order
5. **User A** finishes and releases
6. **User B** can now claim it

### Scenario 3: Emergency Reassignment

1. **User A** is on vacation
2. Has urgent order assigned
3. **Admin** opens the order
4. Clicks **Reassign (Admin)**
5. Selects **User B**
6. Provides reason: "User A on vacation"
7. Order immediately reassigned
8. User B gets notification (if notifications enabled)

### Scenario 4: Auto-Release

1. **User A** claims order at 10:00 AM
2. Gets distracted, doesn't edit
3. At 10:30 AM, system auto-releases
4. Order back to unassigned pool
5. Assignment history shows "Auto-released after 30min inactivity"

---

## 📊 Visual Guide

### Assignment Status in Order Table

```
┌──────────────────────────────────────────┐
│ ID   │ Item           │ Status  │ ...   │
├──────────────────────────────────────────┤
│ ✓ 123 │ Bearing        │ New     │ ...   │ ← Assigned to you
│ 🔒 456 │ Motor          │ Pending │ ...   │ ← Assigned to someone
│ 789 │ Valve          │ New     │ ...   │ ← Unassigned
└──────────────────────────────────────────┘
```

### Order Detail Panel States

#### Unassigned Order
```
┌─────────────────────────────────────────┐
│ ⭕ Status: Unassigned                   │
│ Available for processing                │
│                     [✋ Claim Order]    │
└─────────────────────────────────────────┘
```

#### Assigned to You
```
┌─────────────────────────────────────────┐
│ ✓ Assigned to You (John Doe)          │
│ Claimed 15 minutes ago                  │
│ [🔓 Release] [🔄 Request Reassignment] │
└─────────────────────────────────────────┘
```

#### Assigned to Someone Else
```
┌─────────────────────────────────────────┐
│ 🔒 Assigned to Jane Smith              │
│ Claimed 2 hours ago ⚠️ Inactive       │
│ [👤 Reassign (Admin)]  ← Admin only  │
│                                         │
│ ⚠️ Only assigned user can edit        │
└─────────────────────────────────────────┘
```

---

## ⚙️ Configuration

### Auto-Release Timeout

Default: **30 minutes**

To change, edit `backend/controllers/orderAssignmentController.js`:

```javascript
const AUTO_RELEASE_MINUTES = 30; // Change this value
```

### Cron Job Setup (Optional)

For automatic cleanup, set up a cron job:

```bash
# Every hour
0 * * * * curl -X POST http://localhost:3000/api/order-assignments/auto-release \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Or use Node cron in `server.js`:

```javascript
const cron = require('node-cron');

// Run auto-release every hour
cron.schedule('0 * * * *', async () => {
    console.log('Running auto-release cleanup...');
    // Call auto-release endpoint
});
```

---

## 📚 Migration Guide

### Running the Migration

```sql
-- Run this SQL migration on your database
SOURCE backend/migrations/008_order_assignment_system.sql;
```

### What Gets Created

1. ✅ New columns in `orders` table
2. ✅ New columns in `suppliers` table
3. ✅ `order_assignment_history` table
4. ✅ `supplier_item_history` table
5. ✅ Triggers for auto-updating timestamps
6. ✅ Views for quick access (`v_my_assigned_orders`, `v_unassigned_orders`)
7. ✅ Historical data populated from existing orders

### Rollback (if needed)

```sql
-- Revert assignment columns
ALTER TABLE orders 
DROP COLUMN assigned_to_user_id,
DROP COLUMN assigned_at,
DROP COLUMN last_activity_at,
DROP COLUMN assignment_notes;

-- Drop new tables
DROP TABLE IF EXISTS order_assignment_history;
DROP TABLE IF EXISTS supplier_item_history;

-- Drop views
DROP VIEW IF EXISTS v_my_assigned_orders;
DROP VIEW IF EXISTS v_unassigned_orders;
```

---

## 🔧 Troubleshooting

### "Order is assigned to someone else" error

**Cause**: Someone else is working on it

**Solutions**:
- Wait for them to finish and release
- Ask them to release it
- Admin can force reassign
- Wait 30 minutes for auto-release

### Assignment not showing in UI

**Check**:
1. Are you admin or procurement role?
2. Is `order-assignment.js` loaded? (Check browser console)
3. Did migration run successfully?
4. Refresh the page

### Auto-release not working

**Check**:
1. Is trigger installed? `SHOW TRIGGERS LIKE 'trg_orders_update_activity';`
2. Is `last_activity_at` being updated?
3. Run manual cleanup: `POST /api/order-assignments/auto-release`

### Filter chips not appearing

**Check**:
1. User role is admin or procurement
2. JavaScript console for errors
3. `.filters-bar` element exists in HTML

---

## 🛣️ What's Next: Phase 5

**Smart Supplier Suggestions** (Coming Soon)

Phase 5 will use the data collected in Phase 4 to provide:

1. **AI-Powered Recommendations**
   - Suggest suppliers based on item description
   - Learn from historical patterns
   - Category-based matching

2. **Quick Supplier Assignment**
   - Top 3 suggestions shown in order detail
   - One-click assignment
   - Explanation for why suggested

3. **Performance Tracking**
   - Supplier ratings
   - Delivery performance
   - Price competitiveness

The `supplier_item_history` table created in Phase 4 is already collecting this data!

---

## 💬 Feedback & Support

For issues, suggestions, or questions:

1. **GitHub Issues**: [ORD_V1 Issues](https://github.com/skuytov/ORD_V1/issues)
2. **Email**: Contact your system administrator
3. **Documentation**: This file + inline code comments

---

## ✅ Testing Checklist

Before deploying to production:

- [ ] Run migration successfully
- [ ] Test auto-claim on edit
- [ ] Test manual claim
- [ ] Test release
- [ ] Test request reassignment
- [ ] Test admin force reassign
- [ ] Test assignment filters
- [ ] Test permission blocks (non-admin editing assigned order)
- [ ] Verify assignment history logging
- [ ] Test auto-release (wait 30+ min or adjust timeout)
- [ ] Check visual indicators in table
- [ ] Verify API endpoints return correct data

---

## 📝 Version History

- **v2.5.0** (2026-02-23) - Phase 4 Release
  - Order assignment system
  - Auto-claim and manual claim
  - Release and reassignment
  - Assignment filters
  - Permission system
  - Assignment history tracking
  - Auto-release after inactivity
  - Foundation for Phase 5 (supplier suggestions)

---

*Built with ❤️ for efficient procurement workflows*
