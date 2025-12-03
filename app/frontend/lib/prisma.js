const { PrismaClient } = require('@prisma/client');

// Singleton pattern for Prisma Client
// Prevents multiple instances in development (hot reload)
const globalForPrisma = global;

// Only initialize if DATABASE_URL is set
let prisma = null;

if (process.env.DATABASE_URL) {
  try {
    prisma = globalForPrisma.prisma || new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
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

