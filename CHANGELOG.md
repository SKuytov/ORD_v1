# PartPulse Orders - Changelog

## [2.5.1] - 2026-02-23

### ✅ Fixed - Intelligent Autocomplete System

**Issue**: Autocomplete feature was not working for requester users when creating orders.

**Root Causes**:
1. **Wrong localStorage key**: Code was using `localStorage.getItem('token')` but the app uses `localStorage.getItem('authToken')`
2. **Initialization timing**: Autocomplete wasn't hooking into `showDashboard()` properly
3. **Part number format mismatch**: API returns `part_number` field, but rendering expected `text` field

**Fixes Applied**:
- ✅ Changed all instances of `'token'` to `'authToken'` in autocomplete.js
- ✅ Added proper hook into `showDashboard()` function to initialize after login
- ✅ Added `isPartNumber` flag to handle different response formats
- ✅ Enhanced console logging for debugging
- ✅ Created comprehensive testing guide ([AUTOCOMPLETE_TESTING.md](docs/AUTOCOMPLETE_TESTING.md))

**Commits**:
- `1900805` - Fix autocomplete: Use authToken and proper initialization
- `2abc2e9` - Fix part number autocomplete response format
- `b9ede05` - Add autocomplete testing and debugging guide

**Testing**:
1. Login as requester
2. Open browser console (F12)
3. Look for initialization messages
4. Type in Item Description field (2+ chars)
5. Should see dropdown with suggestions

**See**: [docs/AUTOCOMPLETE_TESTING.md](docs/AUTOCOMPLETE_TESTING.md) for full testing guide

---

## [2.5.0] - 2026-02-22

### Added - Intelligent Autocomplete System

**Backend** (`backend/routes/autocomplete.js`):
- `/api/autocomplete/smart-suggestions` - Context-aware item description suggestions
- `/api/autocomplete/categories` - Category suggestions from historical data
- `/api/autocomplete/part-numbers` - Part number suggestions with context filtering
- Multilingual support (English + Bulgarian/Cyrillic)
- Usage statistics (frequency-based ranking)

**Frontend** (`frontend/js/intelligent-autocomplete.js`):
- `IntelligentAutocomplete` class component
- Debounced search (300ms delay)
- Keyboard navigation (Arrow keys, Enter, Escape)
- Usage count badges
- Auto-fill related fields
- Responsive design

**Styling** (`frontend/css/intelligent-autocomplete.css`):
- Beautiful gradient styling
- Smooth animations
- Dark mode support
- Mobile responsive

---

## [2.4.0] - 2026-02-20

### Added - Order Assignment System
- Assignment tracking per order
- Multiple assignees per order
- Assignment notifications
- Filter by assigned/unassigned
- Role-based assignment permissions

### Added - Supplier Suggestions
- Smart supplier recommendations
- Brand/category matching
- Performance-based ranking

---

## [2.3.0] - 2026-02-18

### Added - Document Management
- File upload with progress tracking
- Multiple file attachments per order
- Document preview and download
- File type validation
- Size limit enforcement (10MB)

---

## [2.2.0] - 2026-02-15

### Added - Approval Workflow
- Manager approval requirements
- Approval requests with reason tracking
- Multi-level approval chains
- Email notifications for approvals
- Approval history and audit trail

---

## [2.1.0] - 2026-02-10

### Added - Quote Management
- Create quotes from orders
- Multiple suppliers per quote
- Quote comparison table
- Accept/reject quote items
- Convert quote to order

---

## [2.0.0] - 2026-02-01

### Added - Core System
- User authentication with JWT
- Role-based access control (Admin, Procurement, Manager, Requester)
- Order creation and tracking
- Building and cost center management
- Supplier management
- Order status workflow
- Priority levels
- Filtering and search

---

## Version Numbering

- **Major** (X.0.0): Breaking changes, major rewrites
- **Minor** (x.X.0): New features, non-breaking changes
- **Patch** (x.x.X): Bug fixes, minor improvements

---

**Current Version**: 2.5.1  
**Last Updated**: February 23, 2026  
**Status**: ✅ Production Ready
