# ✅ Phase 1: Document Management - Implementation Checklist

**Copy this checklist and check off items as you complete them!**

---

## 📦 Pre-Integration Checks

- [ ] Backed up database
- [ ] Backed up current code
- [ ] Reviewed all new files in repository
- [ ] Read `PHASE1_INTEGRATION.md`
- [ ] Read `PHASE1_SUMMARY.md`

---

## 🛠️ Backend Setup

### Dependencies
- [ ] Verified multer is in `package.json` (should already be there)
- [ ] Ran `npm install` in backend folder

### Database
- [ ] Ran migration: `002_documents_table.sql`
- [ ] Verified `documents` table exists
- [ ] Verified `eu_deliveries` table exists
- [ ] Verified `communications` table exists
- [ ] Verified `suppliers` table has `country` and `is_eu` columns
- [ ] Database migration completed without errors

### File System
- [ ] Created `backend/uploads/documents/` directory
- [ ] Set permissions: `chmod 755 backend/uploads/documents`
- [ ] Created `.gitkeep` file in uploads directory
- [ ] Updated `.gitignore` to exclude uploaded files

### Server
- [ ] Verified `backend/server.js` includes documents routes
- [ ] Verified `backend/controllers/documents.js` exists
- [ ] Verified `backend/routes/documents.js` exists
- [ ] Server starts without errors
- [ ] Health check shows version 2.2.0: `http://localhost:3000/api/health`

---

## 🎨 Frontend Setup

### Files
- [ ] Verified `frontend/documents.js` exists
- [ ] Verified `frontend/documents.css` exists

### HTML Integration
- [ ] Added `<link rel="stylesheet" href="documents.css">` in `<head>`
- [ ] Added `<script src="documents.js"></script>` before `</body>`
- [ ] Added `<div id="documentsSection">` in order detail panel
- [ ] Verified HTML syntax is correct

### JavaScript Integration
- [ ] Updated `openOrderDetail()` function in `app.js`
- [ ] Added `loadOrderDocuments(orderId)` call
- [ ] Verified no syntax errors in console

---

## 🧪 Testing: Document Upload

- [ ] Can access application
- [ ] Can login as admin/procurement
- [ ] Can open an order detail
- [ ] **Documents Section** is visible
- [ ] Can see upload form
- [ ] Can select document type from dropdown
- [ ] Can choose a PDF file
- [ ] Can upload successfully
- [ ] Document appears in documents list
- [ ] Can click "View" to open document
- [ ] Document opens in new tab
- [ ] Can see upload metadata (date, uploader)

---

## 🧪 Testing: Document Checklist

- [ ] Document checklist is visible
- [ ] Shows 5 document types (Quote PDF, Proforma, Invoice, Delivery Note, Signed Delivery)
- [ ] Items show ☐ (empty) when not uploaded
- [ ] Items show ✅ (check) when uploaded
- [ ] Checklist updates after uploading
- [ ] Visual styling works (green for complete, gray for pending)

---

## 🧪 Testing: Action Tracking

- [ ] Can check "Requires action/follow-up"
- [ ] Action details form appears
- [ ] Can set action deadline (date picker)
- [ ] Can add action notes
- [ ] Document uploads with action flag
- [ ] Document shows ⚠️ action badge
- [ ] Overdue documents highlighted in yellow
- [ ] Can click "Mark as Processed"
- [ ] Status changes to "Processed"

---

## 🧪 Testing: Document Status

- [ ] New documents show "Pending" badge (blue)
- [ ] Processed documents show "Processed" badge (green)
- [ ] Status badges have correct colors
- [ ] Can update status manually

---

## 🧪 Testing: Email Generation

### Button Visibility
- [ ] Login as admin/procurement
- [ ] Can see order actions bar (top of orders table)
- [ ] Can select orders (checkboxes)
- [ ] **"📧 Generate Quote Email"** button appears when orders selected
- [ ] Button is **green** (success color)

### Email Dialog
- [ ] Click "Generate Quote Email" button
- [ ] Dialog opens successfully
- [ ] Supplier name is displayed
- [ ] Supplier email is displayed
- [ ] Email subject is pre-filled
- [ ] Email body contains:
  - [ ] Supplier greeting
  - [ ] Order numbers
  - [ ] Item descriptions
  - [ ] Part numbers
  - [ ] Quantities
  - [ ] Date needed
  - [ ] Cost centers
  - [ ] Your contact info
  - [ ] Professional closing

