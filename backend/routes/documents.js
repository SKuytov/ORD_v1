// backend/routes/documents.js - Multi-Order Document Management (MySQL)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const pool = require('../config/database');
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
        const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${name}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|jpg|jpeg|png|doc|docx|xls|xlsx|txt|zip|rar|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: PDF, images, Office docs, archives'));
        }
    }
});

// ========== GET: Thumbnail (resized preview for images) ==========
// Generates a 400px-wide JPEG thumbnail on first request, caches to disk.
// Usage: GET /api/documents/:id/thumbnail?token=<jwt>
// Falls back to original file if not an image or sharp unavailable.
router.get('/:documentId/thumbnail', async (req, res) => {
    try {
        const { documentId } = req.params;
        const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');

        if (!token) return res.status(401).json({ success: false, message: 'Token required' });

        try {
            const jwt = require('jsonwebtoken');
            jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        } catch {
            return res.status(403).json({ success: false, message: 'Invalid token' });
        }

        const [documents] = await pool.query(
            'SELECT file_path, file_name, mime_type FROM documents WHERE id = ?',
            [documentId]
        );
        if (!documents.length) return res.status(404).json({ success: false, message: 'Document not found' });

        const doc = documents[0];

        // Only process images
        const isImage = (doc.mime_type || '').startsWith('image/');
        if (!isImage) {
            return res.status(415).json({ success: false, message: 'Not an image' });
        }

        // Check source file exists
        try { await fs.access(doc.file_path); } catch {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        // Thumbnail cache path — same dir as uploads, prefixed with "thumb_"
        const dir = path.dirname(doc.file_path);
        const base = path.basename(doc.file_path, path.extname(doc.file_path));
        const thumbPath = path.join(dir, `thumb_${base}_400.jpg`);

        // Serve from cache if exists
        try {
            await fs.access(thumbPath);
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'private, max-age=86400');
            res.setHeader('Content-Disposition', `inline; filename="thumb_${encodeURIComponent(doc.file_name)}"`);
            const stream = fsSync.createReadStream(thumbPath);
            stream.pipe(res);
            stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
            return;
        } catch {
            // Cache miss — generate below
        }

        // Generate thumbnail with sharp
        let sharp;
        try {
            sharp = require('sharp');
        } catch {
            // sharp not available — stream original file as fallback
            res.setHeader('Content-Type', doc.mime_type);
            res.setHeader('Cache-Control', 'private, max-age=300');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.file_name)}"`);
            const stream = fsSync.createReadStream(doc.file_path);
            stream.pipe(res);
            stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
            return;
        }

        try {
            await sharp(doc.file_path)
                .rotate()                          // auto-rotate from EXIF
                .resize({ width: 400, withoutEnlargement: true })
                .jpeg({ quality: 72, progressive: true })
                .toFile(thumbPath);
        } catch (sharpErr) {
            console.error('[thumbnail] sharp error:', sharpErr.message);
            // Fall back to original
            res.setHeader('Content-Type', doc.mime_type);
            res.setHeader('Cache-Control', 'private, max-age=300');
            const stream = fsSync.createReadStream(doc.file_path);
            stream.pipe(res);
            stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
            return;
        }

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.setHeader('Content-Disposition', `inline; filename="thumb_${encodeURIComponent(doc.file_name)}"`);
        const stream = fsSync.createReadStream(thumbPath);
        stream.pipe(res);
        stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });

    } catch (error) {
        console.error('Error generating thumbnail:', error);
        res.status(500).json({ success: false, message: 'Failed to generate thumbnail' });
    }
});

// ========== GET: Download document file ==========
// ========== GET: View document inline (token via query param — Edge/Safari compatible) ==========
// Usage: /api/documents/:id/view?token=<jwt>
router.get('/:documentId/view', async (req, res) => {
    try {
        const { documentId } = req.params;
        const token = req.query.token;

        if (!token) return res.status(401).json({ success: false, message: 'Token required' });

        let decoded;
        try {
            const jwt = require('jsonwebtoken');
            decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        } catch {
            return res.status(403).json({ success: false, message: 'Invalid token' });
        }

        const [documents] = await pool.query(
            'SELECT file_path, file_name, mime_type, file_size FROM documents WHERE id = ?',
            [documentId]
        );
        if (!documents.length) return res.status(404).json({ success: false, message: 'Document not found' });

        const document = documents[0];
        try { await fs.access(document.file_path); } catch {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        // Serve inline so browser displays images/PDFs directly
        res.setHeader('Content-Type', document.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.file_name)}"`);
        res.setHeader('Cache-Control', 'private, max-age=300');

        const fileStream = fsSync.createReadStream(document.file_path);
        fileStream.pipe(res);
        fileStream.on('error', (err) => {
            console.error('Error streaming file:', err);
            if (!res.headersSent) res.status(500).end();
        });
    } catch (error) {
        console.error('Error viewing document:', error);
        res.status(500).json({ success: false, message: 'Failed to view document' });
    }
});

