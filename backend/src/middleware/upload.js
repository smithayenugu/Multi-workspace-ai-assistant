// =============================================
// File Upload Middleware
// Configures multer for multiple document format uploads
// Supported: PDF, DOCX, XLSX, CSV, TXT
// Files are kept in memory only — never written to local disk —
// since the deployment host's filesystem is ephemeral.
// =============================================

const multer = require('multer');
const path = require('path');

/**
 * Multer memory storage — file buffer lives in req.file.buffer,
 * never touches disk. Caller is responsible for persisting it
 * (Supabase Storage) and/or parsing it directly from the buffer.
 */
const storage = multer.memoryStorage();

/**
 * File filter to allow multiple document formats
 */
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
    'text/plain',
    'text/tab-separated-values',
  ];

  const allowedExtensions = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.tsv'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file format. Allowed: PDF, DOCX, XLSX, CSV, TXT`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760,
    files: 1,
  },
});

module.exports = upload;