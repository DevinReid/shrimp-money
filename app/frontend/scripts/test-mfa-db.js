/**
 * Test script to verify MFA database storage
 * Run with: node scripts/test-mfa-db.js
 */

require('dotenv').config({ path: '.env' });
const prisma = require('../lib/prisma');

async function testMFAStorage() {
  try {
    console.log('🔍 Checking MFA database storage...\n');
    
    // Check if database connection works
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  DATABASE_URL not set - database storage disabled');
      return;
    }
    
    console.log('✅ DATABASE_URL is set\n');
    
    // Check admin MFA record
    const adminMFA = await prisma.plaidAdminMFA.findFirst();
    
    if (adminMFA) {
      console.log('📋 Admin MFA Record Found:');
      console.log(`   - ID: ${adminMFA.id}`);
      console.log(`   - MFA Enabled: ${adminMFA.mfaEnabled}`);
      console.log(`   - Has Secret: ${!!adminMFA.mfaSecret}`);
      console.log(`   - Last Updated: ${adminMFA.updatedAt}`);
    } else {
      console.log('📋 No Admin MFA record found (MFA not set up yet)');
    }
    
    // Check users table
    const userCount = await prisma.plaidUser.count();
    console.log(`\n👥 Total users in database: ${userCount}`);
    
    if (userCount > 0) {
      const users = await prisma.plaidUser.findMany({
        select: {
          id: true,
          username: true,
          mfaEnabled: true,
          createdAt: true,
        },
      });
      
      console.log('\n📋 Users:');
      users.forEach(user => {
        console.log(`   - ${user.username} (${user.id})`);
        console.log(`     MFA Enabled: ${user.mfaEnabled}`);
      });
    }
    
    console.log('\n✅ Database check complete!');
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    if (error.code === 'P1001') {
      console.error('   Database connection failed - check DATABASE_URL');
    }
  } finally {
    await prisma.$disconnect();
  }
}

testMFAStorage();

