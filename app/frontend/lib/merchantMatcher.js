/**
 * Shared merchant fuzzy matching utilities
 * Used by transaction ingestion, rule application, and bulk categorization
 */

/**
 * Normalize merchant name for matching
 * Aggressively strips prefixes, suffixes, URLs, location info, transaction IDs, etc.
 */
function normalizeMerchantName(name) {
  if (!name) return '';

  return name
    .toLowerCase()
    .trim()
    // Remove common transaction prefixes
    .replace(/^(debit card purchase|digital card purchase|withdrawal from|deposit from|payment to|purchase at|pos purchase)\s*[-–—]\s*/i, '')
    // Remove URL-like suffixes (help.uber.com, apple.com/bill, etc.)
    .replace(/\s*[a-z]+\.[a-z]+\.(com|net|org|io)[^\s]*/gi, '')
    // Remove .com/.net/.org from merchant names but keep the name
    .replace(/\.(com|net|org|io)(\/\S*)?/gi, '')
    // Remove location suffixes (city + state, state codes, country)
    .replace(/\s+[a-z]+\s+[a-z]{2}\s+us\s*$/i, '') // "city ST US"
    .replace(/\s+[a-z]{2}\s+us\s*$/i, '') // "ST US"
    .replace(/\s+[a-z]{2}\s*$/i, '') // trailing state code
    .replace(/\s+us\s*$/i, '')
    // Remove phone numbers
    .replace(/\s+\d{3}[-.]?\d{3}[-.]?\d{4}/g, '')
    .replace(/\s+\d{10,}/g, '')
    // Remove transaction IDs and codes (e.g., *B26C99260, #1234, TST*)
    .replace(/[*#]+\S*/g, '')
    // Remove trailing digits/codes
    .replace(/\s+\d+\s*$/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the core brand/merchant token from a name.
 * "uber eats" → "uber", "amazon mktplace pmts" → "amazon", "discover bank" → "discover"
 */
function extractCoreName(name) {
  const normalized = normalizeMerchantName(name);
  // Take the first meaningful word (brand token) — most merchants are identified by their first word
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  // Return first 1-2 words as core name
  return words.slice(0, 2).join(' ');
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings (0 to 1)
 */
function stringSimilarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Extract significant keywords from merchant name
 */
function extractKeyWords(name) {
  const commonWords = new Set([
    'the', 'and', 'or', 'of', 'from', 'to', 'in', 'on', 'at', 'a', 'an',
    'inc', 'llc', 'ltd', 'corp', 'co', 'payment', 'payments', 'pmts', 'pmt',
    'purchase', 'debit', 'credit', 'card', 'bank', 'pay', 'bill',
    'mktplace', 'marketplace', 'online', 'digital', 'store', 'shop',
  ]);
  const words = name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w));
  return words.sort().join(' ');
}

/**
 * Check if two merchant names are similar enough to be considered the same vendor.
 * Uses 6-layer matching: exact normalized → core brand → main name → Levenshtein → substring → keywords
 *
 * @returns {{ match: boolean, score: number, reason: string }}
 */
function areMerchantsSimilar(name1, name2) {
  const normalized1 = normalizeMerchantName(name1);
  const normalized2 = normalizeMerchantName(name2);

  if (!normalized1 || !normalized2) return { match: false, score: 0, reason: 'empty' };

  // Layer 1: Exact match after normalization
  if (normalized1 === normalized2) return { match: true, score: 1.0, reason: 'exact' };

  // Layer 2: Core brand name match (first 1-2 words)
  const core1 = extractCoreName(name1);
  const core2 = extractCoreName(name2);
  if (core1 && core2 && core1.length >= 3 && core1 === core2) {
    return { match: true, score: 0.92, reason: 'core_brand' };
  }

  // Extract main merchant name (before special characters/IDs)
  const extractMain = (str) => {
    return str
      .split(/[*#]/)[0]
      .split(/\s+\d/)[0]
      .trim();
  };

  const main1 = extractMain(normalized1);
  const main2 = extractMain(normalized2);

  // Layer 3: Main names match exactly
  if (main1 === main2 && main1.length > 3) {
    return { match: true, score: 0.95, reason: 'main_name_exact' };
  }

  // Layer 4: Levenshtein fuzzy similarity
  if (main1.length > 3 && main2.length > 3) {
    const similarity = stringSimilarity(main1, main2);
    if (similarity >= 0.75) {
      return { match: true, score: similarity, reason: 'fuzzy_similarity' };
    }
  }

  // Layer 5: Substring/containment match (relaxed — works for short names too)
  if (main1.length >= 3 && main2.length >= 3) {
    if (main1.includes(main2) || main2.includes(main1)) {
      const shorter = Math.min(main1.length, main2.length);
      const longer = Math.max(main1.length, main2.length);
      const coverage = shorter / longer;
      if (coverage >= 0.4 && shorter >= 3) {
        return { match: true, score: Math.max(coverage, 0.80), reason: 'substring' };
      }
    }
  }

  // Layer 6: First-word brand match (catches "uber eats" vs "uber trip", "apple pay" vs "apple bill")
  const firstWord1 = normalized1.split(/\s+/)[0];
  const firstWord2 = normalized2.split(/\s+/)[0];
  if (firstWord1 && firstWord2 && firstWord1.length >= 4 && firstWord1 === firstWord2) {
    return { match: true, score: 0.85, reason: 'first_word_brand' };
  }

  // Layer 6b: One name starts with the other's first word (catches "discover bank" vs "discoverbank")
  if (firstWord1.length >= 4 && normalized2.startsWith(firstWord1)) {
    return { match: true, score: 0.85, reason: 'brand_prefix' };
  }
  if (firstWord2.length >= 4 && normalized1.startsWith(firstWord2)) {
    return { match: true, score: 0.85, reason: 'brand_prefix' };
  }

  // Layer 7: Word-based matching (shared significant keywords)
  const keyWords1 = extractKeyWords(main1);
  const keyWords2 = extractKeyWords(main2);
  if (keyWords1 && keyWords2) {
    const words1 = new Set(keyWords1.split(' '));
    const words2 = new Set(keyWords2.split(' '));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    const wordSimilarity = intersection.size / union.size;

    if (wordSimilarity >= 0.5 && intersection.size >= 1) {
      return { match: true, score: wordSimilarity, reason: 'key_words' };
    }
  }

  return { match: false, score: 0, reason: 'no_match' };
}

/**
 * Build a merchant-to-category lookup from previously categorized transactions.
 * Groups by normalized merchant name and picks the most frequent category.
 *
 * @param {Array} transactions - All transactions (from PlaidTransactionData)
 * @param {Object} categoryMap - { transactionId: category } from PlaidTransactionCategory
 * @returns {Array<{ merchantName: string, normalizedName: string, category: string, count: number }>}
 */
function buildCategoryHistory(transactions, categoryMap) {
  const merchantCategories = {};

  for (const t of transactions) {
    const category = t.userCategory || categoryMap[t.transaction_id];
    if (!category || category === 'Uncategorized') continue;

    const merchantName = t.merchant_name || t.name || '';
    const normalized = normalizeMerchantName(merchantName);
    if (!normalized) continue;

    if (!merchantCategories[normalized]) {
      merchantCategories[normalized] = {
        merchantName,
        normalizedName: normalized,
        categories: {}
      };
    }
    merchantCategories[normalized].categories[category] =
      (merchantCategories[normalized].categories[category] || 0) + 1;
  }

  // Pick the most frequent category for each merchant
  return Object.values(merchantCategories).map(entry => {
    const sorted = Object.entries(entry.categories).sort((a, b) => b[1] - a[1]);
    return {
      merchantName: entry.merchantName,
      normalizedName: entry.normalizedName,
      category: sorted[0][0],
      count: sorted[0][1],
    };
  });
}

/**
 * Fuzzy-match a transaction against categorized history.
 * Returns the best match above the confidence threshold, or null.
 *
 * @param {Object} transaction - The uncategorized transaction
 * @param {Array} categoryHistory - Output of buildCategoryHistory()
 * @param {number} threshold - Minimum match score (default 0.80)
 * @returns {{ category: string, score: number, reason: string, matchedMerchant: string } | null}
 */
function fuzzyMatchTransaction(transaction, categoryHistory, threshold = 0.80) {
  const merchantName = transaction.merchant_name || transaction.name || '';
  if (!merchantName) return null;

  let bestMatch = null;

  for (const entry of categoryHistory) {
    const result = areMerchantsSimilar(merchantName, entry.merchantName);
    if (result.match && result.score >= threshold) {
      if (!bestMatch || result.score > bestMatch.score) {
        bestMatch = {
          category: entry.category,
          score: result.score,
          reason: result.reason,
          matchedMerchant: entry.merchantName,
        };
      }
    }
  }

  return bestMatch;
}

module.exports = {
  normalizeMerchantName,
  extractCoreName,
  levenshteinDistance,
  stringSimilarity,
  extractKeyWords,
  areMerchantsSimilar,
  buildCategoryHistory,
  fuzzyMatchTransaction,
};
