# PartPulse Order Management System

A complete order management system for manufacturing facilities with role-based access control, email notifications, and file attachment support.

## Features

- **User Authentication**: JWT-based authentication with role management
- **Order Management**: Create, track, and manage orders across multiple buildings
- **File Attachments**: Upload and manage order-related documents
- **Email Notifications**: Automated notifications for order creation and status updates
- **Role-Based Access**: Admin, Procurement, and Requester roles with specific permissions
- **Order History**: Complete audit trail of all order changes
- **Status Tracking**: Multi-stage order status workflow

## Tech Stack

**Backend:**
- Node.js 18+
- Express.js
- MySQL 8.0+
- JWT Authentication
- Nodemailer
- Multer (file uploads)

**Frontend:**
- HTML5
- CSS3
- Vanilla JavaScript
- Responsive design

## Quick Start

### Prerequisites

- Node.js 18.x or higher
- MySQL 8.0 or higher
- SMTP email account

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/SKuytov/ORD_v1.git
cd ORD_v1
```

2. **Setup Database**
```bash
mysql -u root -p < database/schema.sql
```

3. **Configure Backend**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
```

4. **Seed Default Users**
```bash
cd backend
node ../database/seed-users.js
```

5. **Start Server**
```bash
npm start
```

6. **Access Application**
```
Open browser to http://localhost:3000
```

## Default Users

After running the seed script, default users are created:

| Username | Password | Role | Building |
|----------|----------|------|----------|
| admin | Admin123! | admin | - |
| procurement1 | Proc123! | procurement | - |
| tech.ct | Tech123! | requester | CT |
| tech.cb | Tech123! | requester | CB |
| tech.ww | Tech123! | requester | WW |
| tech.ps | Tech123! | requester | PS |
| tech.lt | Tech123! | requester | LT |

**Warning: Change these passwords immediately in production!**

## Production Deployment (Proxmox + Tailscale)

This application is designed to run on a Proxmox Ubuntu VM with Tailscale VPN for secure access by factory technicians.

### Quick Deploy

```bash
# On your Ubuntu VM
git clone https://github.com/SKuytov/ORD_v1.git /var/www/partpulse-orders
cd /var/www/partpulse-orders/backend
npm install --production
cp .env.example .env
# Edit .env with production values

# Initialize database
mysql -u partpulse_user -p partpulse_orders < ../database/schema.sql
node ../database/seed-users.js

# Start with PM2
pm2 start ../ecosystem.config.js
pm2 save
pm2 startup
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Verify JWT token
- `POST /api/auth/logout` - User logout

### Orders
- `POST /api/orders` - Create new order
- `GET /api/orders` - Get all orders (filtered by role)
- `GET /api/orders/:id` - Get specific order
- `PUT /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Delete order (admin only)
- `GET /api/orders/stats/overview` - Get order statistics

## License

MIT License - see LICENSE file for details

## Author

**Stanislav Kuytov**
- Email: s.kuytov@skuytov.eu
- Website: https://skuytov.eu
- GitHub: [@SKuytov](https://github.com/SKuytov)
