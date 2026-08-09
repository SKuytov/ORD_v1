// backend/routes/documents.js - Multi-Order Document Management (MySQL)
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const pool = require('../config/database');
const { authenticateHeaderToken, authorizeRoles } = require('../middleware/auth');
const {
    canAccessDocument,
    canAccessOrder,
    requireDocumentAccess,
    requireOrderAccess
} = require('../middleware/authz');

const uploadsRoot = path.resolve(__dirname, '../uploads');
const documentsDir = path.join(uploadsRoot, 'documents');

function safeUploadPath(storedPath) {
    if (!storedPath || typeof storedPath !== 'string') return null;
    let resolved;
    if (storedPath.startsWith('/uploads/')) {
        resolved = path.resolve(uploadsRoot, storedPath.slice('/uploads/'.length));
    } else if (path.isAbsolute(storedPath)) {
        resolved = path.resolve(storedPath);
    } else {
        resolved = path.resolve(__dirname, '..', storedPath);
    }
    return resolved === uploadsRoot || resolved.startsWith(`${uploadsRoot}${path.sep}`) ? resolved : null;
}

async function removeUploadedFile(file) {
    if (!file) return;
    const filePath = safeUploadPath(file.path);
    if (filePath) {
        try { await fs.unlink(filePath); } catch (_) { /* best-effort cleanup */ }
    }
}

function streamDocument(res, document, disposition) {
    const filePath = safeUploadPath(document.file_path);
    if (!filePath || !fsSync.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'File not found on server' });
    }
    res.setHeader('Content-Type', document.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(document.file_name)}"`);
    if (document.file_size) res.setHeader('Content-Length', document.file_size);
    const stream = fsSync.createReadStream(filePath);
    stream.on('error', error => {
        console.error('Error streaming document:', error.message);
        if (!res.headersSent) res.status(500).json({ success: false, message: 'Error streaming file' });
    });
    stream.pipe(res);
}

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            await fs.mkdir(documentsDir, { recursive: true });
            cb(null, documentsDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${name}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = /^(\.pdf|\.jpg|\.jpeg|\.png|\.doc|\.docx|\.xls|\.xlsx|\.txt|\.zip|\.rar|\.gif)$/i;
        const allowedMimeTypes = /^(application\/pdf|image\/(jpeg|png|gif)|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml|spreadsheetml)\.sheet)|text\/plain|application\/(zip|x-rar-compressed))$/i;
        const extensionOk = allowedExtensions.test(path.extname(file.originalname));
        const mimeOk = allowedMimeTypes.test(file.mimetype || '');
        cb(extensionOk && mimeOk ? null : new Error('Invalid file type. Allowed: PDF, images, Office docs, archives'), extensionOk && mimeOk);
    }
});

