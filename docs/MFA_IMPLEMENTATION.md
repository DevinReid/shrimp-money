# Multi-Factor Authentication (MFA) Implementation

This document describes the MFA implementation for Plaid Connect, which satisfies Plaid's security attestation requirements.

## Overview

The application now includes a complete Multi-Factor Authentication (MFA) system using Time-based One-Time Password (TOTP) technology. This implementation ensures that all users must authenticate with both a password and a second factor (authenticator app) before accessing Plaid-related features.

## Features

### ✅ Implemented Features

1. **User Registration & Login**
   - Secure password-based authentication
   - Password hashing using bcrypt
   - JWT token-based session management

2. **MFA Setup**
   - QR code generation for authenticator apps
   - Manual secret key entry option
   - Support for Google Authenticator, Authy, Microsoft Authenticator, etc.

3. **MFA Verification**
   - TOTP-based verification (6-digit codes)
   - Required for all Plaid API access
   - Time-window tolerance for clock drift

4. **Protected Routes**
   - All Plaid endpoints require MFA-verified authentication
   - Frontend route protection
   - Automatic redirect to login/MFA setup

5. **Security Features**
   - Rate limiting on authentication endpoints
   - Secure password storage (bcrypt hashing)
   - JWT token expiration
   - MFA verification required for sensitive operations

## Architecture

### Backend Components

#### Authentication Module (`app/server/auth.js`)
- User registration and login
- Password hashing and verification
- MFA secret generation and verification
- JWT token generation and validation
- User storage management

#### Auth Middleware (`app/server/middleware/auth.js`)
- `authenticate`: Verifies JWT token
- `requireMFA`: Ensures MFA-verified token for sensitive operations

#### Auth Routes (`app/server/routes/auth.js`)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/mfa/setup` - Generate MFA secret and QR code
- `POST /api/auth/mfa/verify` - Verify and enable MFA (first time)
- `POST /api/auth/mfa/login` - Verify MFA code during login

### Frontend Components

#### Auth Context (`app/frontend/src/auth/AuthContext.js`)
- Global authentication state management
- Login, register, and MFA verification functions
- Token management and persistence

#### Auth Components
- `Login.js` - User login form
- `Register.js` - User registration form
- `MFASetup.js` - MFA setup with QR code
- `MFAVerify.js` - MFA code verification
- `ProtectedRoute.js` - Route protection wrapper

## User Flow

### First-Time User (Registration)

1. User visits the application
2. Redirected to registration page
3. Creates account with username and password
4. Automatically redirected to MFA setup
5. Scans QR code with authenticator app
6. Enters 6-digit code to verify and enable MFA
7. Gains access to Plaid features

### Returning User (Login)

1. User visits the application
2. Redirected to login page
3. Enters username and password
4. If MFA is enabled:
   - Redirected to MFA verification page
   - Enters 6-digit code from authenticator app
   - Gains access to Plaid features
5. If MFA is not enabled:
   - Prompted to set up MFA
   - Follows MFA setup flow

## Security Considerations

### Password Security
- Passwords are hashed using bcrypt with 10 rounds
- Minimum 8 characters required
- Never stored in plain text

### MFA Security
- TOTP secrets are stored securely (encrypted in production recommended)
- 6-digit codes with 30-second time windows
- 2-time-step tolerance (60 seconds) for clock drift
- MFA must be verified before accessing any Plaid endpoints

### Token Security
- JWT tokens with expiration (default: 7 days)
- Tokens include MFA verification status
- Tokens stored in localStorage (consider httpOnly cookies for production)

### Rate Limiting
- Authentication endpoints limited to 5 attempts per 15 minutes
- Prevents brute force attacks

## API Endpoints

### Public Endpoints
- `GET /api/health` - Health check
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### Protected Endpoints (Require Authentication)
- `GET /api/auth/me` - Get current user
- `POST /api/auth/mfa/setup` - Set up MFA
- `POST /api/auth/mfa/verify` - Verify MFA (first time)
- `POST /api/auth/mfa/login` - Verify MFA (login)

