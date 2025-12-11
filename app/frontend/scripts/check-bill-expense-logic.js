/**
 * Check if Bill transactions are being marked as expenses correctly
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBills() {
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
      orderBy: { date: 'asc' },
    });

    console.log(`📊 Bill transactions in 2025: ${bills.length}\n`);

    // Check how they would be marked
    let expenseCount = 0;
    let incomeCount = 0;
    let totalExpense = 0;
    let totalIncome = 0;

    bills.forEach(b => {
      const isUserMarkedIncome = b.userCategory === 'Income';
      const isExpense = !isUserMarkedIncome && b.amount > 0;
      const isIncome = isUserMarkedIncome || b.amount < 0;

      if (isExpense) {
        expenseCount++;
        totalExpense += Math.abs(b.amount);
      } else if (isIncome) {
        incomeCount++;
        totalIncome += Math.abs(b.amount);
      }

      // Show any that might be marked incorrectly
      if (b.userCategory === 'Bill' && !isExpense) {
        console.log(`⚠️  Bill marked as income: ${b.transactionId}`);
        console.log(`   Amount: ${b.amount}, isExpense: ${isExpense}, isIncome: ${isIncome}`);
      }
    });

    console.log(`\n💰 Expense: ${expenseCount} transactions, $${totalExpense.toFixed(2)}`);
    console.log(`💰 Income: ${incomeCount} transactions, $${totalIncome.toFixed(2)}`);

    // Now test with the API's conversion logic
    console.log(`\n🔍 Testing with API conversion logic...`);
    const converted = bills.map(b => {
      const dateString = b.date.toISOString().split('T')[0];
      const userCategory = b.userCategory || null;
      const isUserMarkedIncome = userCategory === 'Income';
      
      return {
        transaction_id: b.transactionId,
        date: dateString,
        amount: b.amount,
        userCategory,
        isExpense: !isUserMarkedIncome && b.amount > 0,
        isIncome: isUserMarkedIncome || b.amount < 0,
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

    const billTransactions = yearTransactions.filter(t => 
      t.userCategory === 'Bill' && t.isExpense
    );

    console.log(`✅ After API conversion: ${yearTransactions.length} transactions pass year filter`);
    console.log(`✅ Bill transactions (Bill + isExpense): ${billTransactions.length}`);
    console.log(`   Total: $${billTransactions.reduce((sum, t) => sum + t.normalizedAmount, 0).toFixed(2)}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBills();

