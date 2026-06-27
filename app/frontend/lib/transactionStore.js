const prismaClient = require('./prisma');

/**
 * Canonical transaction loader — the single source of truth every view should
 * use, so the forecast, spending analysis, transactions list, and uncategorized
 * count all compute on the exact same dataset and can't drift apart.
 *
 * It merges:
 *   - plaid_transaction_data  (the live JSON blob, updated on every Plaid refresh)
 *   - plaid_transactions      (the normalized table, which can lag if its
 *                              migration hasn't run — added only as a safety net
 *                              for any rows the blob somehow lacks)
 * deduped by transaction_id, then fills categories from plaid_transaction_categories
 * (the source of truth for categories) and notes from plaid_transaction_notes.
 *
 * Returns rich objects: blob rows keep all their original Plaid fields (so the
 * transactions list still renders fully), plus normalized `amount`, `dateObj`,
 * `userCategory`, and `userNote` on every row.
 *
 * @returns {Promise<{transactions: Array, lastFetched: Date|null, totalTransactions: number}>}
 */
async function loadMergedTransactions(client = prismaClient) {
  const map = new Map();
  let lastFetched = null;

  // 1) Live JSON blob — authoritative & most current.
  if (client && client.plaidTransactionData) {
    try {
      const records = await client.plaidTransactionData.findMany();
      for (const rec of records) {
        if (rec.lastFetched && (!lastFetched || rec.lastFetched > lastFetched)) {
          lastFetched = rec.lastFetched;
        }
        const arr = Array.isArray(rec.transactions)
          ? rec.transactions
          : (rec.transactions && Array.isArray(rec.transactions.transactions)
            ? rec.transactions.transactions
            : []);
        arr.forEach(t => {
          if (!t || !t.transaction_id || map.has(t.transaction_id)) return;
          map.set(t.transaction_id, {
            ...t, // preserve all original Plaid fields for display
            amount: parseFloat(t.amount) || 0,
            dateObj: t.date ? new Date(t.date) : new Date(),
            userCategory: t.userCategory || null,
            userNote: t.userNote || null,
          });
        });
      }
    } catch (e) {
      console.warn('⚠️ loadMergedTransactions: blob read failed:', e.message);
    }
  }

  // 2) Normalized table — add any rows the blob is missing (safety net).
  if (client && client.plaidTransaction) {
    try {
      const rows = await client.plaidTransaction.findMany();
      rows.forEach(t => {
        if (!t.transactionId || map.has(t.transactionId)) return;
        const dateObj = t.date instanceof Date ? t.date : new Date(t.date);
        map.set(t.transactionId, {
          transaction_id: t.transactionId,
          account_id: t.accountId || '',
          name: t.name || '',
          merchant_name: t.merchantName || null,
          amount: parseFloat(t.amount) || 0,
          date: dateObj.toISOString().split('T')[0],
          dateObj,
          iso_currency_code: t.isoCurrencyCode || null,
          pending: t.pending || false,
          transaction_code: t.transactionCode || null,
          userCategory: t.userCategory || null,
          userNote: null,
        });
      });
    } catch (e) {
      console.warn('⚠️ loadMergedTransactions: table read failed:', e.message);
    }
  }

  const transactions = Array.from(map.values());
  const ids = transactions.map(t => t.transaction_id);

  // 3) Fill categories (source of truth) — overrides any stale per-row value.
  if (client && client.plaidTransactionCategory && ids.length > 0) {
    try {
      const cats = await client.plaidTransactionCategory.findMany({
        where: { transactionId: { in: ids } },
      });
      const catMap = {};
      cats.forEach(c => { catMap[c.transactionId] = c.category; });
      transactions.forEach(t => {
        t.userCategory = catMap[t.transaction_id] || t.userCategory || null;
      });
    } catch (e) {
      console.warn('⚠️ loadMergedTransactions: category fill failed:', e.message);
    }
  }

  // 4) Fill notes.
  if (client && client.plaidTransactionNote && ids.length > 0) {
    try {
      const notes = await client.plaidTransactionNote.findMany({
        where: { transactionId: { in: ids } },
      });
      const noteMap = {};
      notes.forEach(n => { noteMap[n.transactionId] = n.note; });
      transactions.forEach(t => {
        t.userNote = noteMap[t.transaction_id] || t.userNote || null;
      });
    } catch (e) {
      console.warn('⚠️ loadMergedTransactions: note fill failed:', e.message);
    }
  }

  return { transactions, lastFetched, totalTransactions: transactions.length };
}

module.exports = { loadMergedTransactions };
