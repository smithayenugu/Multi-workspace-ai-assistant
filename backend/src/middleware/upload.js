// =============================================
// File Upload Middleware
// Configures multer for multiple document format uploads
// Supported: PDF, DOCX, XLSX, CSV, TXT
// =============================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure upload directory exists
const uploadDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Multer storage configuration
 * Files are stored on disk with UUID-based filenames
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to prevent collisions
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

/**
 * File filter to allow multiple document formats
 */
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',                              // PDF
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/msword',                            // DOC
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'application/vnd.ms-excel',                      // XLS
    'text/csv',                                      // CSV
    'application/csv',                               // CSV (alt)
    'text/plain',                                    // TXT
    'text/tab-separated-values',                     // TSV
  ];

  // Also allow by extension as a fallback for missing/inconsistent mime types
  const allowedExtensions = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.tsv'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file format. Allowed: PDF, DOCX, XLSX, CSV, TXT`), false);
  }
};

/**
 * Configured multer instance
 * Max file size: 10MB (configurable via MAX_FILE_SIZE env)
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760, // 10MB
    files: 1, // Maximum 1 file per upload
  },
});

module.exports = upload;
