# Access Control Policy

## Overview

This document defines the access control policy for Plaid Connect, ensuring consistent and secure management of access to system resources. This policy implements the principles of least privilege, role-based access controls, and establishes procedures for granting, modifying, and revoking access.

**Last Updated:** November 20, 2025  
**Review Schedule:** Annually or when security requirements change

---

## 1. Principles

### 1.1 Principle of Least Privilege

All users and systems are granted only the minimum level of access necessary to perform their authorized functions. Access is restricted to:

- **What is needed**: Users can only access their own data and resources
- **When it is needed**: Access is time-limited through JWT token expiration
- **How it is needed**: Access requires appropriate authentication and authorization

### 1.2 Defense in Depth

Multiple layers of security controls are implemented:

1. **Authentication**: Username and password
2. **Multi-Factor Authentication (MFA)**: Required for sensitive operations
3. **Authorization**: Token-based access control with MFA verification status
4. **Session Management**: JWT tokens with expiration
5. **Rate Limiting**: Protection against brute-force attacks

### 1.3 Separation of Duties

- **User Accounts**: Users can only manage their own accounts and data
- **Data Access**: Users can only access data associated with their authenticated account
- **Administrative Functions**: Currently single-user system; administrative access is limited to the account owner

---

## 2. Access Control Levels

### 2.1 Public Access (No Authentication Required)

**Endpoints:**
- `GET /api/health` - Health check
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

**Characteristics:**
- No authentication required
- Rate limited to prevent abuse
- Minimal data exposure

---

### 2.2 Authenticated Access (JWT Token Required)

**Endpoints:**
- `GET /api/auth/me` - Get current user information
- `POST /api/auth/mfa/setup` - Set up MFA
- `POST /api/auth/mfa/verify` - Verify MFA setup
- `POST /api/auth/mfa/login` - Verify MFA during login
- `DELETE /api/data/user/[userId]` - Delete user account (self only)
- `POST /api/data/cleanup` - Run data cleanup
- `GET /api/data/log` - View deletion audit log

**Requirements:**
- Valid JWT token in `Authorization: Bearer <token>` header
- Token must not be expired
- Users can only access their own resources (enforced by user ID matching)

**Access Control:**
- Users can only delete their own accounts
- Users can only view their own data
- Self-service operations only

---

### 2.3 MFA-Protected Access (JWT Token + MFA Verification Required)

**Endpoints:**
- `POST /api/plaid/create_link_token` - Create Plaid Link token
- `POST /api/plaid/exchange_public_token` - Exchange public token
- `GET /api/plaid/accounts` - Get account balances
- `GET /api/plaid/transactions` - Get transaction history
- `DELETE /api/data/item/[itemId]` - Delete Plaid item

**Requirements:**
- Valid JWT token
- Token must have `mfaVerified: true` flag
- MFA must be enabled and verified for the user account

**Rationale:**
- These endpoints access sensitive financial data
- MFA provides an additional layer of security
- Prevents unauthorized access even if password is compromised

---

## 3. Role-Based Access Control (RBAC)

### 3.1 Current Roles

Since this is a private, single-user application, the system implements a simplified role model:

#### **User Role**
- **Description**: Standard authenticated user
- **Capabilities**:
  - Register and manage own account
  - Set up and use MFA
  - Access own financial data (with MFA)
  - Delete own account and data
  - View own audit logs

#### **Future: Administrator Role** (For Multi-User Expansion)
- **Description**: System administrator
- **Capabilities**: (To be defined when multi-user support is added)
  - All user capabilities
  - Manage other user accounts
  - System configuration
  - Access system-wide audit logs

---

## 4. Authentication Mechanisms

### 4.1 Primary Authentication

**Method**: Username and Password
- Passwords are hashed using bcrypt (10 rounds)
- Minimum password length: 8 characters
- Passwords are never stored in plain text
- Passwords are never transmitted in API responses

### 4.2 Multi-Factor Authentication (MFA)

**Method**: Time-based One-Time Password (TOTP)
- Supported authenticator apps:
  - Microsoft Authenticator
  - Google Authenticator
  - Authy
  - Any TOTP-compatible app
- MFA is **required** for accessing financial data
- MFA verification status is tracked in JWT tokens
- MFA secrets are stored securely (encrypted in production)

### 4.3 Session Management

**Method**: JSON Web Tokens (JWT)
- Token expiration: 7 days (configurable via `JWT_EXPIRES_IN`)
- Tokens include:
  - User ID
  - Username
  - MFA verification status
  - Expiration timestamp
