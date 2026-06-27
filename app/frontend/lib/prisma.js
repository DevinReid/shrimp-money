const { PrismaClient } = require('@prisma/client');

// Singleton pattern for Prisma Client
// Prevents multiple instances in development (hot reload)
const globalForPrisma = global;

// Only initialize if DATABASE_URL is set
let prisma = null;

if (process.env.DATABASE_URL) {
  try {
    // In development, clear cached instance on hot reload to pick up config changes
    if (process.env.NODE_ENV === 'development' && globalForPrisma.prisma) {
      // Disconnect old instance (fire and forget) and clear cache
      globalForPrisma.prisma.$disconnect().catch(() => {});
      globalForPrisma.prisma = null;
    }
    
    prisma = globalForPrisma.prisma || new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
    
    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = prisma;
    }
    
    console.log('✅ Prisma Client initialized with database connection');
  } catch (error) {
    console.warn('⚠️ Failed to initialize Prisma Client:', error.message);
    prisma = null;
  }
} else {
  console.log('ℹ️ DATABASE_URL not set - using file storage fallback');
}

module.exports = prisma;

