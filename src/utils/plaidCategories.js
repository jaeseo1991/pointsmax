/**
 * Maps Plaid's personal_finance_category.primary (and .detailed) to our 8 spend categories.
 * Plaid docs: https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv
 *
 * Our categories: dining, groceries, travel, gas, shopping, subscriptions, entertainment, other
 */

// Primary category → our category
const PRIMARY_MAP = {
  FOOD_AND_DRINK: 'dining',
  GROCERY: 'groceries',          // older Plaid responses
  GROCERIES: 'groceries',
  TRAVEL: 'travel',
  TRANSPORTATION: 'gas',         // overridden below for non-gas subcategories
  GAS: 'gas',
  GENERAL_MERCHANDISE: 'shopping',
  ENTERTAINMENT_AND_RECREATION: 'entertainment',
  PERSONAL_CARE: 'shopping',
  GENERAL_SERVICES: 'other',
  HOME_IMPROVEMENT: 'shopping',
  RENT_AND_UTILITIES: 'subscriptions',
  LOAN_PAYMENTS: 'other',
  BANK_FEES: 'other',
  TRANSFER_IN: null,              // ignore — not real spend
  TRANSFER_OUT: null,
  INCOME: null,
  PAYMENT: null,
};

// Detailed subcategory overrides (more precise)
const DETAILED_MAP = {
  // Food & drink
  'FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR': 'dining',
  'FOOD_AND_DRINK_COFFEE': 'dining',
  'FOOD_AND_DRINK_FAST_FOOD': 'dining',
  'FOOD_AND_DRINK_RESTAURANT': 'dining',
  'FOOD_AND_DRINK_VENDING_MACHINES': 'dining',
  'FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK': 'dining',
  // Groceries
  'FOOD_AND_DRINK_GROCERY': 'groceries',
  'FOOD_AND_DRINK_GROCERIES': 'groceries',
  // Travel
  'TRAVEL_FLIGHTS': 'travel',
  'TRAVEL_HOTELS_AND_MOTELS': 'travel',
  'TRAVEL_CAR_RENTAL': 'travel',
  'TRAVEL_CRUISES': 'travel',
  'TRAVEL_LODGING': 'travel',
  'TRAVEL_PARKING': 'travel',
  'TRAVEL_PUBLIC_TRANSIT': 'travel',
  'TRAVEL_TAXIS_AND_RIDE_SHARES': 'travel',
  'TRAVEL_TOLL': 'travel',
  'TRAVEL_TRAVEL_AGENCIES': 'travel',
  'TRAVEL_OTHER_TRAVEL': 'travel',
  // Gas
  'TRANSPORTATION_GAS_STATION': 'gas',
  'TRANSPORTATION_FUEL': 'gas',
  'TRANSPORTATION_OTHER_TRANSPORTATION': 'other',
  'TRANSPORTATION_CAR_DEALERS_AND_LEASING': 'other',
  'TRANSPORTATION_CAR_MAINTENANCE': 'other',
  // Subscriptions
  'ENTERTAINMENT_AND_RECREATION_TV_AND_MOVIES': 'subscriptions',
  'ENTERTAINMENT_AND_RECREATION_MUSIC': 'subscriptions',
  'ENTERTAINMENT_AND_RECREATION_DIGITAL_PURCHASE': 'subscriptions',
  'GENERAL_SERVICES_INTERNET_AND_PHONE': 'subscriptions',
  'GENERAL_SERVICES_SUBSCRIPTION': 'subscriptions',
  'RENT_AND_UTILITIES_INTERNET_AND_CABLE': 'subscriptions',
  'RENT_AND_UTILITIES_TELEPHONE': 'subscriptions',
  'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY': 'other',
  'RENT_AND_UTILITIES_RENT': 'other',
  'RENT_AND_UTILITIES_WATER': 'other',
  'RENT_AND_UTILITIES_OTHER_UTILITIES': 'other',
  // Shopping
  'GENERAL_MERCHANDISE_DEPARTMENT_STORES': 'shopping',
  'GENERAL_MERCHANDISE_DISCOUNT_STORES': 'shopping',
  'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES': 'shopping',
  'GENERAL_MERCHANDISE_ELECTRONICS': 'shopping',
  'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES': 'shopping',
  'GENERAL_MERCHANDISE_SPORTING_GOODS': 'shopping',
  'GENERAL_MERCHANDISE_SUPERSTORES': 'shopping',
  // Entertainment
  'ENTERTAINMENT_AND_RECREATION_ARTS_AND_MUSEUMS': 'entertainment',
  'ENTERTAINMENT_AND_RECREATION_CASINOS_AND_GAMBLING': 'entertainment',
  'ENTERTAINMENT_AND_RECREATION_CONCERTS_AND_EVENTS': 'entertainment',
  'ENTERTAINMENT_AND_RECREATION_FITNESS_AND_WELLNESS': 'entertainment',
  'ENTERTAINMENT_AND_RECREATION_GYMS_AND_FITNESS_CENTERS': 'entertainment',
  'ENTERTAINMENT_AND_RECREATION_OUTDOOR_RECREATION': 'entertainment',
  'ENTERTAINMENT_AND_RECREATION_SPORTS_VENUES': 'entertainment',
  'ENTERTAINMENT_AND_RECREATION_OTHER_RECREATION': 'entertainment',
};

/**
 * Maps a single Plaid transaction to one of our spend category IDs, or null to skip.
 * @param {object} txn - Plaid transaction object
 * @returns {string|null} - one of our 8 category IDs, or null (skip this transaction)
 */
