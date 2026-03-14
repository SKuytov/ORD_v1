# Phase 1: Document Management System - Integration Guide

## 🎯 Overview
This guide will help you integrate the **Document Management System** into your PartPulse Orders application.

## 📦 What's Been Added

### Backend Files
1. `backend/migrations/002_documents_table.sql` - Database schema
2. `backend/controllers/documents.js` - Document management logic
3. `backend/routes/documents.js` - API routes
4. `backend/server.js` - Updated to include document routes

### Frontend Files
1. `frontend/documents.js` - Document management UI and email generation
2. `frontend/documents.css` - Styling for documents UI

---

## 🚀 Step-by-Step Integration

### Step 1: Install Dependencies

```bash
cd backend
npm install multer
```

**Multer** is required for file uploads. It handles `multipart/form-data` for uploading files.

---

### Step 2: Run Database Migration

Run the SQL migration to create the new tables:

```bash
mysql -u your_username -p your_database < backend/migrations/002_documents_table.sql
```

Or execute it directly in your MySQL client.

This creates:
- `documents` table
- `eu_deliveries` table (for Intrastat tracking)
- `communications` table (for email tracking)
- Adds `country` and `is_eu` fields to `suppliers` table

---

### Step 3: Update `index.html`

Add the new JavaScript and CSS files to your `frontend/index.html`:

**Find this section** (near the end of `<head>`):
```html
<link rel="stylesheet" href="styles.css">
```

**Add after it:**
```html
<link rel="stylesheet" href="documents.css">
```

**Find this section** (near the end of `<body>`, before `</body>`):
```html
<script src="app.js"></script>
```

**Add after it:**
```html
<script src="documents.js"></script>
```

---

### Step 4: Add Documents Section to Order Detail Panel

Open `frontend/index.html` and find the **order detail panel**. Look for:

```html
<div id="orderDetailBody" class="detail-body">
    <!-- Order details render here -->
</div>
```

**Add this AFTER the closing `</div>` of `orderDetailBody`:**

```html
<!-- Documents Section -->
<div id="documentsSection" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(148,163,184,0.2);">
    <!-- Documents UI will render here -->
</div>
```

---

### Step 5: Update `app.js` - Load Documents When Opening Order Detail

Open `frontend/app.js` and find the `openOrderDetail()` function:

```javascript
async function openOrderDetail(orderId) {
    try {
        const res = await apiGet(`/orders/${orderId}`);
        if (!res.success) return;
        renderOrderDetail(res.order);
        orderDetailPanel.classList.remove('hidden');
    } catch { alert('Failed to load order details'); }
}
```

**Update it to:**

```javascript
async function openOrderDetail(orderId) {
    try {
        const res = await apiGet(`/orders/${orderId}`);
        if (!res.success) return;
        renderOrderDetail(res.order);
        orderDetailPanel.classList.remove('hidden');
        
        // Load documents for this order
        if (typeof loadOrderDocuments === 'function') {
            loadOrderDocuments(orderId);
        }
    } catch { alert('Failed to load order details'); }
}
```

---

### Step 6: Create Uploads Directory

Make sure the uploads directory exists:

```bash
mkdir -p backend/uploads/documents
```

Add to `.gitignore` (if not already there):

```
backend/uploads/documents/*
!backend/uploads/documents/.gitkeep
```

Create a `.gitkeep` file:

```bash
touch backend/uploads/documents/.gitkeep
```

---

### Step 7: Restart Server

```bash
cd backend
npm start
```

---

## ✅ Testing

### 1. Test Document Upload
1. Login as admin/procurement
2. Open any order detail
3. Scroll down to **Documents Section**
4. Select document type (e.g., "Quote PDF")
5. Choose a file
6. Click "Upload Document"
7. Verify the document appears in the list

### 2. Test Email Generation
1. Login as admin/procurement
2. Select one or more orders (checkbox)
3. Click **"🔧 Generate Quote Email"** button
4. Verify the email dialog opens
5. Test **"Copy to Clipboard"**
6. Test **"Open in Outlook"** (should open mailto: link)

### 3. Test Document Checklist
1. Upload different document types
2. Verify checklist updates with checkmarks ✅

---

## 🎨 Features Included

### Document Management
- ✅ Upload documents (PDF, Word, Excel, Images)
- ✅ Categorize documents by type
- ✅ Document checklist (Quote PDF, Invoice, etc.)
- ✅ Action tracking (deadlines, notes)
- ✅ Status workflow (Pending → Processed → Sent to Accounting)
- ✅ View/download documents
- ✅ Delete documents

### Email Generation
- ✅ Generate quote request emails
- ✅ Auto-populate supplier details
- ✅ Include order details
- ✅ Copy to clipboard
- ✅ Open in Outlook via mailto: link

---

## 🔮 Next Steps (Phase 2+)

Once Phase 1 is working:
- **Phase 2:** Approval workflow (manager approvals)
- **Phase 3:** EU delivery tracking & Intrastat compliance
- **Phase 4:** Communication logging
- **Phase 5:** Accounting handoff automation

---

## 🐛 Troubleshooting

### "Failed to upload document"
- Check `backend/uploads/documents/` exists
- Check file permissions: `chmod 755 backend/uploads/documents`
- Check file size (max 50MB)

### "Generate Quote Email" button not showing
- Make sure `documents.js` is loaded in `index.html`
- Check browser console for JavaScript errors
- Verify you're logged in as admin/procurement

### Database errors
- Make sure migration ran successfully
- Check `order_history` table exists (used for logging)

### Multer errors
- Run: `npm install multer` in backend folder
- Restart server

---

## 📝 Notes

- **File uploads are stored locally** in `backend/uploads/documents/`
- **Filenames are auto-generated** with timestamp and order ID
- **All document operations are logged** in `order_history` table
- **Only admin/procurement** can see email generation button
- **Requesters** can view documents but with limited actions

---

## 🎉 Success!

Once integrated, you should see:
1. **Documents section** in order detail panel
2. **Upload form** with document type dropdown
3. **Document checklist** showing what's missing
4. **Email generation button** in order actions bar
5. **Email dialog** with copy and Outlook integration

Enjoy your new Document Management System! 🚀
