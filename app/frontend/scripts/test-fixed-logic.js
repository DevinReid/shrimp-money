/**
 * Test the FIXED expense/income logic
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testFixedLogic() {
  try {
    const year = 2025;
    const yearStart = new Date(year, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    yearEnd.setHours(23, 59, 59, 999);

    // Get all Bill transactions for 2025
    const bills = await prisma.plaidTransaction.findMany({
      where: {
        userCategory: 'Bill',
        date: {
          gte: yearStart,
          lte: yearEnd,
        }
      },
    });

    console.log(`📊 Testing FIXED logic on ${bills.length} Bill transactions\n`);

    // Apply the FIXED logic
    const converted = bills.map(b => {
      const dateString = b.date.toISOString().split('T')[0];
      const userCategory = b.userCategory || null;
      const isUserMarkedIncome = userCategory === 'Income';
      const hasUserCategory = userCategory && userCategory !== 'Uncategorized';
      
      // FIXED LOGIC: If user categorized it, respect their categorization
      const isExpense = isUserMarkedIncome 
        ? false 
        : (hasUserCategory ? true : b.amount > 0);
      const isIncome = isUserMarkedIncome || (!hasUserCategory && b.amount < 0);
      
      return {
        transaction_id: b.transactionId,
        date: dateString,
        amount: b.amount,
        userCategory,
        isExpense,
        isIncome,
        normalizedAmount: Math.abs(b.amount),
      };
    });

    // Filter like the API does
    const yearTransactions = converted.filter(t => {
      if (!t.date) return false;
      const txDate = new Date(t.date);
      if (isNaN(txDate.getTime())) return false;
      return txDate >= yearStart && txDate <= yearEnd;
    });

    const billExpenses = yearTransactions.filter(t => 
      t.userCategory === 'Bill' && t.isExpense
    );

    const billIncome = yearTransactions.filter(t => 
      t.userCategory === 'Bill' && t.isIncome
    );

    console.log(`✅ Bill transactions marked as EXPENSE: ${billExpenses.length}`);
    console.log(`   Total: $${billExpenses.reduce((sum, t) => sum + t.normalizedAmount, 0).toFixed(2)}`);
    console.log(`\n❌ Bill transactions marked as INCOME: ${billIncome.length}`);
    console.log(`   Total: $${billIncome.reduce((sum, t) => sum + t.normalizedAmount, 0).toFixed(2)}`);

    if (billExpenses.length === bills.length) {
      console.log(`\n🎉 SUCCESS! All ${bills.length} Bill transactions are now correctly marked as expenses!`);
    } else {
      console.log(`\n⚠️  Still have issues: ${billIncome.length} transactions incorrectly marked as income`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testFixedLogic();

