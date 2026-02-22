// backend/routes/documents.js - Multi-Order Document Management
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for document uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/documents');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        cb(null, `${name}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|jpg|jpeg|png|doc|docx|xls|xlsx|txt|zip|rar/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: PDF, images, Office docs, archives'));
        }
    }
});

// ========== GET: Documents for specific order ==========
router.get('/order/:orderId', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;

        // Get all documents linked to this order
        const documents = db.prepare(`
            SELECT 
                d.*,
                odl.linked_at,
                odl.linked_by,
                GROUP_CONCAT(odl2.order_id) as linked_order_ids
            FROM documents d
            INNER JOIN order_documents_link odl ON d.id = odl.document_id
            LEFT JOIN order_documents_link odl2 ON d.id = odl2.document_id
            WHERE odl.order_id = ?
            GROUP BY d.id
            ORDER BY d.uploaded_at DESC
        `).all(orderId);

        // Parse linked_order_ids from comma-separated string to array
        const documentsWithLinks = documents.map(doc => ({
            ...doc,
            linked_order_ids: doc.linked_order_ids ? doc.linked_order_ids.split(',').map(Number) : []
        }));

        res.json({
            success: true,
            documents: documentsWithLinks
        });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch documents'
        });
    }
});

// ========== GET: All documents (for selection dialog) ==========
router.get('/', authenticateToken, async (req, res) => {
    try {
        const documents = db.prepare(`
            SELECT 
                d.*,
                GROUP_CONCAT(DISTINCT odl.order_id) as linked_order_ids,
                COUNT(DISTINCT odl.order_id) as order_count
            FROM documents d
            LEFT JOIN order_documents_link odl ON d.id = odl.document_id
            GROUP BY d.id
            ORDER BY d.uploaded_at DESC
        `).all();

        const documentsWithLinks = documents.map(doc => ({
            ...doc,
            linked_order_ids: doc.linked_order_ids ? doc.linked_order_ids.split(',').map(Number) : [],
            order_count: doc.order_count || 0
        }));

        res.json({
            success: true,
            documents: documentsWithLinks
        });
    } catch (error) {
        console.error('Error fetching all documents:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch documents'
        });
    }
});

// ========== POST: Upload document and link to multiple orders ==========
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Parse order IDs (can be array or comma-separated string)
        let orderIds = req.body.orderIds;
        if (typeof orderIds === 'string') {
            orderIds = orderIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
        } else if (Array.isArray(orderIds)) {
            orderIds = orderIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        } else {
            return res.status(400).json({
                success: false,
                message: 'At least one order ID is required'
            });
        }

        if (orderIds.length === 0) {
            // Clean up uploaded file
            await fs.unlink(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'At least one valid order ID is required'
            });
        }

        const description = req.body.description || '';
        const documentType = req.body.documentType || 'general';

        // Insert document record
        const insertDoc = db.prepare(`
            INSERT INTO documents (file_name, file_path, file_size, file_type, uploaded_by, description, document_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insertDoc.run(
            req.file.originalname,
            req.file.path.replace(/\\/g, '/'),
            req.file.size,
            req.file.mimetype,
            req.user.username,
            description,
            documentType
        );

        const documentId = result.lastInsertRowid;

        // Link document to all specified orders
        const insertLink = db.prepare(`
            INSERT INTO order_documents_link (order_id, document_id, linked_by)
            VALUES (?, ?, ?)
        `);

        const linkMany = db.transaction((docId, ordIds, username) => {
            for (const orderId of ordIds) {
                insertLink.run(orderId, docId, username);
            }
        });

        linkMany(documentId, orderIds, req.user.username);

        res.json({
            success: true,
            message: `Document uploaded and linked to ${orderIds.length} order(s)`,
            document: {
                id: documentId,
                file_name: req.file.originalname,
                file_size: req.file.size,
                linked_order_ids: orderIds
            }
        });
    } catch (error) {
        console.error('Error uploading document:', error);
        // Clean up file if database insert fails
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting file:', unlinkError);
            }
        }
        res.status(500).json({
            success: false,
            message: 'Failed to upload document'
        });
    }
});

// ========== POST: Link existing document to additional orders ==========
router.post('/:documentId/link', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;
        let { orderIds } = req.body;

        // Parse order IDs
        if (typeof orderIds === 'string') {
            orderIds = orderIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
        } else if (Array.isArray(orderIds)) {
            orderIds = orderIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        } else {
            return res.status(400).json({
                success: false,
                message: 'Order IDs are required'
            });
        }

        if (orderIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one valid order ID is required'
            });
        }

        // Verify document exists
        const document = db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId);
        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        // Link to orders (ignore duplicates)
        const insertLink = db.prepare(`
            INSERT OR IGNORE INTO order_documents_link (order_id, document_id, linked_by)
            VALUES (?, ?, ?)
        `);

        const linkMany = db.transaction((docId, ordIds, username) => {
            for (const orderId of ordIds) {
                insertLink.run(orderId, docId, username);
            }
        });

        linkMany(documentId, orderIds, req.user.username);

        res.json({
            success: true,
            message: `Document linked to ${orderIds.length} order(s)`
        });
    } catch (error) {
        console.error('Error linking document:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to link document'
        });
    }
});

// ========== DELETE: Unlink document from specific order ==========
router.delete('/:documentId/unlink/:orderId', authenticateToken, async (req, res) => {
    try {
        const { documentId, orderId } = req.params;

        // Remove link
        const stmt = db.prepare('DELETE FROM order_documents_link WHERE document_id = ? AND order_id = ?');
        stmt.run(documentId, orderId);

        // Check if document still has links
        const linkCount = db.prepare('SELECT COUNT(*) as count FROM order_documents_link WHERE document_id = ?')
            .get(documentId).count;

        // If no more links, delete the document file and record
        if (linkCount === 0) {
            const doc = db.prepare('SELECT file_path FROM documents WHERE id = ?').get(documentId);
            if (doc) {
                try {
                    await fs.unlink(doc.file_path);
                } catch (err) {
                    console.error('Error deleting file:', err);
                }
                db.prepare('DELETE FROM documents WHERE id = ?').run(documentId);
            }
        }

        res.json({
            success: true,
            message: linkCount === 0 ? 'Document unlinked and deleted' : 'Document unlinked from order'
        });
    } catch (error) {
        console.error('Error unlinking document:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unlink document'
        });
    }
});

// ========== DELETE: Delete document entirely (all links + file) ==========
router.delete('/:documentId', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;

        // Get document info
        const doc = db.prepare('SELECT file_path FROM documents WHERE id = ?').get(documentId);
        if (!doc) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        // Delete all links first
        db.prepare('DELETE FROM order_documents_link WHERE document_id = ?').run(documentId);

        // Delete document record
        db.prepare('DELETE FROM documents WHERE id = ?').run(documentId);

        // Delete physical file
        try {
            await fs.unlink(doc.file_path);
        } catch (err) {
            console.error('Error deleting file:', err);
        }

        res.json({
            success: true,
            message: 'Document deleted'
        });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete document'
        });
    }
});

module.exports = router;
