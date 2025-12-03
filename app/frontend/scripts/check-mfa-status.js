/**
 * Check current MFA status from all sources
 * Run with: node scripts/check-mfa-status.js
 */

require('dotenv').config({ path: '.env' });
const prisma = require('../lib/prisma');
const { findUserById } = require('../lib/auth');

async function checkMFAStatus() {
  try {
    console.log('🔍 Checking MFA status from all sources...\n');
    
    console.log('📋 Environment Variables:');
    console.log(`   - ADMIN_MFA_SECRET: ${process.env.ADMIN_MFA_SECRET ? 'SET' : 'NOT SET'}`);
    console.log(`   - ADMIN_MFA_ENABLED: ${process.env.ADMIN_MFA_ENABLED || 'NOT SET'}`);
    console.log(`   - DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}\n`);
    
    if (prisma) {
      console.log('📋 Database Status:');
      const adminMFA = await prisma.plaidAdminMFA.findFirst();
      if (adminMFA) {
        console.log(`   - Record exists: YES`);
        console.log(`   - MFA Enabled: ${adminMFA.mfaEnabled}`);
        console.log(`   - Has Secret: ${!!adminMFA.mfaSecret}`);
        console.log(`   - Updated: ${adminMFA.updatedAt}`);
      } else {
        console.log(`   - Record exists: NO`);
      }
      console.log('');
    }
    
    console.log('📋 User Object (via findUserById):');
    const user = await findUserById('admin');
    if (user) {
      console.log(`   - User ID: ${user.id}`);
      console.log(`   - Username: ${user.username}`);
      console.log(`   - MFA Enabled: ${user.mfaEnabled}`);
      console.log(`   - Has MFA Secret: ${!!user.mfaSecret}`);
      console.log(`   - Source: ${user.mfaEnabled ? 'ENABLED - Cannot setup' : 'DISABLED - Can setup'}`);
    } else {
      console.log('   - User not found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

checkMFAStatus();

