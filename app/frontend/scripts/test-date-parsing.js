/**
 * Test date parsing to see if string conversion breaks the filter
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDateParsing() {
  try {
    // Get a sample of Bill transactions
    const bills = await prisma.plaidTransaction.findMany({
      where: { userCategory: 'Bill' },
      orderBy: { date: 'asc' },
      take: 20,
    });

    console.log('🔍 Testing date parsing...\n');

    const year = 2025;
    const yearStart = new Date(year, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    yearEnd.setHours(23, 59, 59, 999);

    console.log(`Year range: ${yearStart.toISOString()} to ${yearEnd.toISOString()}\n`);

    bills.forEach(b => {
      // Original date from DB (Date object)
      const originalDate = b.date;
      
      // Convert to string (like the API does)
      const dateString = originalDate.toISOString().split('T')[0];
      
      // Parse back (like the API does)
      const parsedDate = new Date(dateString);
      
      // Check if it passes the filter
      const passesFilter = parsedDate >= yearStart && parsedDate <= yearEnd;
      
      // Also check original
      const originalPasses = originalDate >= yearStart && originalDate <= yearEnd;
      
      if (!passesFilter || !originalPasses) {
        console.log(`❌ ${b.transactionId}:`);
        console.log(`   Original: ${originalDate.toISOString()} (passes: ${originalPasses})`);
        console.log(`   String: ${dateString}`);
        console.log(`   Parsed: ${parsedDate.toISOString()} (passes: ${passesFilter})`);
        console.log(`   Difference: ${parsedDate.getTime() - originalDate.getTime()}ms`);
        console.log('');
      }
    });

    // Count how many pass
    const passed = bills.filter(b => {
      const dateString = b.date.toISOString().split('T')[0];
      const parsedDate = new Date(dateString);
      return parsedDate >= yearStart && parsedDate <= yearEnd;
    });

    console.log(`\n✅ ${passed.length} of ${bills.length} sample transactions pass the filter`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDateParsing();

