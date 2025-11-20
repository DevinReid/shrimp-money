const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  registerUser,
  loginUser,
  generateMFASecret,
  saveMFASecret,
  verifyMFAToken,
  enableMFA,
  generateToken,
  generateMFAToken,
  findUserById,
  generateQRCode,
} = require('../auth');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Register new user
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await registerUser(username, password);
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      user,
      token,
      message: 'User registered successfully. Please set up MFA.',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await loginUser(username, password);
    const token = generateToken(user);

    res.json({
      success: true,
      user,
      token,
      mfaRequired: user.mfaEnabled,
      message: user.mfaEnabled 
        ? 'Please verify MFA code' 
        : 'Login successful. Please set up MFA for enhanced security.',
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: error.message });
  }
});

// Get current user info
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = findUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password, mfaSecret, ...userWithoutSecrets } = user;
    res.json({
      success: true,
      user: userWithoutSecrets,
      mfaVerified: req.user.mfaVerified || false,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
});

// Generate MFA secret and QR code
router.post('/mfa/setup', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = findUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.mfaEnabled) {
      return res.status(400).json({ error: 'MFA is already enabled for this user' });
    }

    const { secret, qrCodeUrl } = generateMFASecret(user.username);
    saveMFASecret(userId, secret);

    // Generate QR code image
    const qrCodeDataUrl = await generateQRCode(qrCodeUrl);

    res.json({
      success: true,
      secret, // For manual entry if QR code fails
      qrCode: qrCodeDataUrl,
      message: 'Scan the QR code with your authenticator app, then verify with a code.',
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json({ error: 'Failed to set up MFA' });
  }
});

// Verify MFA token and enable MFA
router.post('/mfa/verify', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.userId;

    if (!token) {
      return res.status(400).json({ error: 'MFA token is required' });
    }

    const isValid = verifyMFAToken(userId, token);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid MFA token' });
    }

    // Enable MFA for user
    enableMFA(userId);

    // Generate new token with MFA verified flag
    const user = findUserById(userId);
    const { password, mfaSecret, ...userWithoutSecrets } = user;
    const mfaToken = generateMFAToken(userWithoutSecrets);

    res.json({
      success: true,
      user: userWithoutSecrets,
      token: mfaToken,
      message: 'MFA verified and enabled successfully',
    });
  } catch (error) {
    console.error('MFA verification error:', error);
    res.status(500).json({ error: 'Failed to verify MFA token' });
  }
});

// Verify MFA token for login (when MFA is already enabled)
router.post('/mfa/login', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.userId;

    if (!token) {
      return res.status(400).json({ error: 'MFA token is required' });
    }

    const isValid = verifyMFAToken(userId, token);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid MFA token' });
    }

    // Generate new token with MFA verified flag
    const user = findUserById(userId);
    const { password, mfaSecret, ...userWithoutSecrets } = user;
    const mfaToken = generateMFAToken(userWithoutSecrets);

    res.json({
      success: true,
      user: userWithoutSecrets,
      token: mfaToken,
      message: 'MFA verified successfully',
    });
  } catch (error) {
    console.error('MFA login verification error:', error);
    res.status(500).json({ error: 'Failed to verify MFA token' });
  }
});

module.exports = router;