router.get('/:documentId/thumbnail', authenticateHeaderToken, requireDocumentAccess(), async (req, res) => {
    try {
        const document = req.document;
        if (!(document.mime_type || '').startsWith('image/')) {
            return res.status(415).json({ success: false, message: 'Not an image' });
        }
        const sourcePath = safeUploadPath(document.file_path);
        if (!sourcePath || !fsSync.existsSync(sourcePath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        const dir = path.dirname(sourcePath);
        const base = path.basename(sourcePath, path.extname(sourcePath));
        const thumbPath = path.join(dir, `thumb_${base}_400.jpg`);
        if (!safeUploadPath(thumbPath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        if (!fsSync.existsSync(thumbPath)) {
            try {
                const sharp = require('sharp');
                await sharp(sourcePath).rotate().resize({ width: 400, withoutEnlargement: true }).jpeg({ quality: 72, progressive: true }).toFile(thumbPath);
            } catch (error) {
                console.error('[thumbnail] generation unavailable:', error.message);
                return streamDocument(res, document, 'inline');
            }
        }

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.setHeader('Content-Disposition', `inline; filename="thumb_${encodeURIComponent(document.file_name)}"`);
        fsSync.createReadStream(thumbPath).on('error', () => res.end()).pipe(res);
    } catch (error) {
        console.error('Error generating thumbnail:', error);
        res.status(500).json({ success: false, message: 'Failed to generate thumbnail' });
    }
});

router.get('/:documentId/view', authenticateHeaderToken, requireDocumentAccess(), (req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=300');
    return streamDocument(res, req.document, 'inline');
});

router.get('/:documentId/download', authenticateHeaderToken, requireDocumentAccess(), (req, res) => {
    return streamDocument(res, req.document, 'attachment');
});

router.get('/order/:orderId', authenticateHeaderToken, requireOrderAccess('orderId'), async (req, res) => {
    try {
        const { type } = req.query;
        let query = `
            SELECT d.*, odl.linked_at, odl.linked_by, u_upload.name AS uploaded_by_name,
                   u_link.name AS linked_by_name,
                   GROUP_CONCAT(DISTINCT odl2.order_id ORDER BY odl2.order_id) AS linked_order_ids
            FROM documents d
            INNER JOIN order_documents_link odl ON d.id = odl.document_id
            LEFT JOIN order_documents_link odl2 ON d.id = odl2.document_id
            LEFT JOIN users u_upload ON d.uploaded_by = u_upload.id
            LEFT JOIN users u_link ON odl.linked_by = u_link.id
            WHERE odl.order_id = ?`;
        const params = [req.params.orderId];
        if (type) {
            query += ' AND d.document_type = ?';
            params.push(type);
        }
        query += ' GROUP BY d.id, odl.linked_at, odl.linked_by, u_upload.name, u_link.name ORDER BY d.uploaded_at DESC';
        const [documents] = await pool.query(query, params);
        const visible = [];
        for (const document of documents) {
            const access = await canAccessDocument(document.id, req.user);
            if (access.allowed) visible.push({
                ...document,
                linked_order_ids: document.linked_order_ids ? document.linked_order_ids.split(',').map(Number) : []
            });
        }
        res.json({ success: true, documents: visible });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

router.get('/', authenticateHeaderToken, async (req, res) => {
    try {
        const { type } = req.query;
        let query = `
            SELECT d.*, u.name AS uploaded_by_name,
                   GROUP_CONCAT(DISTINCT odl.order_id ORDER BY odl.order_id) AS linked_order_ids,
                   COUNT(DISTINCT odl.order_id) AS order_count
            FROM documents d
            LEFT JOIN order_documents_link odl ON d.id = odl.document_id
            LEFT JOIN users u ON d.uploaded_by = u.id`;
        const params = [];
        if (type) {
            query += ' WHERE d.document_type = ?';
            params.push(type);
        }
        query += ' GROUP BY d.id, u.name ORDER BY d.uploaded_at DESC';
        const [documents] = await pool.query(query, params);
        const visible = [];
        for (const document of documents) {
            const access = await canAccessDocument(document.id, req.user);
            if (access.allowed) visible.push({
                ...document,
                linked_order_ids: document.linked_order_ids ? document.linked_order_ids.split(',').map(Number) : [],
                order_count: document.order_count || 0
            });
        }
        res.json({ success: true, documents: visible });
    } catch (error) {
        console.error('Error fetching all documents:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

router.post('/upload', authenticateHeaderToken, upload.single('file'), async (req, res) => {
    let connection;
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        let orderIds = req.body.orderIds;
        if (typeof orderIds === 'string') orderIds = orderIds.split(',');
        if (!Array.isArray(orderIds)) {
            await removeUploadedFile(req.file);
            return res.status(400).json({ success: false, message: 'At least one order ID is required' });
        }
        const normalizedIds = orderIds.map(Number).filter(id => Number.isInteger(id) && id > 0);
        if (!normalizedIds.length || normalizedIds.length !== orderIds.length) {
            await removeUploadedFile(req.file);
            return res.status(400).json({ success: false, message: 'At least one valid order ID is required' });
        }
        const uniqueOrderIds = [...new Set(normalizedIds)];
        for (const orderId of uniqueOrderIds) {
            const access = await canAccessOrder(orderId, req.user);
            if (!access.allowed) {
                await removeUploadedFile(req.file);
                return res.status(access.reason === 'not_found' ? 404 : 403).json({ success: false, message: access.reason === 'not_found' ? 'Order not found' : 'Access denied' });
            }
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.query(
            `INSERT INTO documents
             (order_id, document_type, file_path, file_name, file_size, mime_type, uploaded_by, description)
             VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)`,
            [req.body.documentType || 'other', req.file.path.replace(/\\/g, '/'), req.file.originalname,
                req.file.size, req.file.mimetype, req.user.id, req.body.description || null]
        );
        const documentId = result.insertId;
        await connection.query(
            'INSERT INTO order_documents_link (order_id, document_id, linked_by) VALUES ?',
            [uniqueOrderIds.map(orderId => [orderId, documentId, req.user.id])]
        );
        await connection.commit();
        res.json({
            success: true,
            message: `Document uploaded and linked to ${uniqueOrderIds.length} order(s)`,
            document: { id: documentId, file_name: req.file.originalname, file_size: req.file.size, linked_order_ids: uniqueOrderIds }
        });
    } catch (error) {
        if (connection) await connection.rollback();
        await removeUploadedFile(req.file);
        console.error('Error uploading document:', error);
        res.status(500).json({ success: false, message: 'Failed to upload document' });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/:documentId/link', authenticateHeaderToken, requireDocumentAccess(), async (req, res) => {
    try {
        let { orderIds } = req.body;
        if (typeof orderIds === 'string') orderIds = orderIds.split(',');
        if (!Array.isArray(orderIds)) return res.status(400).json({ success: false, message: 'Order IDs are required' });
        const normalizedIds = orderIds.map(Number).filter(id => Number.isInteger(id) && id > 0);
        if (!normalizedIds.length || normalizedIds.length !== orderIds.length) {
            return res.status(400).json({ success: false, message: 'At least one valid order ID is required' });
        }
        const uniqueOrderIds = [...new Set(normalizedIds)];
        for (const orderId of uniqueOrderIds) {
            const access = await canAccessOrder(orderId, req.user);
            if (!access.allowed) {
                return res.status(access.reason === 'not_found' ? 404 : 403).json({ success: false, message: access.reason === 'not_found' ? 'Order not found' : 'Access denied' });
            }
        }
        await pool.query(
            'INSERT IGNORE INTO order_documents_link (order_id, document_id, linked_by) VALUES ?',
            [uniqueOrderIds.map(orderId => [orderId, req.params.documentId, req.user.id])]
        );
        res.json({ success: true, message: `Document linked to ${uniqueOrderIds.length} order(s)` });
    } catch (error) {
        console.error('Error linking document:', error);
        res.status(500).json({ success: false, message: 'Failed to link document' });
    }
});

router.delete('/:documentId/unlink/:orderId', authenticateHeaderToken, authorizeRoles('admin'), requireDocumentAccess(), requireOrderAccess('orderId'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [deleted] = await connection.query(
            'DELETE FROM order_documents_link WHERE document_id = ? AND order_id = ?',
            [req.params.documentId, req.params.orderId]
        );
        if (!deleted.affectedRows) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Document link not found' });
        }
        const [[linkCount]] = await connection.query(
            'SELECT COUNT(*) AS count FROM order_documents_link WHERE document_id = ?',
            [req.params.documentId]
        );
        let deletedDocument = false;
        if (linkCount.count === 0) {
            await connection.query('DELETE FROM documents WHERE id = ?', [req.params.documentId]);
            deletedDocument = true;
        }
        await connection.commit();
        if (deletedDocument) {
            const filePath = safeUploadPath(req.document.file_path);
            if (filePath) { try { await fs.unlink(filePath); } catch (_) { /* already absent */ } }
        }
        res.json({ success: true, message: deletedDocument ? 'Document unlinked and deleted' : 'Document unlinked from order' });
    } catch (error) {
        await connection.rollback();
        console.error('Error unlinking document:', error);
        res.status(500).json({ success: false, message: 'Failed to unlink document' });
    } finally {
        connection.release();
    }
});

router.delete('/:documentId', authenticateHeaderToken, authorizeRoles('admin'), requireDocumentAccess(), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM order_documents_link WHERE document_id = ?', [req.params.documentId]);
        const [deleted] = await connection.query('DELETE FROM documents WHERE id = ?', [req.params.documentId]);
        if (!deleted.affectedRows) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        await connection.commit();
        const filePath = safeUploadPath(req.document.file_path);
        if (filePath) { try { await fs.unlink(filePath); } catch (_) { /* already absent */ } }
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
