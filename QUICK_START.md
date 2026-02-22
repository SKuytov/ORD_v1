# ⚡ Quick Start: Phase 1 Document Management

## 📍 5-Minute Setup

### 1. Install Dependencies
```bash
cd backend
npm install multer
```

### 2. Run Database Migration
```bash
mysql -u your_username -p your_database < backend/migrations/002_documents_table.sql
```

### 3. Create Upload Directory
```bash
mkdir -p backend/uploads/documents
touch backend/uploads/documents/.gitkeep
```

### 4. Update `frontend/index.html`

**In `<head>` section, after `<link rel="stylesheet" href="styles.css">`:**
```html
<link rel="stylesheet" href="documents.css">
```

**At end of `<body>`, after `<script src="app.js"></script>`:**
```html
<script src="documents.js"></script>
```

**Inside order detail panel, after `<div id="orderDetailBody">...</div>`:**
```html
<!-- Documents Section -->
<div id="documentsSection" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(148,163,184,0.2);">
    <!-- Documents UI will render here -->
</div>
```

### 5. Update `frontend/app.js`

**Find the `openOrderDetail()` function and add documents loading:**

```javascript
async function openOrderDetail(orderId) {
    try {
        const res = await apiGet(`/orders/${orderId}`);
        if (!res.success) return;
        renderOrderDetail(res.order);
        orderDetailPanel.classList.remove('hidden');
        
        // ⭐ ADD THIS LINE:
        if (typeof loadOrderDocuments === 'function') {
            loadOrderDocuments(orderId);
        }
    } catch { alert('Failed to load order details'); }
}
```

### 6. Restart Server
```bash
cd backend
npm start
```

### 7. Test It!
1. Login as admin/procurement
2. Open any order
3. Scroll down to **Documents Section**
4. Upload a document
5. Select multiple orders and click **"Generate Quote Email"**

---

## ✅ Done!

You now have:
- 📄 Document upload & management
- ☑️ Document checklist
- 📧 Email generation with Outlook integration
- ⏰ Action tracking with deadlines
- 📈 Status workflow

---

## 👀 What You'll See

### Documents Section (in Order Detail)
- **Upload Form**: Select type, choose file, add notes
- **Checklist**: Visual grid showing what's uploaded/missing
- **Documents List**: All uploaded docs with view/delete buttons
- **Action Tracking**: Flag docs for follow-up with deadlines

### Email Generation (in Order Actions Bar)
- **Button**: "📧 Generate Quote Email" (when orders selected)
- **Dialog**: Shows email with supplier details, order info
- **Actions**: Copy to clipboard OR open in Outlook

---

## 🛠️ Troubleshooting

**Button not showing?**
- Check `documents.js` is loaded
- Check browser console for errors
- Must be admin/procurement role

**Upload failing?**
- Check `backend/uploads/documents/` exists
- Check permissions: `chmod 755 backend/uploads/documents`
- Check file size (max 50MB)

**Database errors?**
- Run migration again
- Check all tables created: `documents`, `eu_deliveries`, `communications`

---

## 📚 Full Documentation

- **`PHASE1_INTEGRATION.md`** - Detailed step-by-step guide
- **`PHASE1_SUMMARY.md`** - Feature overview & roadmap
- **Code comments** - Inline documentation in all files

---

**That's it! You're ready to manage documents like a pro!** 🚀