### MFA-Required Endpoints (Require MFA Verification)
- `POST /api/create_link_token` - Create Plaid Link token
- `POST /api/exchange_public_token` - Exchange public token
- `GET /api/accounts` - Get account balances
- `GET /api/transactions` - Get transactions
- `GET /api/items` - Get stored items

## Configuration

### Environment Variables

Add to `app/.env`:

```env
# Authentication & Security
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
```

**Important:** Generate a strong random JWT_SECRET for production:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Testing MFA

### Test User Flow

1. **Register a new user:**
   ```bash
   curl -X POST http://localhost:8000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"testpass123"}'
   ```

2. **Set up MFA:**
   ```bash
   curl -X POST http://localhost:8000/api/auth/mfa/setup \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```
   - Save the QR code or secret
   - Use an authenticator app to scan/enter

3. **Verify MFA:**
   ```bash
   curl -X POST http://localhost:8000/api/auth/mfa/verify \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"token":"123456"}'
   ```

4. **Login with MFA:**
   ```bash
   # Step 1: Login
   curl -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"testpass123"}'
   
   # Step 2: Verify MFA
   curl -X POST http://localhost:8000/api/auth/mfa/login \
     -H "Authorization: Bearer TOKEN_FROM_STEP_1" \
     -H "Content-Type: application/json" \
     -d '{"token":"123456"}'
   ```

## Authenticator Apps

Users can use any TOTP-compatible authenticator app:

- **Google Authenticator** (iOS/Android)
- **Microsoft Authenticator** (iOS/Android)
- **Authy** (iOS/Android/Desktop)
- **1Password** (iOS/Android/Desktop)
- **LastPass Authenticator** (iOS/Android)
- Any other TOTP-compatible app

## Production Recommendations

### Security Enhancements

1. **Encrypt MFA Secrets**
   - Store MFA secrets encrypted in database
   - Use environment-specific encryption keys

2. **Use httpOnly Cookies**
   - Store JWT tokens in httpOnly cookies instead of localStorage
   - Prevents XSS attacks

3. **Implement Session Management**
   - Track active sessions
   - Allow users to revoke sessions
   - Implement session timeout

4. **Add Audit Logging**
   - Log all authentication attempts
   - Log MFA setup and verification events
   - Monitor for suspicious activity

5. **Database Storage**
   - Move from JSON files to proper database
   - Use PostgreSQL or MongoDB
   - Implement proper indexing

6. **Additional Security**
   - Implement account lockout after failed attempts
   - Add email verification for registration
   - Consider SMS backup codes
   - Implement password reset flow

## Compliance

This MFA implementation satisfies Plaid's security attestation requirements for:

✅ **Identity and Access Management**
- Multi-factor authentication (MFA) implemented
- TOTP-based second factor
- Required for all Plaid Link access
- Secure password storage
- Session management with JWT tokens

## Troubleshooting

### MFA Code Not Working

**Issue:** User enters correct code but verification fails

**Solutions:**
1. Check system clock synchronization
2. Ensure code is entered within 60-second window
3. Verify authenticator app is using correct secret
4. Try manual secret entry instead of QR code

### QR Code Not Scanning

**Issue:** QR code cannot be scanned by authenticator app

**Solutions:**
1. Use manual secret entry option
2. Ensure QR code is fully visible
3. Try different authenticator app
4. Check QR code image is loading correctly

### Token Expired

**Issue:** User gets "Invalid or expired token" error

**Solutions:**
1. User needs to log in again
2. Check JWT_EXPIRES_IN setting
3. Token may have been cleared from localStorage

## Related Documentation

- [Environment Variables](./ENVIRONMENT.md) - Configuration details
- [API Documentation](./API.md) - API endpoint reference
- [Security Best Practices](./DEPLOYMENT.md#security) - Production security

## Support

For issues or questions about MFA implementation:
1. Check this documentation
2. Review [Troubleshooting Guide](./TROUBLESHOOTING.md)
3. Check server logs for error details

