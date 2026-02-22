// backend/routes/documents.js
// Document Management Routes - Phase 1

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const documentsController = require('../controllers/documents');

// Configure multer for document uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/documents');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp-orderId-originalname
        const orderId = req.params.orderId || 'unknown';
        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `${timestamp}-order${orderId}-${sanitizedName}`;
        cb(null, filename);
    }
});

// File filter - only allow specific document types
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'image/gif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, Word, Excel, and images are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// All routes require authentication
router.use(authenticateToken);

// Get all documents for an order
router.get('/order/:orderId', documentsController.getOrderDocuments);

// Upload document for an order
router.post('/order/:orderId/upload', upload.single('file'), documentsController.uploadDocument);

// Update document
router.put('/:documentId', documentsController.updateDocument);

// Delete document
router.delete('/:documentId', documentsController.deleteDocument);

// Get document statistics (for dashboard)
router.get('/stats', documentsController.getDocumentStats);

// Generate quote request email
router.post('/generate-quote-email', documentsController.generateQuoteRequestEmail);

// Error handling middleware for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 50MB.'
            });
        }
        return res.status(400).json({
            success: false,
            message: `Upload error: ${error.message}`
        });
    }
    
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
    
    next();
});

module.exports = router;
