// backend/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Use absolute path relative to THIS file (__dirname = backend/middleware)
// so uploads always go to backend/uploads/ regardless of PM2 cwd
// PM2 runs from /var/www/partpulse-orders but __dirname here is backend/middleware
// so this resolves to /var/www/partpulse-orders/backend/uploads/ consistently
const uploadDir = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

console.log(`\ud83d\udcc1 Upload directory: ${uploadDir}`);

// Allowed MIME types and extensions
const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const allowedExtensions = /\.(jpg|jpeg|png|gif|pdf|doc|docx)$/i;

// Configure storage with secure random filenames
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        crypto.randomBytes(16, (err, buf) => {
            if (err) return cb(err);
            const randomName = buf.toString('hex');
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${randomName}-${Date.now()}${ext}`);
        });
    }
});

// Enhanced file filter
const fileFilter = (req, file, cb) => {
    const mimeTypeValid = allowedMimeTypes.includes(file.mimetype);
    const extValid = allowedExtensions.test(path.extname(file.originalname).toLowerCase());

    file.originalname = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');

    if (mimeTypeValid && extValid) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, PDF, DOC, and DOCX files are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
        files: 5
    },
    fileFilter: fileFilter
});

module.exports = upload;
