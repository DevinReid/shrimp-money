const { verifyToken } = require('../auth');

// Middleware to verify JWT token (for Next.js API routes)
function authenticate(req) {
  // Next.js API routes use Headers object, need to use .get() method
  const authHeader = req.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'No token provided', status: 401 };
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const decoded = verifyToken(token);

  if (!decoded) {
    return { error: 'Invalid or expired token', status: 401 };
  }

  return { user: decoded };
}

// Middleware to verify MFA-verified token (for sensitive operations)
function requireMFA(req) {
  // Next.js API routes use Headers object, need to use .get() method
  const authHeader = req.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'No token provided', status: 401 };
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return { error: 'Invalid or expired token', status: 401 };
  }

  if (!decoded.mfaVerified) {
    return { 
      error: 'MFA verification required',
      requiresMFA: true,
      status: 403 
    };
  }

  return { user: decoded };
}

module.exports = {
  authenticate,
  requireMFA,
};
