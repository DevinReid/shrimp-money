const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const fs = require('fs-extra');
const path = require('path');
const { encrypt, decrypt, encryptObject, decryptObject } = require('./encryption');

// Try to import Prisma - will be undefined if DATABASE_URL is not set
let prisma = null;
try {
  if (process.env.DATABASE_URL) {
    prisma = require('./prisma');
    console.log('✅ Database connection enabled (Prisma)');
  }
} catch (error) {
  console.warn('⚠️ Prisma not available, falling back to file storage:', error.message);
}
const USE_DB = !!prisma;

// Use persistent disk path if available (for Render), otherwise use local lib/data
// Render persistent disk should be mounted at /data or set via DATA_DIR env var
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'lib', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ADMIN_MFA_FILE = path.join(DATA_DIR, 'admin_mfa.json'); // Separate file for admin MFA
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Ensure users file exists
if (!fs.existsSync(DATA_DIR)) {
  fs.ensureDirSync(DATA_DIR);
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeJsonSync(USERS_FILE, { users: [] });
}
// Ensure admin MFA file exists
if (!fs.existsSync(ADMIN_MFA_FILE)) {
  fs.writeJsonSync(ADMIN_MFA_FILE, { mfaSecret: null, mfaEnabled: false });
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

async function findUserByUsername(username) {
  // First check hardcoded user from environment variables (for single-user deployments)
  const hardcodedUsername = process.env.ADMIN_USERNAME?.trim();
  const hardcodedPasswordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  
  console.log(`🔍 Checking hardcoded user - Username set: ${!!hardcodedUsername}, Password hash set: ${!!hardcodedPasswordHash}`);
  if (hardcodedPasswordHash) {
    console.log(`🔑 Password hash preview: ${hardcodedPasswordHash.substring(0, 20)}...`);
    console.log(`🔑 Password hash length: ${hardcodedPasswordHash.length}`);
    console.log(`🔑 Password hash ends with: ...${hardcodedPasswordHash.substring(hardcodedPasswordHash.length - 10)}`);
  }
  
  if (hardcodedUsername && hardcodedUsername === username) {
    if (!hardcodedPasswordHash) {
      console.error('❌ ADMIN_USERNAME is set but ADMIN_PASSWORD_HASH is missing!');
      return null; // Don't return user without password hash
    }
    
    // For admin user, check database for MFA info if available
    let mfaSecret = null;
    let mfaEnabled = false;
    let hasDatabaseRecord = false;
    
    if (USE_DB) {
      try {
        const adminMFA = await prisma.plaidAdminMFA.findFirst();
        if (adminMFA) {
          mfaSecret = adminMFA.mfaSecret;
          mfaEnabled = adminMFA.mfaEnabled;
          hasDatabaseRecord = true;
          console.log(`🔐 Admin MFA from database: enabled=${mfaEnabled}, hasSecret=${!!mfaSecret}`);
        } else {
          console.log('🔐 No admin MFA record in database');
        }
      } catch (error) {
        console.warn('⚠️ Error reading admin MFA from DB, falling back to env vars:', error.message);
      }
    }
    
    // Only fallback to env vars if database is not available or has no record
    // Database always takes priority when available
    if (!hasDatabaseRecord && process.env.ADMIN_MFA_SECRET) {
      mfaSecret = process.env.ADMIN_MFA_SECRET;
      mfaEnabled = process.env.ADMIN_MFA_ENABLED === 'true';
      console.log(`🔐 Admin MFA from environment: enabled=${mfaEnabled}`);
    }
    
    return {
      id: 'admin',
      username: hardcodedUsername,
      password: hardcodedPasswordHash, // Already trimmed above
      mfaEnabled,
      mfaSecret,
      createdAt: new Date().toISOString(),
      lastLogin: null,
    };
  }
  
  // Check database first if available
  if (USE_DB) {
    try {
      const dbUser = await prisma.plaidUser.findUnique({
        where: { username },
      });
      if (dbUser) {
        return {
          ...dbUser,
          mfaSecret: dbUser.mfaSecret ? decrypt(dbUser.mfaSecret) : null,
        };
      }
    } catch (error) {
      console.warn('⚠️ Error reading from DB, falling back to file storage:', error.message);
    }
  }
  
  // Fallback to file-based users
  const data = readUsers();
  return data.users.find(user => user.username === username);
}

async function findUserById(userId) {
  // Check hardcoded admin user
  if (userId === 'admin' && process.env.ADMIN_USERNAME) {
    let mfaEnabled = false;
    let mfaSecret = null;
    
    // First check database if available (database takes priority)
    let hasDatabaseRecord = false;
    if (USE_DB) {
      try {
        const adminMFA = await prisma.plaidAdminMFA.findFirst();
        if (adminMFA) {
          mfaSecret = adminMFA.mfaSecret;
          mfaEnabled = adminMFA.mfaEnabled;
          hasDatabaseRecord = true;
          console.log(`🔐 Admin MFA from database: enabled=${mfaEnabled}, hasSecret=${!!mfaSecret}`);
        } else {
          console.log('🔐 No admin MFA record in database - MFA not set up');
        }
      } catch (error) {
        console.warn('⚠️ Error reading admin MFA from DB:', error.message);
      }
    }
    
    // Only fallback to environment variable or file if database is not available or has no record
    // Database always takes priority when available
    if (!hasDatabaseRecord) {
      // Only check env vars if we don't have a database record
      if (process.env.ADMIN_MFA_SECRET) {
        mfaSecret = process.env.ADMIN_MFA_SECRET;
        mfaEnabled = process.env.ADMIN_MFA_ENABLED === 'true';
        console.log(`🔐 Admin MFA from environment: enabled=${mfaEnabled}`);
      }
      // Fallback to file (for current session)
      else if (!mfaSecret) {
        try {
          if (fs.existsSync(ADMIN_MFA_FILE)) {
            const adminMfaData = fs.readJsonSync(ADMIN_MFA_FILE);
            mfaEnabled = adminMfaData.mfaEnabled || false;
            mfaSecret = adminMfaData.mfaSecret || null;
            console.log(`🔐 Admin MFA from file: enabled=${mfaEnabled}`);
          }
        } catch (error) {
          console.error('Error reading admin MFA file:', error);
        }
      }
    }
    
    return {
      id: 'admin',
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD_HASH,
      mfaEnabled,
      mfaSecret,
      createdAt: new Date().toISOString(),
      lastLogin: null,
    };
  }
  
  // Check database first if available
  if (USE_DB) {
    try {
      const dbUser = await prisma.plaidUser.findUnique({
        where: { id: userId },
      });
      if (dbUser) {
        return {
          ...dbUser,
          mfaSecret: dbUser.mfaSecret ? decrypt(dbUser.mfaSecret) : null,
        };
      }
    } catch (error) {
      console.warn('⚠️ Error reading from DB, falling back to file storage:', error.message);
    }
  }
  
  // Fallback to file-based users
  const data = readUsers();
  return data.users.find(user => user.id === userId);
}

// User registration
async function registerUser(username, password) {
  console.log(`📝 Attempting to register user: ${username}`);
  
  // Check if user already exists
  const existingUser = await findUserByUsername(username);
  if (existingUser) {
    throw new Error('Username already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user in database if available
  if (USE_DB) {
    try {
      const dbUser = await prisma.plaidUser.create({
        data: {
          username,
          password: hashedPassword,
          mfaEnabled: false,
          mfaSecret: null,
        },
      });
      console.log(`✅ User registered successfully in database: ${username}`);
      const { password: _, mfaSecret: __, ...userWithoutSecrets } = dbUser;
      return userWithoutSecrets;
    } catch (error) {
      console.warn('⚠️ Error saving to DB, falling back to file storage:', error.message);
    }
  }

  // Fallback to file storage
  const data = readUsers();
  console.log(`📊 Current users in file: ${data.users?.length || 0}`);
  
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
  
  const user = await findUserByUsername(username);
  
  if (!user) {
    console.log(`❌ User not found: ${username}`);
    throw new Error('Invalid credentials');
  }

  console.log(`✅ User found: ${user.username}`);
  console.log(`🔑 User ID: ${user.id}`);
  console.log(`🔑 Password hash exists: ${!!user.password}`);
  if (user.password) {
    console.log(`🔑 Password hash preview: ${user.password.substring(0, 20)}...`);
    console.log(`🔑 Password hash length: ${user.password.length}`);
    console.log(`🔑 Password hash ends with: ...${user.password.substring(user.password.length - 10)}`);
  }
  
  // Verify password
  if (!user.password) {
    console.error('❌ User has no password hash!');
    throw new Error('Invalid credentials');
  }
  
  // Trim password hash in case of whitespace issues
  const trimmedHash = user.password.trim();
  console.log(`🔑 Comparing password - Hash length: ${trimmedHash.length}, Hash starts with: ${trimmedHash.substring(0, 7)}`);
  
  const isValidPassword = await bcrypt.compare(password, trimmedHash);
  if (!isValidPassword) {
    console.log(`❌ Invalid password for user: ${username}`);
    console.log(`🔑 Password hash format check: ${trimmedHash.startsWith('$2') ? 'Valid bcrypt format' : 'Invalid format'}`);
    console.log(`🔑 Entered password length: ${password.length}`);
    throw new Error('Invalid credentials');
  }
  
  console.log(`✅ Password verified for user: ${username}`);

  // Update last login in database if available
  if (USE_DB && user.id !== 'admin') {
    try {
      await prisma.plaidUser.update({
        where: { id: user.id },
        data: { updatedAt: new Date() },
      });
    } catch (error) {
      console.warn('⚠️ Error updating last login in DB:', error.message);
    }
  } else if (!USE_DB) {
    // Fallback to file storage
    const data = readUsers();
    const userIndex = data.users.findIndex(u => u.id === user.id);
    if (userIndex >= 0) {
      data.users[userIndex].lastLogin = new Date().toISOString();
      saveUsers(data);
    }
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
async function saveMFASecret(userId, secret) {
  console.log(`🔐 Saving MFA secret for user: ${userId}`);
  
  const encryptedSecret = encrypt(secret);
  
  // Handle hardcoded admin user
  if (userId === 'admin' && process.env.ADMIN_USERNAME) {
    // Save to database if available
    if (USE_DB) {
      try {
        // Upsert admin MFA record
        await prisma.plaidAdminMFA.upsert({
          where: { id: 'admin' },
          update: {
            mfaSecret: encryptedSecret,
            mfaEnabled: false,
          },
          create: {
            id: 'admin',
            mfaSecret: encryptedSecret,
            mfaEnabled: false,
          },
        });
        console.log(`✅ MFA secret saved for admin user in database`);
        return true;
      } catch (error) {
        console.warn('⚠️ Error saving admin MFA to DB, falling back to file:', error.message);
      }
    }
    
    // Fallback to file storage
    try {
      const adminMfaData = { 
        mfaSecret: encryptedSecret, 
        mfaEnabled: false 
      };
      fs.writeJsonSync(ADMIN_MFA_FILE, adminMfaData, { spaces: 2 });
      console.log(`✅ MFA secret saved for admin user in file`);
      console.log(`📋 Note: If using database, this will be stored there instead on next save`);
      return true;
    } catch (error) {
      console.error('❌ Error saving admin MFA secret:', error);
      return false;
    }
  }
  
  // Handle regular users - save to database if available
  if (USE_DB) {
    try {
      await prisma.plaidUser.update({
        where: { id: userId },
        data: {
          mfaSecret: encryptedSecret,
          mfaEnabled: false,
        },
      });
      console.log(`✅ MFA secret saved for user in database: ${userId}`);
      return true;
    } catch (error) {
      console.warn('⚠️ Error saving MFA to DB, falling back to file storage:', error.message);
    }
  }
  
  // Fallback to file-based users
  const data = readUsers();
  const userIndex = data.users.findIndex(u => u.id === userId);
  
  if (userIndex >= 0) {
    // Encrypt MFA secret before storing
    data.users[userIndex].mfaSecret = encryptedSecret;
    data.users[userIndex].mfaEnabled = false; // Not enabled until verified
    saveUsers(data);
    console.log(`✅ MFA secret saved for file-based user: ${userId}`);
    return true;
  }
  
  console.error(`❌ User not found for MFA secret save: ${userId}`);
  return false;
}

// Verify MFA token
async function verifyMFAToken(userId, token) {
  console.log(`🔐 Verifying MFA token for user: ${userId}, token length: ${token?.length || 0}`);
  
  // Handle hardcoded admin user
  if (userId === 'admin' && process.env.ADMIN_USERNAME) {
    try {
      let encryptedSecret = null;
      let mfaEnabled = false;
      
      // First check database if available
      if (USE_DB) {
        try {
          const adminMFA = await prisma.plaidAdminMFA.findFirst();
          if (adminMFA && adminMFA.mfaSecret) {
            encryptedSecret = adminMFA.mfaSecret;
            mfaEnabled = adminMFA.mfaEnabled || false;
            console.log('🔐 Using MFA secret from database');
          }
        } catch (error) {
          console.warn('⚠️ Error reading admin MFA from DB:', error.message);
        }
      }
      
      // Fallback to environment variable (persists across deployments)
      if (!encryptedSecret && process.env.ADMIN_MFA_SECRET) {
        encryptedSecret = process.env.ADMIN_MFA_SECRET;
        mfaEnabled = process.env.ADMIN_MFA_ENABLED === 'true';
        console.log('🔐 Using MFA secret from environment variable');
      } 
      // Fallback to file (for current session)
      else if (!encryptedSecret && fs.existsSync(ADMIN_MFA_FILE)) {
        const adminMfaData = fs.readJsonSync(ADMIN_MFA_FILE);
        encryptedSecret = adminMfaData.mfaSecret;
        mfaEnabled = adminMfaData.mfaEnabled || false;
        console.log('🔐 Using MFA secret from file');
      }
      
      if (!encryptedSecret) {
        console.error('❌ Admin user has no MFA secret stored');
        return false;
      }
      
      // Decrypt MFA secret before verification
      const decryptedSecret = decrypt(encryptedSecret);
      console.log(`🔑 Decrypted secret length: ${decryptedSecret.length}`);
      
      const verified = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: 'base32',
        token: token,
        window: 2, // Allow 2 time steps (60 seconds) of tolerance
      });
      
      console.log(`🔐 MFA verification result: ${verified ? '✅ Valid' : '❌ Invalid'}`);
      return verified;
    } catch (error) {
      console.error('❌ Error verifying admin MFA token:', error);
      return false;
    }
  }
  
  // Handle regular users
  const user = await findUserById(userId);
  
  if (!user || !user.mfaSecret) {
    console.error(`❌ User not found or no MFA secret: ${userId}`);
    return false;
  }

  // Decrypt MFA secret before verification
  const decryptedSecret = decrypt(user.mfaSecret);
  console.log(`🔑 Decrypted secret length: ${decryptedSecret.length}`);

  const verified = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: 'base32',
    token: token,
    window: 2, // Allow 2 time steps (60 seconds) of tolerance
  });
  
  console.log(`🔐 MFA verification result: ${verified ? '✅ Valid' : '❌ Invalid'}`);
  return verified;
}

// Enable MFA for user (after verification)
async function enableMFA(userId) {
  console.log(`🔐 Enabling MFA for user: ${userId}`);
  
  // Handle hardcoded admin user
  if (userId === 'admin' && process.env.ADMIN_USERNAME) {
    // Update database if available - use upsert to ensure record exists
    if (USE_DB) {
      try {
        // First, get the existing MFA secret if it exists
        const existingMFA = await prisma.plaidAdminMFA.findFirst();
        await prisma.plaidAdminMFA.upsert({
          where: { id: 'admin' },
          update: {
            mfaEnabled: true,
          },
          create: {
            id: 'admin',
            mfaSecret: existingMFA?.mfaSecret || null,
            mfaEnabled: true,
          },
        });
        console.log(`✅ MFA enabled for admin user in database`);
        return true;
      } catch (error) {
        console.warn('⚠️ Error enabling admin MFA in DB, falling back to file:', error.message);
      }
    }
    
    // Fallback to file storage
    try {
      if (fs.existsSync(ADMIN_MFA_FILE)) {
        const adminMfaData = fs.readJsonSync(ADMIN_MFA_FILE);
        adminMfaData.mfaEnabled = true;
        fs.writeJsonSync(ADMIN_MFA_FILE, adminMfaData, { spaces: 2 });
      }
      console.log(`✅ MFA enabled for admin user`);
      return true;
    } catch (error) {
      console.error('❌ Error enabling admin MFA:', error);
      return false;
    }
  }
  
  // Handle regular users - update database if available
  if (USE_DB) {
    try {
      await prisma.plaidUser.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });
      console.log(`✅ MFA enabled for user in database: ${userId}`);
      return true;
    } catch (error) {
      console.warn('⚠️ Error enabling MFA in DB, falling back to file storage:', error.message);
    }
  }
  
  // Fallback to file-based users
  const data = readUsers();
  const userIndex = data.users.findIndex(u => u.id === userId);
  
  if (userIndex >= 0) {
    data.users[userIndex].mfaEnabled = true;
    saveUsers(data);
    console.log(`✅ MFA enabled for file-based user: ${userId}`);
    return true;
  }
  
  console.error(`❌ User not found for MFA enable: ${userId}`);
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
