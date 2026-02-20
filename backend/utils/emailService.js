// backend/utils/emailService.js
const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = null;
        this.maxRetries = 3;
        this.retryDelay = 2000;
        this.initTransporter();
    }

    initTransporter() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            },
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            rateDelta: 1000,
            rateLimit: 5
        });

        this.transporter.verify().then(() => {
            console.log('Email server ready to send messages');
        }).catch(err => {
            console.error('Email transporter error:', err.message);
        });
    }

    isRetryableError(error) {
        const retryableCodes = [
            'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
            'ESOCKET', 'ENOTFOUND', 'ECONNECTION'
        ];
        return retryableCodes.includes(error.code);
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async sendWithRetry(mailOptions) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const info = await this.transporter.sendMail(mailOptions);
                console.log(`Email sent on attempt ${attempt}: ${info.messageId}`);
                return { success: true, messageId: info.messageId };
            } catch (error) {
                lastError = error;
                console.error(`Email attempt ${attempt} failed:`, error.message);
                
                if (!this.isRetryableError(error)) {
                    throw error;
                }
                
                if (attempt < this.maxRetries) {
                    const delay = this.retryDelay * attempt;
                    console.log(`Retrying in ${delay}ms...`);
                    await this.wait(delay);
                    this.initTransporter();
                }
            }
        }
        
        throw new Error(`Email failed after ${this.maxRetries} attempts: ${lastError.message}`);
    }

    async sendNewOrderNotification(orderData) {
        try {
            const { orderId, building, itemDescription, quantity, requester, dateNeeded } = orderData;

            const mailOptions = {
                from: process.env.EMAIL_FROM,
                to: process.env.ADMIN_EMAIL,
                subject: `New Order Request #${orderId} - Building ${building}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: #0f172a; color: #f1f5f9; padding: 20px; text-align: center;">
                            <h1 style="margin: 0;">PartPulse Order Management</h1>
                        </div>
                        
                        <div style="padding: 30px; background: #f8fafc;">
                            <h2 style="color: #0f172a; margin-top: 0;">New Order Request</h2>
                            
                            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 10px 0; color: #64748b; width: 150px;">Order ID:</td>
                                        <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">#${orderId}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px 0; color: #64748b;">Building:</td>
                                        <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${building}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px 0; color: #64748b;">Item:</td>
                                        <td style="padding: 10px 0; color: #0f172a;">${itemDescription}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px 0; color: #64748b;">Quantity:</td>
                                        <td style="padding: 10px 0; color: #0f172a;">${quantity}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px 0; color: #64748b;">Requested By:</td>
                                        <td style="padding: 10px 0; color: #0f172a;">${requester}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px 0; color: #64748b;">Date Needed:</td>
                                        <td style="padding: 10px 0; color: #0f172a;">${dateNeeded}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.FRONTEND_URL}" 
                                   style="background: #38bdf8; color: #0f172a; padding: 12px 30px; 
                                          text-decoration: none; border-radius: 6px; font-weight: 600;
                                          display: inline-block;">
                                    View Order Details
                                </a>
                            </div>
                            
                            <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                                This is an automated notification from PartPulse Order Management System.
                            </p>
                        </div>
                        
                        <div style="background: #0f172a; color: #94a3b8; padding: 20px; text-align: center; font-size: 12px;">
                            <p style="margin: 0;">&copy; 2026 PartPulse.eu - Order Management System</p>
                        </div>
                    </div>
                `
            };

            return await this.sendWithRetry(mailOptions);

        } catch (error) {
            console.error('Error sending new order notification:', error.message);
            return { success: false, error: error.message };
        }
    }

    async sendStatusUpdateNotification(updateData) {
        try {
            const { orderId, requesterEmail, oldStatus, newStatus } = updateData;

            const statusColors = {
                'Pending': '#94a3b8',
                'Quote Requested': '#f59e0b',
                'Quote Received': '#8b5cf6',
                'Ordered': '#3b82f6',
                'In Transit': '#06b6d4',
                'Delivered': '#10b981',
                'Cancelled': '#ef4444'
            };

            const mailOptions = {
                from: process.env.EMAIL_FROM,
                to: requesterEmail,
                subject: `Order #${orderId} Status Update: ${newStatus}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: #0f172a; color: #f1f5f9; padding: 20px; text-align: center;">
                            <h1 style="margin: 0;">PartPulse Order Management</h1>
                        </div>
                        
                        <div style="padding: 30px; background: #f8fafc;">
                            <h2 style="color: #0f172a; margin-top: 0;">Order Status Updated</h2>
                            
                            <p style="color: #475569; font-size: 16px;">
                                Your order #${orderId} status has been updated.
                            </p>
                            
                            <div style="background: white; padding: 25px; border-radius: 8px; margin: 20px 0; text-align: center;">
                                <div style="margin-bottom: 15px;">
                                    <span style="display: inline-block; padding: 8px 16px; background: #f1f5f9; 
                                                color: #64748b; border-radius: 6px; text-decoration: line-through;">
                                        ${oldStatus}
                                    </span>
                                </div>
                                
                                <div style="font-size: 24px; margin: 15px 0;">&darr;</div>
                                
                                <div>
                                    <span style="display: inline-block; padding: 12px 24px; 
                                                background: ${statusColors[newStatus] || '#38bdf8'}; 
                                                color: white; border-radius: 6px; font-weight: 600; font-size: 18px;">
                                        ${newStatus}
                                    </span>
                                </div>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.FRONTEND_URL}" 
                                   style="background: #38bdf8; color: #0f172a; padding: 12px 30px; 
                                          text-decoration: none; border-radius: 6px; font-weight: 600;
                                          display: inline-block;">
                                    View Order Details
                                </a>
                            </div>
                            
                            <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                                This is an automated notification from PartPulse Order Management System.
                            </p>
                        </div>
                        
                        <div style="background: #0f172a; color: #94a3b8; padding: 20px; text-align: center; font-size: 12px;">
                            <p style="margin: 0;">&copy; 2026 PartPulse.eu - Order Management System</p>
                        </div>
                    </div>
                `
            };

            return await this.sendWithRetry(mailOptions);

        } catch (error) {
            console.error('Error sending status update notification:', error.message);
            return { success: false, error: error.message };
        }
    }

    async sendAssignmentNotification(assignmentData) {
        try {
            const { orderId, assignedTo, assignedEmail, building, itemDescription } = assignmentData;

            const mailOptions = {
                from: process.env.EMAIL_FROM,
                to: assignedEmail,
                subject: `New Order Assigned: #${orderId} - Building ${building}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: #0f172a; color: #f1f5f9; padding: 20px; text-align: center;">
                            <h1 style="margin: 0;">PartPulse Order Management</h1>
                        </div>
                        
                        <div style="padding: 30px; background: #f8fafc;">
                            <h2 style="color: #0f172a; margin-top: 0;">Order Assigned to You</h2>
                            
                            <p style="color: #475569; font-size: 16px;">
                                Hello ${assignedTo}, a new order has been assigned to you.
                            </p>
                            
                            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 10px 0; color: #64748b; width: 150px;">Order ID:</td>
                                        <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">#${orderId}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px 0; color: #64748b;">Building:</td>
                                        <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${building}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px 0; color: #64748b;">Item:</td>
                                        <td style="padding: 10px 0; color: #0f172a;">${itemDescription}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.FRONTEND_URL}" 
                                   style="background: #38bdf8; color: #0f172a; padding: 12px 30px; 
                                          text-decoration: none; border-radius: 6px; font-weight: 600;
                                          display: inline-block;">
                                    View Order &amp; Start Processing
                                </a>
                            </div>
                            
                            <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                                This is an automated notification from PartPulse Order Management System.
                            </p>
                        </div>
                        
                        <div style="background: #0f172a; color: #94a3b8; padding: 20px; text-align: center; font-size: 12px;">
                            <p style="margin: 0;">&copy; 2026 PartPulse.eu - Order Management System</p>
                        </div>
                    </div>
                `
            };

            return await this.sendWithRetry(mailOptions);

        } catch (error) {
            console.error('Error sending assignment notification:', error.message);
            return { success: false, error: error.message };
        }
    }

    async testEmailConnection() {
        try {
            await this.transporter.verify();
            return { success: true, message: 'Email configuration is valid' };
        } catch (error) {
            console.error('Email configuration test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new EmailService();
