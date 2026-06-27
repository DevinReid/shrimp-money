const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const SALT_LENGTH = 64; // 64 bytes for salt
const TAG_LENGTH = 16; // 16 bytes for authentication tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Get or generate encryption key from environment variable
 * The key should be a 32-byte (256-bit) value for AES-256
 */
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    console.warn('⚠️  WARNING: ENCRYPTION_KEY not found in environment variables!');
    console.warn('   Data encryption is disabled. Set ENCRYPTION_KEY in .env.local');
    console.warn('   Generate a key using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    return null;
  }

  // If key is hex string, convert to buffer
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }

  // Otherwise, derive key from string using PBKDF2
  const salt = crypto.randomBytes(SALT_LENGTH);
  return crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt data using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted data as hex string (format: iv:tag:encrypted)
 */
function encrypt(text) {
  const key = getEncryptionKey();
  
  // If encryption is disabled (no key), return plain text with marker
  if (!key) {
    return text; // Return as-is if encryption disabled
  }

  try {
    // Generate random IV for each encryption
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Return format: iv:tag:encrypted (all as hex)
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedData - Encrypted data as hex string
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedData) {
  const key = getEncryptionKey();
  
  // If encryption is disabled (no key), return as-is
  if (!key) {
    return encryptedData;
  }

  // Check if data is encrypted (has format iv:tag:encrypted)
  if (!encryptedData.includes(':')) {
    // Legacy unencrypted data, return as-is
    return encryptedData;
  }

  try {
    const parts = encryptedData.split(':');
    
    if (parts.length !== 3) {
      // Invalid format, assume unencrypted
      return encryptedData;
    }

    const [ivHex, tagHex, encrypted] = parts;
    
    // Convert hex strings to buffers
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    // If decryption fails, try returning as-is (might be unencrypted legacy data)
    return encryptedData;
  }
}

/**
 * Encrypt sensitive fields in an object
 * @param {object} obj - Object to encrypt
 * @param {string[]} fields - Array of field names to encrypt
 * @returns {object} - Object with specified fields encrypted
 */
function encryptObject(obj, fields) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const encrypted = { ...obj };
  
  fields.forEach(field => {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      encrypted[field] = encrypt(encrypted[field]);
    }
  });

  return encrypted;
}

/**
 * Decrypt sensitive fields in an object
 * @param {object} obj - Object to decrypt
 * @param {string[]} fields - Array of field names to decrypt
 * @returns {object} - Object with specified fields decrypted
 */
function decryptObject(obj, fields) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const decrypted = { ...obj };
  
  fields.forEach(field => {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      decrypted[field] = decrypt(decrypted[field]);
    }
  });

  return decrypted;
}

/**
 * Check if encryption is enabled
 * @returns {boolean} - True if encryption key is configured
 */
function isEncryptionEnabled() {
  return !!process.env.ENCRYPTION_KEY;
}

module.exports = {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  isEncryptionEnabled,
  ALGORITHM,
};

