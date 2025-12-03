/**
 * Reset MFA for admin user
 * Run with: node scripts/reset-mfa.js
 */

require('dotenv').config({ path: '.env' });
const prisma = require('../lib/prisma');

async function resetMFA() {
  try {
    console.log('🔄 Resetting MFA for admin user...\n');
    
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  DATABASE_URL not set - cannot reset MFA in database');
      return;
    }
    
    if (!prisma) {
      console.log('⚠️  Prisma client not initialized');
      return;
    }
    
    // Check current status
    const adminMFA = await prisma.plaidAdminMFA.findFirst();
    
    if (adminMFA) {
      console.log('📋 Current Admin MFA Status:');
      console.log(`   - MFA Enabled: ${adminMFA.mfaEnabled}`);
      console.log(`   - Has Secret: ${!!adminMFA.mfaSecret}`);
      console.log(`   - Last Updated: ${adminMFA.updatedAt}\n`);
    } else {
      console.log('📋 No Admin MFA record found\n');
    }
    
    // Reset MFA - clear secret and disable
    await prisma.plaidAdminMFA.upsert({
      where: { id: 'admin' },
      update: {
        mfaSecret: null,
        mfaEnabled: false,
      },
      create: {
        id: 'admin',
        mfaSecret: null,
        mfaEnabled: false,
      },
    });
    
    console.log('✅ MFA reset successfully!');
    console.log('   - MFA Secret: Cleared');
    console.log('   - MFA Enabled: false\n');
    console.log('🎯 You can now set up MFA again from the app.');
    
  } catch (error) {
    console.error('❌ Error resetting MFA:', error.message);
    if (error.code === 'P1001') {
      console.error('   Database connection failed - check DATABASE_URL');
    }
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

resetMFA();

