export const CATEGORIES = [
  { id: 'dining', label: 'Dining', icon: '🍽️' },
  { id: 'groceries', label: 'Groceries', icon: '🛒' },
  { id: 'travel', label: 'Travel', icon: '✈️' },
  { id: 'gas', label: 'Gas', icon: '⛽' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️' },
  { id: 'subscriptions', label: 'Subscriptions', icon: '📱' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { id: 'other', label: 'Other', icon: '💳' },
];

export const CARDS = [
  {
    id: 'cfu',
    name: 'Chase Freedom Unlimited',
    issuer: 'Chase',
    annualFee: 0,
    rates: { dining: 3, groceries: 1.5, travel: 1.5, gas: 1.5, shopping: 1.5, subscriptions: 1.5, entertainment: 1.5, other: 1.5 },
    color: '#1a6bab',
    rotating: { isRotating: false, currentQuarter: null },
    welcomeBonus: { amount: 20000, spend: 500, months: 3, type: 'points' },
  },
  {
    id: 'cdc',
    name: 'Citi Double Cash',
    issuer: 'Citi',
    annualFee: 0,
    rates: { dining: 2, groceries: 2, travel: 2, gas: 2, shopping: 2, subscriptions: 2, entertainment: 2, other: 2 },
    color: '#c41230',
    rotating: { isRotating: false, currentQuarter: null },
    welcomeBonus: { amount: 200, spend: 1500, months: 6, type: 'cashback' },
  },
  {
    id: 'csp',
    name: 'Chase Sapphire Preferred',
    issuer: 'Chase',
    annualFee: 95,
    rates: { dining: 3, groceries: 1, travel: 2, gas: 1, shopping: 1, subscriptions: 1, entertainment: 1, other: 1 },
    color: '#1a6bab',
    rotating: { isRotating: false, currentQuarter: null },
    welcomeBonus: { amount: 60000, spend: 4000, months: 3, type: 'points' },
  },
  {
    id: 'csr',
    name: 'Chase Sapphire Reserve',
    issuer: 'Chase',
    annualFee: 550,
    rates: { dining: 3, groceries: 1, travel: 10, gas: 1, shopping: 1, subscriptions: 1, entertainment: 1, other: 1 },
    color: '#1a6bab',
    rotating: { isRotating: false, currentQuarter: null },
    welcomeBonus: { amount: 60000, spend: 4000, months: 3, type: 'points' },
  },
  {
    id: 'amex_gold',
    name: 'Amex Gold',
    issuer: 'Amex',
    annualFee: 250,
    rates: { dining: 4, groceries: 4, travel: 3, gas: 1, shopping: 1, subscriptions: 1, entertainment: 1, other: 1 },
    color: '#c8992a',
    rotating: { isRotating: false, currentQuarter: null },
    welcomeBonus: { amount: 60000, spend: 4000, months: 6, type: 'points' },
  },
  {
    id: 'amex_plat',
    name: 'Amex Platinum',
    issuer: 'Amex',
    annualFee: 695,
    rates: { dining: 1, groceries: 1, travel: 5, gas: 1, shopping: 1, subscriptions: 1, entertainment: 1, other: 1 },
    color: '#8a8a8a',
    rotating: { isRotating: false, currentQuarter: null },
    welcomeBonus: { amount: 80000, spend: 8000, months: 6, type: 'points' },
  },
  {
    id: 'amex_bcp',
    name: 'Amex Blue Cash Preferred',
    issuer: 'Amex',
    annualFee: 95,
    rates: { dining: 1, groceries: 6, travel: 1, gas: 3, shopping: 1, subscriptions: 6, entertainment: 1, other: 1 },
    caps: { groceries: 6000 },
    color: '#0066cc',
    rotating: { isRotating: false, currentQuarter: null },
    welcomeBonus: { amount: 250, spend: 3000, months: 6, type: 'cashback' },
  },
  {
    id: 'cf',
    name: 'Chase Freedom',
    issuer: 'Chase',
    annualFee: 0,
    rates: { dining: 1, groceries: 1, travel: 1, gas: 1, shopping: 1, subscriptions: 1, entertainment: 1, other: 1 },
    color: '#1a6bab',
    rotating: {
      isRotating: true,
      currentQuarter: {
        quarter: 'Q2 2026',
        categories: ['travel', 'dining', 'subscriptions'],
        multiplier: 5,
        cap: 1500,
      },
    },
    welcomeBonus: { amount: 200, spend: 500, months: 3, type: 'cashback' },
  },
  {
    id: 'discover',
    name: 'Discover it',
    issuer: 'Discover',
    annualFee: 0,
    rates: { dining: 1, groceries: 1, travel: 1, gas: 1, shopping: 1, subscriptions: 1, entertainment: 1, other: 1 },
    color: '#ff6500',
    rotating: {
      isRotating: true,
      currentQuarter: {
        quarter: 'Q2 2026',
        categories: ['shopping', 'groceries', 'subscriptions'],
        multiplier: 5,
        cap: 1500,
      },
    },
    welcomeBonus: { amount: 0, spend: 0, months: 12, type: 'cashback', isCashbackMatch: true },
  },
  {
    id: 'wfac',
    name: 'Wells Fargo Active Cash',
    issuer: 'WellsFargo',
    annualFee: 0,
    rates: { dining: 2, groceries: 2, travel: 2, gas: 2, shopping: 2, subscriptions: 2, entertainment: 2, other: 2 },
    color: '#cf0a2c',
    rotating: { isRotating: false, currentQuarter: null },
    welcomeBonus: { amount: 200, spend: 500, months: 3, type: 'cashback' },
  },
  {
    id: 'co_venture',
    name: 'Capital One Venture',
    issuer: 'CapitalOne',
    annualFee: 95,
    rates: { dining: 2, groceries: 2, travel: 5, gas: 2, shopping: 2, subscriptions: 2, entertainment: 2, other: 2 },
    color: '#d03027',
    rotating: { isRotating: false, currentQuarter: null },
    welcomeBonus: { amount: 75000, spend: 4000, months: 3, type: 'miles' },
  },
];

// Statement credits grouped by card
export const STATEMENT_CREDITS = {
  amex_gold: [
    { id: 'amex_gold_dining', label: '$120 Dining Credit', value: 120, description: '$10/mo at select restaurants' },
    { id: 'amex_gold_uber', label: '$120 Uber Cash', value: 120, description: '$10/mo Uber Cash' },
    { id: 'amex_gold_dunkin', label: "$84 Dunkin'", value: 84, description: "$7/mo at Dunkin'" },
  ],
  amex_plat: [
    { id: 'amex_plat_airline', label: '$200 Airline Fee', value: 200, description: 'Incidental airline fees' },
    { id: 'amex_plat_hotel', label: '$200 Hotel Credit', value: 200, description: 'Fine Hotels & Resorts' },
    { id: 'amex_plat_digital', label: '$240 Digital Entertainment', value: 240, description: '$20/mo digital services' },
    { id: 'amex_plat_walmart', label: '$155 Walmart+', value: 155, description: 'Monthly Walmart+ membership' },
    { id: 'amex_plat_saks', label: '$100 Saks', value: 100, description: '$50 semi-annually' },
    { id: 'amex_plat_lounge', label: '$300 Lounge', value: 300, description: 'Centurion & Priority Pass' },
  ],
  csr: [
    { id: 'csr_travel', label: '$300 Travel Credit', value: 300, description: 'Automatic on travel purchases' },
    { id: 'csr_lounge', label: '$200 Lounge Credit', value: 200, description: 'Priority Pass Select' },
    { id: 'csr_tsa', label: '$22 TSA PreCheck', value: 22, description: 'Application fee credit' },
  ],
  amex_bcp: [
    { id: 'amex_bcp_disney', label: '$84 Disney Bundle', value: 84, description: '$7/mo Disney Bundle' },
  ],
  csp: [
    { id: 'csp_hotel', label: '$50 Hotel Credit', value: 50, description: 'Annual hotel stay credit' },
  ],
};

export const REDEMPTION_STYLES = [
  {
    id: 'cashout',
    label: 'Cash Out',
    description: 'Redeem as statement credits or deposits',
    valuations: { Chase: 1.0, Amex: 0.6, Citi: 1.0, Discover: 1.0, WellsFargo: 1.0, CapitalOne: 1.0 },
  },
  {
    id: 'portal',
    label: 'Travel Portal',
    description: 'Book travel through issuer portals',
    valuations: { Chase: 1.5, Amex: 1.0, Citi: 1.25, Discover: 1.0, WellsFargo: 1.0, CapitalOne: 1.7 },
  },
  {
    id: 'transfer',
    label: 'Transfer Partners',
    description: 'Transfer to airline/hotel programs',
    valuations: { Chase: 1.8, Amex: 1.8, Citi: 1.8, Discover: 1.0, WellsFargo: 1.0, CapitalOne: 2.0 },
  },
  {
    id: 'expert',
    label: 'Expert Transfers',
    description: 'Sweet spot redemptions via partners',
    valuations: { Chase: 2.2, Amex: 2.2, Citi: 2.2, Discover: 1.0, WellsFargo: 1.0, CapitalOne: 2.0 },
  },
];

// Predefined wallet tiers
export const WALLET_TIERS = [
  {
    id: 'free',
    name: 'Free Wallet',
    description: 'Best $0 fee combo',
    cards: ['cfu', 'cf', 'wfac'],
  },
  {
    id: 'optimized',
    name: 'Optimized',
    description: 'Mid-tier with credits',
    cards: ['amex_bcp', 'cfu', 'cdc'],
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'CSR + Amex Gold engine',
    cards: ['csr', 'amex_gold', 'cfu'],
  },
  {
    id: 'traveler',
    name: 'Traveler',
    description: 'Max travel points',
    cards: ['csr', 'amex_plat'],
  },
  {
    id: 'ultra',
    name: 'Ultra-Premium',
    description: 'Maximum earning power',
    cards: ['csr', 'amex_plat', 'amex_gold'],
  },
];

// Legacy — kept for backward compat
export const WALLETS = [
  { id: 'cashback_simple', name: 'Simple Cashback', description: 'No-fuss cash back', cards: ['cdc', 'cfu'], welcomeBonus: 400 },
  { id: 'chase_trifecta', name: 'Chase Trifecta', description: 'Chase points ecosystem', cards: ['csr', 'cfu', 'csp'], welcomeBonus: 1200 },
  { id: 'amex_duo', name: 'Amex Duo', description: 'Amex points powerhouse', cards: ['amex_gold', 'amex_plat'], welcomeBonus: 1500 },
  { id: 'amex_trifecta', name: 'Amex Trifecta', description: 'Full Amex ecosystem', cards: ['amex_gold', 'amex_plat', 'amex_bcp'], welcomeBonus: 1800 },
  { id: 'hybrid', name: 'Hybrid Optimizer', description: 'Best of Chase + Amex', cards: ['csr', 'amex_gold', 'cfu'], welcomeBonus: 1600 },
];
