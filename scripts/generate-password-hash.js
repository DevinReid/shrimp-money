#!/usr/bin/env node

/**
 * Generate a bcrypt hash for the admin password
 * Usage: node scripts/generate-password-hash.js [password]
 */

const bcrypt = require('bcryptjs');
const readline = require('readline');

async function generateHash(password) {
  try {
    const hash = await bcrypt.hash(password, 10);
    console.log('\n✅ Password hash generated:');
    console.log(hash);
    console.log('\n📋 Add to your .env file:');
    console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
    return hash;
  } catch (error) {
    console.error('❌ Error generating hash:', error);
    process.exit(1);
  }
}

async function main() {
  const password = process.argv[2];
  
  if (password) {
    await generateHash(password);
  } else {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('Enter password to hash: ', async (password) => {
      rl.close();
      if (!password) {
        console.error('❌ Password is required');
        process.exit(1);
      }
      await generateHash(password);
    });
  }
}

main();

