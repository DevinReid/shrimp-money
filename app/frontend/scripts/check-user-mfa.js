/**
 * Check MFA status for a specific user
 * Usage: node scripts/check-user-mfa.js [userId]
 */

require('dotenv').config({ path: '.env' });
const prisma = require('../lib/prisma');

async function checkUserMFA(userId) {
  try {
    console.log(`🔍 Checking MFA status for user: ${userId}\n`);
    
    if (!prisma) {
      console.log('⚠️  Prisma client not initialized');
      return;
    }
    
    const user = await prisma.plaidUser.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      console.log(`❌ User not found: ${userId}`);
      return;
    }
    
    console.log('📋 User Details:');
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Username: ${user.username}`);
    console.log(`   - MFA Enabled: ${user.mfaEnabled}`);
    console.log(`   - Has MFA Secret: ${!!user.mfaSecret}`);
    console.log(`   - Created: ${user.createdAt}`);
    console.log(`   - Updated: ${user.updatedAt}`);
    
    // Also check via findUserById
    console.log('\n📋 Via findUserById function:');
    const { findUserById } = require('../lib/auth');
    const userObj = await findUserById(userId);
    if (userObj) {
      console.log(`   - MFA Enabled: ${userObj.mfaEnabled}`);
      console.log(`   - Has MFA Secret: ${!!userObj.mfaSecret}`);
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

const userId = process.argv[2] || 'user_1763664029087_rumcqp8pe';
checkUserMFA(userId);