router.get('/:documentId/download', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;

        const [documents] = await pool.query(
            'SELECT file_path, file_name, mime_type, file_size FROM documents WHERE id = ?',
            [documentId]
        );

        if (documents.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const document = documents[0];
        const filePath = document.file_path;

        try {
            await fs.access(filePath);
        } catch (err) {
            console.error('File not found on disk:', filePath);
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        res.setHeader('Content-Type', document.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.file_name)}"`);
        res.setHeader('Content-Length', document.file_size);

        const fileStream = fsSync.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('Error streaming file:', err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Error streaming file' });
            }
        });
    } catch (error) {
        console.error('Error downloading document:', error);
        res.status(500).json({ success: false, message: 'Failed to download document' });
    }
});

// ========== GET: Documents for specific order (with optional type filter) ==========
router.get('/order/:orderId', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        // ⭐ NEW: optional ?type=invoice filter
        const { type } = req.query;

        let queryStr = `
            SELECT 
                d.*,
                odl.linked_at,
                odl.linked_by,
                u_upload.name as uploaded_by_name,
                u_link.name as linked_by_name,
                GROUP_CONCAT(DISTINCT odl2.order_id ORDER BY odl2.order_id) as linked_order_ids
            FROM documents d
            INNER JOIN order_documents_link odl ON d.id = odl.document_id
            LEFT JOIN order_documents_link odl2 ON d.id = odl2.document_id
            LEFT JOIN users u_upload ON d.uploaded_by = u_upload.id
            LEFT JOIN users u_link ON odl.linked_by = u_link.id
            WHERE odl.order_id = ?`;

        const queryParams = [orderId];

        // ⭐ NEW: append type filter if provided
        if (type) {
            queryStr += ' AND d.document_type = ?';
            queryParams.push(type);
        }

        queryStr += ' GROUP BY d.id, odl.linked_at, odl.linked_by, u_upload.name, u_link.name ORDER BY d.uploaded_at DESC';

        const [documents] = await pool.query(queryStr, queryParams);

        const documentsWithLinks = documents.map(doc => ({
            ...doc,
            linked_order_ids: doc.linked_order_ids ? doc.linked_order_ids.split(',').map(Number) : []
        }));

        res.json({ success: true, documents: documentsWithLinks });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

// ========== GET: All documents (for selection dialog) ==========
router.get('/', authenticateToken, async (req, res) => {
    try {
        // ⭐ NEW: optional ?type= filter
        const { type } = req.query;

        let queryStr = `
            SELECT 
                d.*,
                u.name as uploaded_by_name,
                GROUP_CONCAT(DISTINCT odl.order_id ORDER BY odl.order_id) as linked_order_ids,
                COUNT(DISTINCT odl.order_id) as order_count
            FROM documents d
            LEFT JOIN order_documents_link odl ON d.id = odl.document_id
            LEFT JOIN users u ON d.uploaded_by = u.id`;

        const queryParams = [];
        if (type) {
            queryStr += ' WHERE d.document_type = ?';
            queryParams.push(type);
        }

        queryStr += ' GROUP BY d.id, u.name ORDER BY d.uploaded_at DESC';

        const [documents] = await pool.query(queryStr, queryParams);

        const documentsWithLinks = documents.map(doc => ({
            ...doc,
            linked_order_ids: doc.linked_order_ids ? doc.linked_order_ids.split(',').map(Number) : [],
            order_count: doc.order_count || 0
        }));

        res.json({ success: true, documents: documentsWithLinks });
    } catch (error) {
        console.error('Error fetching all documents:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

// ========== POST: Upload document and link to multiple orders ==========
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        let orderIds = req.body.orderIds;
        if (typeof orderIds === 'string') {
            orderIds = orderIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
        } else if (Array.isArray(orderIds)) {
            orderIds = orderIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        } else {
            return res.status(400).json({ success: false, message: 'At least one order ID is required' });
        }

        if (orderIds.length === 0) {
            await fs.unlink(req.file.path);
            return res.status(400).json({ success: false, message: 'At least one valid order ID is required' });
        }

        const description = req.body.description || null;
        const documentType = req.body.documentType || 'other';

        await connection.beginTransaction();

        const [result] = await connection.query(`
            INSERT INTO documents 
            (order_id, document_type, file_path, file_name, file_size, mime_type, uploaded_by, description)
            VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)
        `, [
            documentType,
            req.file.path.replace(/\\/g, '/'),
            req.file.originalname,
            req.file.size,
            req.file.mimetype,
            req.user.id,
            description
        ]);

        const documentId = result.insertId;

        const linkValues = orderIds.map(orderId => [orderId, documentId, req.user.id]);
        await connection.query(`
            INSERT INTO order_documents_link (order_id, document_id, linked_by)
            VALUES ?
        `, [linkValues]);

        await connection.commit();

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
        await connection.rollback();
        console.error('Error uploading document:', error);
        if (req.file) {
            try { await fs.unlink(req.file.path); } catch (unlinkError) { console.error('Error deleting file:', unlinkError); }
        }
        res.status(500).json({ success: false, message: 'Failed to upload document' });
    } finally {
        connection.release();
    }
});

// ========== POST: Link existing document to additional orders ==========
router.post('/:documentId/link', authenticateToken, async (req, res) => {
    try {
        const { documentId } = req.params;
        let { orderIds } = req.body;

        if (typeof orderIds === 'string') {
            orderIds = orderIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
        } else if (Array.isArray(orderIds)) {
            orderIds = orderIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        } else {
            return res.status(400).json({ success: false, message: 'Order IDs are required' });
        }

        if (orderIds.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one valid order ID is required' });
        }

        const [documents] = await pool.query('SELECT id FROM documents WHERE id = ?', [documentId]);
        if (documents.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const linkValues = orderIds.map(orderId => [orderId, documentId, req.user.id]);
        await pool.query(`
            INSERT IGNORE INTO order_documents_link (order_id, document_id, linked_by)
            VALUES ?
        `, [linkValues]);

        res.json({ success: true, message: `Document linked to ${orderIds.length} order(s)` });
    } catch (error) {
        console.error('Error linking document:', error);
        res.status(500).json({ success: false, message: 'Failed to link document' });
    }
});

// ========== DELETE: Unlink document from specific order ==========
router.delete('/:documentId/unlink/:orderId', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        // ⭐ SECURITY: Only admin can unlink/delete documents
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only admin users can delete or unlink documents' });
        }

        const { documentId, orderId } = req.params;

        await connection.beginTransaction();

        await connection.query(
            'DELETE FROM order_documents_link WHERE document_id = ? AND order_id = ?',
            [documentId, orderId]
        );

        const [linkCount] = await connection.query(
            'SELECT COUNT(*) as count FROM order_documents_link WHERE document_id = ?',
            [documentId]
        );

        if (linkCount[0].count === 0) {
            const [documents] = await connection.query(
                'SELECT file_path FROM documents WHERE id = ?',
                [documentId]
            );
            if (documents.length > 0) {
                try { await fs.unlink(documents[0].file_path); } catch (err) { console.error('Error deleting file:', err); }
                await connection.query('DELETE FROM documents WHERE id = ?', [documentId]);
            }
        }

        await connection.commit();

        res.json({
            success: true,
            message: linkCount[0].count === 0 ? 'Document unlinked and deleted' : 'Document unlinked from order'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error unlinking document:', error);
        res.status(500).json({ success: false, message: 'Failed to unlink document' });
    } finally {
        connection.release();
    }
});

// ========== DELETE: Delete document entirely (all links + file) ==========
router.delete('/:documentId', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        // ⭐ SECURITY: Only admin can delete documents
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only admin users can delete documents' });
        }

        const { documentId } = req.params;

        await connection.beginTransaction();

        const [documents] = await connection.query(
            'SELECT file_path FROM documents WHERE id = ?',
            [documentId]
        );
        
        if (documents.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        await connection.query('DELETE FROM order_documents_link WHERE document_id = ?', [documentId]);
        await connection.query('DELETE FROM documents WHERE id = ?', [documentId]);
        await connection.commit();

        try { await fs.unlink(documents[0].file_path); } catch (err) { console.error('Error deleting file:', err); }

        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        await connection.rollback();
        console.error('Error deleting document:', error);
        res.status(500).json({ success: false, message: 'Failed to delete document' });
    } finally {
        connection.release();
    }
});

module.exports = router;