- Tokens are stored client-side in localStorage
- Tokens are validated on every authenticated request

---

## 5. Authorization Mechanisms

### 5.1 Token-Based Authorization

All authenticated requests require a valid JWT token:
```
Authorization: Bearer <jwt_token>
```

### 5.2 MFA Verification Check

Sensitive endpoints verify MFA status:
```javascript
if (!decoded.mfaVerified) {
  return { error: 'MFA verification required', status: 403 };
}
```

### 5.3 Resource Ownership Verification

Users can only access their own resources:
```javascript
if (userId !== authenticatedUserId) {
  return { error: 'Unauthorized', status: 403 };
}
```

---

## 6. Access Granting Procedures

### 6.1 User Registration

1. **Request**: User submits registration form with username and password
2. **Validation**: 
   - Username uniqueness check
   - Password strength validation (minimum 8 characters)
3. **Account Creation**:
   - Password is hashed using bcrypt
   - User account is created with `mfaEnabled: false`
   - JWT token is generated and returned
4. **MFA Setup**: User is redirected to MFA setup (required before accessing financial data)

### 6.2 MFA Enrollment

1. **Request**: Authenticated user requests MFA setup
2. **Generation**: System generates TOTP secret and QR code
3. **Verification**: User scans QR code and verifies with 6-digit code
4. **Activation**: MFA is enabled for the user account
5. **Token Update**: New JWT token is issued with `mfaVerified: true`

### 6.3 Access Token Issuance

1. **Login**: User authenticates with username and password
2. **Token Generation**: JWT token is generated with user information
3. **MFA Check**: If MFA is enabled, user must verify MFA code
4. **Token Issuance**: Token is issued with appropriate `mfaVerified` status
5. **Storage**: Token is stored client-side for subsequent requests

---

## 7. Access Modification Procedures

### 7.1 Password Changes

**Current Status**: Not yet implemented  
**Planned Procedure**:
1. User must be authenticated
2. User provides current password
3. System verifies current password
4. New password is validated and hashed
5. Password is updated in user account
6. All existing sessions are invalidated (optional)

### 7.2 MFA Re-enrollment

**Procedure**:
1. User must be authenticated
2. User requests MFA reset
3. New MFA secret is generated
4. User verifies new MFA setup
5. Old MFA secret is invalidated
6. New JWT token is issued

### 7.3 Token Refresh

**Procedure**:
1. Client detects token expiration
2. User is prompted to re-authenticate
3. New token is issued after successful authentication
4. MFA verification is required if accessing sensitive endpoints

---

## 8. Access Revocation Procedures

**Related Policy**: [Access De-Provisioning and Modification Policy](./ACCESS_DEPROVISIONING_POLICY.md) - Detailed automated de-provisioning procedures

### 8.1 User-Initiated Account Deletion

**Procedure**:
1. User must be authenticated
2. User requests account deletion
3. System verifies user identity (user can only delete own account)
4. All associated data is deleted:
   - User account
   - Plaid items and access tokens
   - Account balance data
   - Transaction history
5. Deletion is logged in audit log
6. User is logged out and session is invalidated

### 8.2 Item Disconnection

**Procedure**:
1. User must be authenticated and MFA-verified
2. User requests item disconnection
3. System verifies ownership
4. Item and associated data are deleted:
   - Plaid access token
   - Account balance data
   - Transaction history
5. Deletion is logged in audit log

### 8.3 Session Invalidation

**Automatic**:
- Token expiration (7 days)
- User logout
- Account deletion

**Manual** (Future Implementation):
- User can revoke specific sessions
- Administrator can revoke user sessions

---

## 9. Access Control Implementation

### 9.1 Middleware Functions

#### `authenticate(req)`
- Verifies JWT token
- Returns user information if valid
- Returns error if token is missing, invalid, or expired

#### `requireMFA(req)`
- Verifies JWT token
- Checks `mfaVerified` flag
- Returns error if MFA is not verified
- Required for sensitive financial data endpoints

### 9.2 Frontend Route Protection

#### `ProtectedRoute` Component
- Wraps protected application routes
- Checks authentication status
- Redirects to login if not authenticated
- Enforces MFA setup and verification
- Only renders protected content when fully authenticated

### 9.3 API Route Protection

All protected API routes use middleware:
```javascript
export async function GET(req) {
  const authResult = requireMFA(req);
  
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }
  
  // Protected logic here
}
```

---

## 10. Access Control Matrix