export function mapTransaction(txn) {
  // Skip credits / refunds (negative amounts in Plaid = money coming in)
  if (txn.amount <= 0) return null;

  const pfc = txn.personal_finance_category;

  // Use detailed mapping first (most specific)
  if (pfc?.detailed && DETAILED_MAP[pfc.detailed] !== undefined) {
    return DETAILED_MAP[pfc.detailed]; // may be null (skip)
  }

  // Fall back to primary
  const primary = pfc?.primary || '';
  if (PRIMARY_MAP[primary] !== undefined) {
    return PRIMARY_MAP[primary]; // may be null (skip)
  }

  // Legacy Plaid category array fallback
  const cats = txn.category || [];
  const joined = cats.join(' ').toLowerCase();
  if (joined.includes('restaurant') || joined.includes('food') || joined.includes('coffee')) return 'dining';
  if (joined.includes('grocer') || joined.includes('supermarket')) return 'groceries';
  if (joined.includes('airline') || joined.includes('hotel') || joined.includes('travel') || joined.includes('rideshare') || joined.includes('uber') || joined.includes('lyft')) return 'travel';
  if (joined.includes('gas') || joined.includes('fuel')) return 'gas';
  if (joined.includes('streaming') || joined.includes('subscription') || joined.includes('netflix') || joined.includes('spotify')) return 'subscriptions';
  if (joined.includes('entertainment') || joined.includes('gym') || joined.includes('sport')) return 'entertainment';
  if (joined.includes('shop') || joined.includes('amazon') || joined.includes('retail') || joined.includes('department')) return 'shopping';

  return 'other';
}

/**
 * Takes an array of Plaid transactions and returns:
 * {
 *   byCategory: { dining: 1234.56, groceries: 890.12, ... },
 *   byMonth: { '2025-01': { dining: 123, ... }, '2025-02': { ... }, ... },
 *   transactions: [{ ...txn, ourCategory }] — enriched, sorted desc
 * }
 */
export function analyzeTransactions(transactions) {
  const byCategory = { dining: 0, groceries: 0, travel: 0, gas: 0, shopping: 0, subscriptions: 0, entertainment: 0, other: 0 };
  const byMonth = {};
  const enriched = [];

  for (const txn of transactions) {
    const cat = mapTransaction(txn);
    if (!cat) continue; // skip transfers, income, refunds

    byCategory[cat] = (byCategory[cat] || 0) + txn.amount;

    const month = txn.date.slice(0, 7); // 'YYYY-MM'
    if (!byMonth[month]) {
      byMonth[month] = { dining: 0, groceries: 0, travel: 0, gas: 0, shopping: 0, subscriptions: 0, entertainment: 0, other: 0 };
    }
    byMonth[month][cat] = (byMonth[month][cat] || 0) + txn.amount;

    enriched.push({ ...txn, ourCategory: cat });
  }

  // Sort enriched descending by date
  enriched.sort((a, b) => b.date.localeCompare(a.date));

  return { byCategory, byMonth, transactions: enriched };
}

/**
 * Like analyzeTransactions but groups spend by (category, cardId) using an
 * account→card mapping. Returns:
 * {
 *   byCardCategory: { dining: { csr: 320, wfac: 80 }, groceries: { amex_bcp: 450 }, ... },
 *   months: number  — inferred from date range
 * }
 * Transactions from unmapped accounts (mapping[account_id] === undefined/null) are skipped.
 */
export function analyzeTransactionsByCard(transactions, accountMapping = {}) {
  const byCardCategory = {};
  const monthSet = new Set();

  for (const txn of transactions) {
    if (txn.amount <= 0) continue;
    const cardId = accountMapping[txn.account_id];
    if (!cardId) continue; // unmapped or explicitly skipped

    const cat = mapTransaction(txn);
    if (!cat) continue;

    monthSet.add(txn.date.slice(0, 7));
    if (!byCardCategory[cat]) byCardCategory[cat] = {};
    byCardCategory[cat][cardId] = (byCardCategory[cat][cardId] || 0) + txn.amount;
  }

  const months = Math.max(monthSet.size, 1);
  // Normalise totals to monthly averages
  const byCardCategoryMonthly = {};
  for (const [cat, cardTotals] of Object.entries(byCardCategory)) {
    byCardCategoryMonthly[cat] = {};
    for (const [cardId, total] of Object.entries(cardTotals)) {
      byCardCategoryMonthly[cat][cardId] = Math.round(total / months);
    }
  }

  return { byCardCategory: byCardCategoryMonthly, months };
}

/**
 * Given byCategory totals and the number of months of data, returns:
 * - monthlyAvg per category
 * - projectedRemaining: spend projected from today to Dec 31 of this year
 * - projectedAnnual: monthlyAvg * 12
 */
export function projectSpend(byCategory, monthsOfData) {
  const months = Math.max(monthsOfData, 1);
  const today = new Date();
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const msRemaining = yearEnd - today;
  const monthsRemaining = msRemaining / (1000 * 60 * 60 * 24 * 30.44);

  const monthlyAvg = {};
  const projectedRemaining = {};
  const projectedAnnual = {};

  for (const [cat, total] of Object.entries(byCategory)) {
    const avg = total / months;
    monthlyAvg[cat] = avg;
    projectedRemaining[cat] = avg * monthsRemaining;
    projectedAnnual[cat] = avg * 12;
  }

  return { monthlyAvg, projectedRemaining, projectedAnnual, monthsRemaining: Math.round(monthsRemaining * 10) / 10 };
}
