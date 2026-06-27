// Simple in-memory rate limiting for Next.js API routes
const rateLimitMap = new Map();

export function rateLimit(windowMs, max) {
  return async (req) => {
    // In development, be more lenient - skip rate limiting
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

    // Use IP address or a default key for tracking
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const key = forwardedFor?.split(',')[0]?.trim() || realIp || 'default';
    const now = Date.now();
    
    if (!rateLimitMap.has(key)) {
      // First request - initialize
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return null;
    }
    
    const limit = rateLimitMap.get(key);
    
    // Check if window has expired
    if (now > limit.resetTime) {
      // Reset the counter
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return null;
    }
    
    // Check if limit exceeded (before incrementing)
    if (limit.count >= max) {
      return {
        error: 'Too many authentication attempts, please try again later.',
        status: 429
      };
    }
    
    // Increment counter for this request
    limit.count++;
    return null;
  };
}

// Clean up old entries periodically (every 30 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime + 30 * 60 * 1000) {
        rateLimitMap.delete(key);
      }
    }
  }, 30 * 60 * 1000);
}

