/**
 * Reset MFA for a specific user or all users
 * Usage: node scripts/reset-user-mfa.js [userId]
 * If no userId provided, resets all users
 */

require('dotenv').config({ path: '.env' });
const prisma = require('../lib/prisma');

async function resetUserMFA(userId = null) {
  try {
    console.log('🔄 Resetting MFA...\n');
    
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  DATABASE_URL not set - cannot reset MFA in database');
      return;
    }
    
    if (!prisma) {
      console.log('⚠️  Prisma client not initialized');
      return;
    }
    
    if (userId) {
      // Reset specific user
      const user = await prisma.plaidUser.findUnique({
        where: { id: userId },
      });
      
      if (!user) {
        console.log(`❌ User not found: ${userId}`);
        return;
      }
      
      console.log(`📋 User: ${user.username} (${user.id})`);
      console.log(`   - Current MFA Enabled: ${user.mfaEnabled}`);
      console.log(`   - Has Secret: ${!!user.mfaSecret}\n`);
      
      await prisma.plaidUser.update({
        where: { id: userId },
        data: {
          mfaSecret: null,
          mfaEnabled: false,
        },
      });
      
      console.log(`✅ MFA reset for user: ${user.username}`);
    } else {
      // Reset all users
      const users = await prisma.plaidUser.findMany({
        where: { mfaEnabled: true },
      });
      
      console.log(`📋 Found ${users.length} user(s) with MFA enabled\n`);
      
      for (const user of users) {
        console.log(`   - ${user.username} (${user.id})`);
      }
      
      if (users.length > 0) {
        await prisma.plaidUser.updateMany({
          where: { mfaEnabled: true },
          data: {
            mfaSecret: null,
            mfaEnabled: false,
          },
        });
        
        console.log(`\n✅ Reset MFA for ${users.length} user(s)`);
      } else {
        console.log('\n✅ No users with MFA enabled found');
      }
    }
    
    console.log('\n🎯 You can now set up MFA again from the app.');
    
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

const userId = process.argv[2] || null;
resetUserMFA(userId);