### Copy to Clipboard
- [ ] Click "Copy to Clipboard" button
- [ ] Green success message appears
- [ ] Can paste into text editor
- [ ] Text includes subject and body
- [ ] Formatting is correct

### Outlook Integration
- [ ] Click "Open in Outlook" button
- [ ] Outlook opens (or default email client)
- [ ] Email is pre-filled with:
  - [ ] Recipient (supplier email)
  - [ ] Subject
  - [ ] Body text
- [ ] Can send email from Outlook

---

## 🧪 Testing: Document Deletion

- [ ] Can click delete button (🗑️) on document
- [ ] Confirmation dialog appears
- [ ] Can cancel deletion
- [ ] Can confirm deletion
- [ ] Document is removed from list
- [ ] File is deleted from server
- [ ] Checklist updates (checkmark removed)

---

## 🧪 Testing: Multiple Document Types

- [ ] Can upload **Quote PDF**
- [ ] Can upload **Proforma Invoice**
- [ ] Can upload **Invoice**
- [ ] Can upload **Delivery Note**
- [ ] Can upload **Signed Delivery Note**
- [ ] Can upload **Other** type
- [ ] Each type shows correct icon/label
- [ ] Checklist reflects correct types

---

## 🧪 Testing: File Type Validation

- [ ] Can upload PDF files
- [ ] Can upload Word files (.doc, .docx)
- [ ] Can upload Excel files (.xls, .xlsx)
- [ ] Can upload images (JPG, PNG, GIF)
- [ ] **Cannot** upload other types (e.g., .exe)
- [ ] Error message for invalid types

---

## 🧪 Testing: Permissions

### As Admin
- [ ] Can upload documents
- [ ] Can delete documents
- [ ] Can mark as processed
- [ ] Can generate emails

### As Procurement
- [ ] Can upload documents
- [ ] Can delete own documents
- [ ] Can mark as processed
- [ ] Can generate emails

### As Requester
- [ ] Can **view** documents
- [ ] **Cannot** upload documents (or can, depending on your requirements)
- [ ] **Cannot** delete documents
- [ ] **Cannot** generate emails

---

## 📱 Responsive Design

- [ ] Desktop view works (>900px)
- [ ] Tablet view works (600-900px)
- [ ] Mobile view works (<600px)
- [ ] Documents grid adapts
- [ ] Buttons are touchable
- [ ] Email dialog is readable on mobile

---

## 🔒 Security Testing

- [ ] Cannot upload without authentication
- [ ] Cannot access documents API without token
- [ ] Cannot upload files larger than 50MB
- [ ] Cannot upload restricted file types
- [ ] Cannot delete other users' documents (if not admin)
- [ ] File paths are sanitized (no directory traversal)

---

## 📄 Documentation

- [ ] Reviewed `PHASE1_INTEGRATION.md`
- [ ] Reviewed `PHASE1_SUMMARY.md`
- [ ] Reviewed `QUICK_START.md`
- [ ] Reviewed `README.md`
- [ ] Understand all features
- [ ] Know where to look for help

---

## 🎓 User Training

- [ ] Created user guide for document upload
- [ ] Created user guide for email generation
- [ ] Trained procurement team
- [ ] Demonstrated checklist feature
- [ ] Explained action tracking
- [ ] Shared best practices

---

## 🚀 Production Deployment

- [ ] Tested on staging server
- [ ] All tests passed
- [ ] Database backed up
- [ ] Code deployed to production
- [ ] Server restarted
- [ ] Health check verified
- [ ] Smoke test completed
- [ ] Team notified of new features

---

## 📊 Monitoring (First Week)

- [ ] Check document upload stats
- [ ] Monitor server logs for errors
- [ ] Collect user feedback
- [ ] Track email generation usage
- [ ] Verify file storage growth
- [ ] Check database performance

---

## ✅ Phase 1 Complete!

- [ ] **ALL TESTS PASSED**
- [ ] **USERS TRAINED**
- [ ] **PRODUCTION DEPLOYED**
- [ ] **TEAM HAPPY** 🎉

---

## 🔮 Ready for Phase 2?

Once Phase 1 is stable and users are comfortable:

- [ ] Discussed Phase 2 features with team
- [ ] Prioritized approval workflow
- [ ] Scheduled Phase 2 implementation
- [ ] Excited for digital approvals! 🚀

---

**Congratulations on completing Phase 1!** 🎆

**Next: Phase 2 - Digital Approval Workflow**
