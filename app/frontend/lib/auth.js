const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const fs = require('fs-extra');
const path = require('path');
const { encrypt, decrypt, encryptObject, decryptObject } = require('./encryption');

// Use persistent disk path if available (for Render), otherwise use local lib/data
// Render persistent disk should be mounted at /data or set via DATA_DIR env var
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'lib', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Ensure users file exists
if (!fs.existsSync(DATA_DIR)) {
  fs.ensureDirSync(DATA_DIR);
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeJsonSync(USERS_FILE, { users: [] });
}

// Helper functions for user storage
function readUsers() {
  try {
    const data = fs.readJsonSync(USERS_FILE);
    // Decrypt sensitive fields when reading
    if (data.users && Array.isArray(data.users)) {
      data.users = data.users.map(user => 
        decryptObject(user, ['mfaSecret'])
      );
    }
    return data;
  } catch (error) {
    return { users: [] };
  }
}

function saveUsers(data) {
  // Encrypt sensitive fields before saving
  const dataToSave = {
    ...data,
    users: data.users ? data.users.map(user => 
      encryptObject(user, ['mfaSecret'])
    ) : []
  };
  
  try {
    fs.writeJsonSync(USERS_FILE, dataToSave, { spaces: 2 });
    console.log(`✅ Successfully saved ${data.users?.length || 0} users to ${USERS_FILE}`);
  } catch (error) {
    console.error('❌ Error saving users file:', error);
    console.error('File path:', USERS_FILE);
    console.error('Data dir exists:', fs.existsSync(DATA_DIR));
    console.error('Error details:', error.message, error.code);
    
    // Try to create directory if it doesn't exist
    try {
      fs.ensureDirSync(DATA_DIR);
      fs.writeJsonSync(USERS_FILE, dataToSave, { spaces: 2 });
      console.log('✅ Retry successful after creating directory');
    } catch (retryError) {
      console.error('❌ Retry also failed:', retryError);
      console.error('This may indicate the file system is read-only (common on serverless platforms)');
      // Don't throw - allow the app to continue, but log the issue
      // In production, you should use a database instead of file storage
    }
  }
}

function findUserByUsername(username) {
  const data = readUsers();
  return data.users.find(user => user.username === username);
}

function findUserById(userId) {
  const data = readUsers();
  return data.users.find(user => user.id === userId);
}

// User registration
async function registerUser(username, password) {
  console.log(`📝 Attempting to register user: ${username}`);
  const data = readUsers();
  console.log(`📊 Current users in file: ${data.users?.length || 0}`);
  
  // Check if user already exists
  if (findUserByUsername(username)) {
    throw new Error('Username already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    username,
    password: hashedPassword,
    mfaEnabled: false,
    mfaSecret: null,
    createdAt: new Date().toISOString(),
    lastLogin: null,
  };

  data.users.push(user);
  console.log(`💾 Attempting to save user to file...`);
  saveUsers(data);
  console.log(`✅ User registered successfully: ${username}`);

  // Return user without sensitive data
  const { password: _, mfaSecret: __, ...userWithoutSecrets } = user;
  return userWithoutSecrets;
}

// User login
async function loginUser(username, password) {
  console.log(`🔐 Attempting login for user: ${username}`);
  const data = readUsers();
  console.log(`📊 Total users in file: ${data.users?.length || 0}`);
  console.log(`📁 Users file path: ${USERS_FILE}`);
  console.log(`📁 File exists: ${fs.existsSync(USERS_FILE)}`);
  
  const user = findUserByUsername(username);
  
  if (!user) {
    console.log(`❌ User not found: ${username}`);
    console.log(`📋 Available usernames: ${data.users?.map(u => u.username).join(', ') || 'none'}`);
    throw new Error('Invalid credentials');
  }

  console.log(`✅ User found: ${user.username}`);
  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    console.log(`❌ Invalid password for user: ${username}`);
    throw new Error('Invalid credentials');
  }
  
  console.log(`✅ Password verified for user: ${username}`);

  // Update last login (reuse existing data variable)
  const userIndex = data.users.findIndex(u => u.id === user.id);
  if (userIndex >= 0) {
    data.users[userIndex].lastLogin = new Date().toISOString();
    saveUsers(data);
  }

  // Return user without sensitive data
  const { password: _, mfaSecret: __, ...userWithoutSecrets } = user;
  return userWithoutSecrets;
}

// Generate MFA secret
function generateMFASecret(username) {
  const secret = speakeasy.generateSecret({
    name: `${username}`,
    issuer: 'Bank Connect',
  });

  return {
    secret: secret.base32,
    qrCodeUrl: secret.otpauth_url,
  };
}

// Save MFA secret to user (encrypted)
function saveMFASecret(userId, secret) {
  const data = readUsers();
  const userIndex = data.users.findIndex(u => u.id === userId);
  
  if (userIndex >= 0) {
    // Encrypt MFA secret before storing
    data.users[userIndex].mfaSecret = encrypt(secret);
    data.users[userIndex].mfaEnabled = false; // Not enabled until verified
    saveUsers(data);
    return true;
  }
  
  return false;
}

// Verify MFA token
function verifyMFAToken(userId, token) {
  const user = findUserById(userId);
  
  if (!user || !user.mfaSecret) {
    return false;
  }

  // Decrypt MFA secret before verification
  const decryptedSecret = decrypt(user.mfaSecret);

  const verified = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: 'base32',
    token: token,
    window: 2, // Allow 2 time steps (60 seconds) of tolerance
  });

  return verified;
}

// Enable MFA for user (after verification)
function enableMFA(userId) {
  const data = readUsers();
  const userIndex = data.users.findIndex(u => u.id === userId);
  
  if (userIndex >= 0) {
    data.users[userIndex].mfaEnabled = true;
    saveUsers(data);
    return true;
  }
  
  return false;
}

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      mfaVerified: false, // Will be set to true after MFA verification
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Generate MFA-verified JWT token
function generateMFAToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      mfaVerified: true,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Generate QR code data URL for MFA setup
async function generateQRCode(otpauthUrl) {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return qrCodeDataUrl;
  } catch (error) {
    throw new Error('Failed to generate QR code');
  }
}

module.exports = {
  registerUser,
  loginUser,
  generateMFASecret,
  saveMFASecret,
  verifyMFAToken,
  enableMFA,
  generateToken,
  generateMFAToken,
  verifyToken,
  findUserById,
  findUserByUsername,
  generateQRCode,
};
