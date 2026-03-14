# 📦 PartPulse Orders v2.2 - Document Management System

**Industrial-grade Order & Document Management for Manufacturing**

[![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)](https://github.com/SKuytov/ORD_v1)
[![Status](https://img.shields.io/badge/status-production-brightgreen.svg)](https://github.com/SKuytov/ORD_v1)
[![Phase](https://img.shields.io/badge/phase-1%20complete-success.svg)](https://github.com/SKuytov/ORD_v1)

---

## 🌟 What's New in v2.2

### 📦 Phase 1: Document Management System (COMPLETE)

A comprehensive solution for managing procurement documents, automating email generation, and tracking compliance deadlines.

**Key Features:**
- 📄 **Document Upload & Organization** - Upload quotes, invoices, delivery notes, etc.
- ☑️ **Visual Document Checklist** - See what's missing at a glance
- 📧 **Email Generation** - One-click quote request emails with Outlook integration
- ⏰ **Action Tracking** - Set deadlines and flag documents requiring follow-up
- 📈 **Status Workflow** - Pending → Processed → Sent to Accounting → Archived
- 📊 **Audit Trail** - Full history of uploads, changes, and processing

---

## 📦 Quick Overview

### Core Order Management

**For Requesters:**
- Create orders with file attachments
- Track order status in real-time
- View delivery timelines
- Access order documents

**For Procurement/Admin:**
- Manage all orders across buildings
- Advanced filtering & grouping
- Bulk operations
- Quote management
- **NEW:** Document management
- **NEW:** Email automation

**For Managers:**
- Coming in Phase 2: Digital approvals

---

## 🚀 Getting Started

### Installation

```bash
# Clone repository
git clone https://github.com/SKuytov/ORD_v1.git
cd ORD_v1

# Install backend dependencies
cd backend
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Initialize database
mysql -u root -p < migrations/001_initial_schema.sql
mysql -u root -p < migrations/002_documents_table.sql

# Start server
npm start
```

### Quick Setup (Phase 1 Documents)

See **[QUICK_START.md](./QUICK_START.md)** for 5-minute integration guide.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[QUICK_START.md](./QUICK_START.md)** | 5-minute setup guide |
| **[PHASE1_INTEGRATION.md](./PHASE1_INTEGRATION.md)** | Detailed integration steps |
| **[PHASE1_SUMMARY.md](./PHASE1_SUMMARY.md)** | Feature overview & roadmap |

---

## 🎯 Features

### Order Management
- ✅ Multi-building support
- ✅ Cost center tracking
- ✅ Priority levels (Normal, High, Urgent)
- ✅ Status workflow (12 states)
- ✅ File attachments
- ✅ Real-time filtering
- ✅ Flat & grouped views
- ✅ Delivery timeline tracking
- ✅ Order history log

### Document Management ⭐ NEW
- ✅ Multi-format uploads (PDF, Word, Excel, Images)
- ✅ Document categorization (11 types)
- ✅ Visual checklist
- ✅ Action tracking with deadlines
- ✅ Status workflow
- ✅ Metadata & notes
- ✅ Audit trail

### Email Automation ⭐ NEW
- ✅ One-click quote request generation
- ✅ Auto-populated supplier details
- ✅ Professional email templates
- ✅ Copy to clipboard
- ✅ Outlook integration (mailto:)

### Supplier Management
- ✅ Supplier database
- ✅ Contact information
- ✅ EU/country tracking (for Intrastat)
- ✅ Active/inactive status

### Quote Management
- ✅ Multi-order quotes
- ✅ Status tracking
- ✅ Validity dates
- ✅ Item-level pricing

### User Management
- ✅ Role-based access (Admin, Procurement, Requester)
- ✅ Building-based permissions
- ✅ JWT authentication
- ✅ Password management

### Buildings & Cost Centers
- ✅ Multi-location support
- ✅ Cost center management
- ✅ Building-specific cost centers

---

## 🗺️ Roadmap

### ✅ Phase 1: Document Management (COMPLETE)
- Document upload & organization
- Document checklist
- Email generation
- Action tracking
- Status workflow

### 🚧 Phase 2: Approval Workflow (Next)
- Digital manager approvals
- Approval dashboard
- Email notifications
- Approval history

### 🗓️ Phase 3: EU Delivery & Intrastat Tracking
- Auto-detect EU suppliers
- 14-day deadline tracking
- Intrastat report generation
- Compliance alerts

### 📝 Phase 4: Communication Logging
- Email correspondence tracking
- Supplier communication history
- Automatic reminders
- Search & filtering

### 📊 Phase 5: Accounting Handoff
- Batch document export
- Accounting dashboard
- One-click handoff
- Status reporting

### 🚀 Phase 6: Advanced Features
- OCR invoice data extraction
- Document templates
- Bulk operations
- Mobile app
- AI-powered insights

---

## 💻 Tech Stack

### Backend
- **Node.js** + **Express.js** - REST API
- **MySQL** - Database
- **JWT** - Authentication
- **Multer** - File uploads
- **Nodemailer** - Email (future)

### Frontend
- **Vanilla JavaScript** - No framework bloat
- **Modern CSS** - Responsive design
- **Fetch API** - RESTful communication

### Security
- Helmet.js - Security headers
- bcrypt - Password hashing
- CORS - Cross-origin protection
- Input validation
- File type restrictions

---

## 📸 Screenshots

### Order Management
- Flat view with filtering
- Grouped by status
- Order detail panel
- Real-time updates

### Document Management ⭐ NEW
- Upload interface
- Document checklist
- Document list with actions
- Status badges

### Email Generation ⭐ NEW
- Email preview dialog
- Copy to clipboard
- Outlook integration
- Supplier auto-fill

---

## ⚙️ Configuration

### Environment Variables

Create `backend/.env`:

```env
# Database
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=partpulse_orders

# Server
PORT=3000
NODE_ENV=production

# JWT
JWT_SECRET=your_secret_key_here
JWT_EXPIRES_IN=24h

# Frontend
FRONTEND_URL=http://localhost:3000

# Company Info (for emails)
COMPANY_NAME=Your Company
COMPANY_PHONE=+359-xxx-xxx-xxx
```

---

## 👥 User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: orders, users, buildings, cost centers, suppliers, documents |
| **Procurement** | Manage orders, quotes, suppliers, documents |
| **Requester** | Create orders, view own orders, view documents |
| **Manager** | Phase 2: Approve quotes |

---

## 📊 Database Schema

### Core Tables
- `users` - User accounts
- `buildings` - Building locations
- `cost_centers` - Cost center definitions
- `suppliers` - Supplier database
- `orders` - Order records
- `order_history` - Audit log
- `quotes` - Quote records
- `quote_items` - Quote line items

### Document Management ⭐ NEW
- `documents` - Document records & metadata
- `eu_deliveries` - EU delivery tracking (Phase 3)
- `communications` - Email logging (Phase 4)

---

## 🔒 Security

- **Authentication**: JWT tokens
- **Password Hashing**: bcrypt (10 rounds)
- **File Upload**: Type & size validation
- **SQL Injection**: Parameterized queries
- **XSS Protection**: Input sanitization
- **CORS**: Configured origins
- **Helmet**: Security headers

---

## 🤝 Contributing

This is a private project for PartPulse. For issues or feature requests:

1. Open an issue
2. Describe the problem/feature
3. Include steps to reproduce (for bugs)

---

## 📝 License

MIT License - See LICENSE file

---

## 📧 Contact

**Developer**: Stanislav Kuytov  
**Website**: [skuytov.eu](https://skuytov.eu)  
**Project**: PartPulse Orders  
**Version**: 2.2.0 (Phase 1 Complete)

---

## 🎉 Acknowledgments

Built with ❤️ for manufacturing teams who deserve better tools.

**Next up: Phase 2 - Digital Approval Workflow!** 🚀

---

## 💼 About PartPulse

PartPulse is an industrial software suite for spare parts management, maintenance tracking, and procurement automation.

**Other PartPulse Products:**
- **PartPulse WMS** - Spare parts warehouse management
- **PartPulse CMMS** - Maintenance management
- **PartPulse Orders** - This system

Visit [partpulse.eu](https://partpulse.eu) to learn more.
