const path = require('path');

function sanitizeFilename(filename) {
  if (typeof filename !== 'string' || !filename) {
    throw new Error('Invalid filename: must be a non-empty string');
  }
  if (filename.includes('\0')) {
    throw new Error('Invalid filename: null byte detected');
  }
  if (/[\\\/]/.test(filename)) {
    throw new Error(`Invalid filename: path separator detected in "${filename}"`);
  }
  if (filename === '..' || filename === '.') {
    throw new Error('Invalid filename: directory traversal detected');
  }
  return filename;
}

function ensurePathInsideBase(resolvedPath, baseDir) {
  const normalizedBase = path.resolve(baseDir);
  const normalizedTarget = path.resolve(resolvedPath);
  if (!normalizedTarget.startsWith(normalizedBase + path.sep) && normalizedTarget !== normalizedBase) {
    throw new Error('Invalid file path: path traversal attempt detected');
  }
  return normalizedTarget;
}

function sanitizeSubDir(subDir) {
  if (!subDir) return '';
  return subDir.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
}

function maskSecret(secret) {
  if (typeof secret !== 'string' || secret.length <= 8) return '***';
  return secret.substring(0, 4) + '...' + secret.substring(secret.length - 4);
}

module.exports = {
  sanitizeFilename,
  ensurePathInsideBase,
  sanitizeSubDir,
  maskSecret
};
