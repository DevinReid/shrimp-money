/**
 * Check what dates Bill transactions actually have
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBills() {
  try {
    const bills = await prisma.plaidTransaction.findMany({
      where: {
        userCategory: 'Bill'
      },
      orderBy: { date: 'asc' },
    });

    console.log(`📊 Total Bill transactions: ${bills.length}\n`);

    // Group by year
    const byYear = {};
    bills.forEach(b => {
      const year = b.date.getFullYear();
      if (!byYear[year]) {
        byYear[year] = [];
      }
      byYear[year].push(b);
    });

    Object.keys(byYear).sort().forEach(year => {
      const yearBills = byYear[year];
      const total = yearBills.reduce((sum, b) => sum + Math.abs(b.amount), 0);
      console.log(`📅 ${year}: ${yearBills.length} transactions, $${total.toFixed(2)}`);
      
      // Show first and last dates
      if (yearBills.length > 0) {
        const first = yearBills[0].date;
        const last = yearBills[yearBills.length - 1].date;
        console.log(`   Range: ${first.toISOString().split('T')[0]} to ${last.toISOString().split('T')[0]}`);
      }
    });

    // Show sample transactions
    console.log(`\n📋 Sample Bill transactions (first 10):`);
    bills.slice(0, 10).forEach(b => {
      console.log(`   ${b.date.toISOString().split('T')[0]} - $${Math.abs(b.amount).toFixed(2)} - ${b.name}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBills();