| Resource | Public | Authenticated | MFA-Required |
|----------|--------|---------------|--------------|
| Health Check | ✅ | - | - |
| User Registration | ✅ | - | - |
| User Login | ✅ | - | - |
| User Profile | - | ✅ | - |
| MFA Setup | - | ✅ | - |
| MFA Verification | - | ✅ | - |
| Account Deletion | - | ✅ (self only) | - |
| Plaid Link Token | - | - | ✅ |
| Account Balances | - | - | ✅ |
| Transaction History | - | - | ✅ |
| Item Disconnection | - | - | ✅ |
| Data Cleanup | - | ✅ | - |
| Audit Logs | - | ✅ | - |

---

## 11. Security Controls

### 11.1 Rate Limiting

- **Registration**: Limited to prevent account creation abuse
- **Login**: Limited to prevent brute-force attacks
- **MFA Verification**: Limited to prevent enumeration attacks

### 11.2 Password Security

- Passwords are hashed using bcrypt (10 rounds)
- Passwords are never logged or exposed
- Minimum password length enforced
- Password strength validation (future enhancement)

### 11.3 Token Security

- Tokens are signed with secret key
- Tokens include expiration timestamps
- Tokens are validated on every request
- Invalid tokens are rejected immediately

### 11.4 Data Access Security

- Users can only access their own data
- Resource ownership is verified on every request
- MFA is required for sensitive operations
- All access attempts are logged

---

## 12. Audit and Monitoring

### 12.1 Access Logging

**Logged Events**:
- User registration
- User login
- MFA setup and verification
- Account deletion
- Item disconnection
- Data deletion operations

**Log Location**: `app/frontend/lib/data/deletion_log.json`

### 12.2 Security Monitoring

**Monitored Events**:
- Failed authentication attempts
- Rate limit violations
- Invalid token attempts
- Unauthorized access attempts

**Future Enhancements**:
- Real-time alerting for suspicious activity
- Automated threat detection
- Security incident response procedures

---

## 13. Compliance

This access control policy ensures compliance with:

- **Plaid Security Requirements**
  - Multi-factor authentication
  - Secure access controls
  - Defined access procedures

- **Industry Standards**
  - NIST Cybersecurity Framework
  - OWASP Top 10
  - ISO 27001 principles

- **Privacy Regulations**
  - GDPR (access control and data protection)
  - CCPA (access rights and data security)

---

## 14. Policy Review and Updates

### 14.1 Review Schedule

- **Annual Review**: Policy is reviewed annually
- **Change-Driven Review**: Policy is reviewed when:
  - New security requirements are identified
  - System architecture changes
  - New access control features are added
  - Security incidents occur
  - Compliance requirements change

### 14.2 Update Procedure

1. Identify need for policy update
2. Document proposed changes
3. Review security implications
4. Update policy document
5. Update implementation code
6. Test access control changes
7. Deploy and monitor

### 14.3 Version History

- **v1.0** (November 20, 2025): Initial policy document

---

## 15. Responsibilities

### 15.1 System Owner

- Maintain access control policy
- Review and approve access requests
- Monitor access control compliance
- Update policy as needed

### 15.2 Users

- Follow access control procedures
- Protect authentication credentials
- Report security incidents
- Comply with access control requirements

---

## 16. Incident Response

### 16.1 Unauthorized Access

**Procedure**:
1. Immediately revoke affected user sessions
2. Investigate access attempt
3. Review audit logs
4. Determine scope of access
5. Notify affected users (if applicable)
6. Implement additional security measures if needed

### 16.2 Compromised Credentials

**Procedure**:
1. Immediately invalidate user sessions
2. Require password reset
3. Require MFA re-verification
4. Review account activity
5. Implement additional monitoring

---

## Appendix A: Implementation Files

- **Authentication Middleware**: `app/frontend/lib/middleware/auth.js`
- **Auth Utilities**: `app/frontend/lib/auth.js`
- **Protected Route Component**: `app/frontend/components/auth/ProtectedRoute.js`
- **API Routes**: `app/frontend/app/api/**/route.js`

---

## Appendix B: Access Control Checklist

- [x] Authentication implemented (username/password)
- [x] Multi-factor authentication implemented
- [x] JWT token-based authorization
- [x] MFA-required endpoints protected
- [x] Resource ownership verification
- [x] Rate limiting implemented
- [x] Session management implemented
- [x] Access logging implemented
- [x] User self-service account deletion
- [x] Policy documentation complete

---

**Policy Owner**: Devin Reid  
**Effective Date**: November 20, 2025  
**Next Review Date**: November 20, 2026

