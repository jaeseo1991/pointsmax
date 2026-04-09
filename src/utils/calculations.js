import { CARDS, REDEMPTION_STYLES, STATEMENT_CREDITS } from '../data/cards';

// ── internal helper ──────────────────────────────────────────────────────────

function getCard(cardId) {
  return CARDS.find(c => c.id === cardId) || null;
}

function getValuation(issuer, redeemStyle) {
  const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
  if (!style) return 0.01;
  return (style.valuations[issuer] || 1.0) / 100; // returns decimal (e.g. 0.018)
}

// ── exported ─────────────────────────────────────────────────────────────────

/**
 * Returns the effective earning multiplier for a card in a given category,
 * accounting for rotating bonuses (with caps) and spend caps (e.g. BCP groceries).
 *
 * @param {object} card - full card object from CARDS
 * @param {string} category - category id
 * @param {object} activationStatus - { cardId: boolean }
 * @param {number} monthlySpend - dollars per month in this category for this entry
 * @returns {number} effective multiplier
 */
export function getEffectiveRate(card, category, activationStatus = {}, monthlySpend = 0) {
  if (!card) return 1;

  const { rotating, rates, caps } = card;

  // Handle rotating category
  if (rotating?.isRotating && rotating.currentQuarter) {
    const { categories, multiplier, cap } = rotating.currentQuarter;
    if (categories.includes(category)) {
      if (!activationStatus[card.id]) {
        return 1; // not activated → base 1x
      }
      // activated — apply cap
      const monthlyCap = cap / 3; // $1500/quarter → $500/month
      if (monthlySpend <= 0) return multiplier;
      if (monthlySpend <= monthlyCap) return multiplier;
      // blended rate for spend over the cap
      return (monthlyCap * multiplier + (monthlySpend - monthlyCap) * 1) / monthlySpend;
    }
    // non-rotating category on a rotating card → use base rate (1x for these cards)
    return rates[category] || 1;
  }

  // Handle annual spend caps (e.g. Amex BCP groceries $6k/yr)
  if (caps && caps[category]) {
    const annualCap = caps[category];
    const annualSpend = monthlySpend * 12;
    if (annualSpend <= annualCap) return rates[category] || 1;
    // blended annual rate converted back to a multiplier
    const baseRate = rates[category] || 1;
    const blendedAnnual = annualCap * baseRate + (annualSpend - annualCap) * 1;
    return blendedAnnual / annualSpend;
  }

  return rates[category] || 1;
}

/**
 * Monthly dollar gap from unactivated rotating bonuses.
 * For each entry assigned to a rotating card that is NOT activated,
 * calculates (potential at 5x - actual at 1x).
 */
export function calculateGap0(categoryEntries = {}, activationStatus = {}, redeemStyle = 'portal') {
  let gap = 0;

  for (const [category, entries] of Object.entries(categoryEntries)) {
    for (const entry of entries) {
      const card = getCard(entry.cardId);
      if (!card?.rotating?.isRotating) continue;
      const { categories, multiplier } = card.rotating.currentQuarter;
      if (!categories.includes(category)) continue;
      if (activationStatus[card.id]) continue; // already activated, no gap

      const amount = parseFloat(entry.amount) || 0;
      if (!amount) continue;
      const val = getValuation(card.issuer, redeemStyle);
      const monthlyCap = card.rotating.currentQuarter.cap / 3;
      const effectiveSpend = Math.min(amount, monthlyCap);
      const potential = effectiveSpend * multiplier * val;
      const actual = amount * 1 * val;
      gap += potential - actual;
    }
  }

  return Math.max(0, gap);
}

/**
 * Monthly dollar gap from sub-optimal card routing.
 * Compares what the user actually assigned vs the best card they own per category.
 */
export function calculateGap1(categoryEntries = {}, ownedCards = [], activationStatus = {}, redeemStyle = 'portal') {
  let gap = 0;

  for (const [category, entries] of Object.entries(categoryEntries)) {
    const totalSpend = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    if (!totalSpend) continue;

    // Actual earnings
    let actualEarnings = 0;
    for (const entry of entries) {
      const card = getCard(entry.cardId);
      if (!card) continue;
      const amount = parseFloat(entry.amount) || 0;
      const rate = getEffectiveRate(card, category, activationStatus, amount);
      const val = getValuation(card.issuer, redeemStyle);
      actualEarnings += amount * rate * val;
    }

    // Optimal earnings (best owned card gets all spend)
    let bestEarnings = 0;
    for (const cardId of ownedCards) {
      const card = getCard(cardId);
      if (!card) continue;
      const rate = getEffectiveRate(card, category, activationStatus, totalSpend);
      const val = getValuation(card.issuer, redeemStyle);
      const earnings = totalSpend * rate * val;
      if (earnings > bestEarnings) bestEarnings = earnings;
    }

    gap += Math.max(0, bestEarnings - actualEarnings);
  }

  return gap;
}

/**
 * Monthly dollar gap from not having better market cards.
 * Compares best owned card vs best available card across all CARDS.
 */
export function calculateGap2(categoryEntries = {}, ownedCards = [], activationStatus = {}, redeemStyle = 'portal') {
  let gap = 0;

  for (const [category, entries] of Object.entries(categoryEntries)) {
    const totalSpend = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    if (!totalSpend) continue;

    // Best owned card
    let bestOwned = 0;
    for (const cardId of ownedCards) {
      const card = getCard(cardId);
      if (!card) continue;
      const rate = getEffectiveRate(card, category, activationStatus, totalSpend);
      const val = getValuation(card.issuer, redeemStyle);
      const earnings = totalSpend * rate * val;
      if (earnings > bestOwned) bestOwned = earnings;
    }

    // Best market card (all CARDS, activated rotating)
    let bestMarket = 0;
    for (const card of CARDS) {
      // For market comparison, assume rotating cards are activated
      const fakeActivation = card.rotating?.isRotating ? { [card.id]: true } : {};
      const rate = getEffectiveRate(card, category, fakeActivation, totalSpend);
      const val = getValuation(card.issuer, redeemStyle);
      const earnings = totalSpend * rate * val;
      if (earnings > bestMarket) bestMarket = earnings;
    }

    gap += Math.max(0, bestMarket - bestOwned);
  }

  return gap;
}

/**
 * Annual dollar earnings for a set of wallet cards, using optimal routing per category.
 * @param {string[]} walletCardIds
 * @param {object} spend - { category: monthlyDollars }
 * @param {object} activationStatus
 * @param {string} redeemStyle
 */
export function calculateWalletEarnings(walletCardIds, spend, activationStatus = {}, redeemStyle = 'portal') {
  let total = 0;

  for (const [category, monthlyStr] of Object.entries(spend)) {
    const monthly = parseFloat(monthlyStr) || 0;
    if (!monthly) continue;

    let bestEarnings = 0;
    for (const cardId of walletCardIds) {
      const card = getCard(cardId);
      if (!card) continue;
      const rate = getEffectiveRate(card, category, activationStatus, monthly);
      const val = getValuation(card.issuer, redeemStyle);
      const earnings = monthly * 12 * rate * val;
      if (earnings > bestEarnings) bestEarnings = earnings;
    }
    total += bestEarnings;
  }

  return total;
}

/**
 * Effective annual fee for a single card after applying selected credits.
 * @param {string} cardId
 * @param {object} selectedCredits - { cardId: [creditId, ...] }
 */
export function calculateEffectiveFee(cardId, selectedCredits = {}) {
  const card = getCard(cardId);
  if (!card) return 0;
  const baseFee = card.annualFee;
  const credits = STATEMENT_CREDITS[cardId] || [];
  const selectedIds = selectedCredits[cardId] || [];
  const creditValue = credits
    .filter(c => selectedIds.includes(c.id))
    .reduce((s, c) => s + c.value, 0);
  return Math.max(0, baseFee - creditValue);
}

/**
 * Month number (1–60) when the paid wallet cumulative value first exceeds the free wallet.
 * Returns null if paid wallet never breaks even within 5 years.
 */
export function calculateBreakeven(
  freeWalletCards,
  paidWalletCards,
  spend,
  selectedCredits = {},
  heldCards = [],
  redeemStyle = 'portal'
) {
  const freeMonthlyEarnings = calculateWalletEarnings(freeWalletCards, spend, {}, redeemStyle) / 12;
  const freeMonthlyFee = freeWalletCards.reduce((s, id) => s + calculateEffectiveFee(id, selectedCredits), 0) / 12;
  const freeMonthlyNet = freeMonthlyEarnings - freeMonthlyFee;

  const paidMonthlyEarnings = calculateWalletEarnings(paidWalletCards, spend, {}, redeemStyle) / 12;
  const paidMonthlyFee = paidWalletCards.reduce((s, id) => s + calculateEffectiveFee(id, selectedCredits), 0) / 12;
  const paidMonthlyNet = paidMonthlyEarnings - paidMonthlyFee;

  // Welcome bonus for paid wallet (skip cards already held)
  let welcomeBonus = 0;
  for (const cardId of paidWalletCards) {
    if (heldCards.includes(cardId)) continue;
    const card = getCard(cardId);
    if (!card?.welcomeBonus) continue;
    const wb = card.welcomeBonus;
    if (wb.isCashbackMatch) {
      // Discover: bonus = annual earnings from this card alone
      const discoverEarnings = calculateWalletEarnings([cardId], spend, {}, redeemStyle);
      welcomeBonus += discoverEarnings;
    } else {
      // Convert points/miles to dollars using valuation
      if (wb.type === 'cashback') {
        welcomeBonus += wb.amount;
      } else {
        const val = getValuation(card.issuer, redeemStyle);
        welcomeBonus += wb.amount * val;
      }
    }
  }

  let cumFree = 0;
  let cumPaid = 0;

  for (let month = 1; month <= 60; month++) {
    cumFree += freeMonthlyNet;
    cumPaid += paidMonthlyNet + (month === 1 ? welcomeBonus : 0);
    if (cumPaid > cumFree) return month;
  }

  return null;
}

/**
 * Generates month-by-month cumulative value for two wallets over 60 months.
 * Returns { free: number[], tier: number[], breakeven: number|null }
 * where each array index is the cumulative value at the end of that month (index 0 = month 1).
 */
export function generateCumulativeData(
  freeWalletCards,
  tierCards,
  spend,
  selectedCredits = {},
  heldCards = [],
  redeemStyle = 'portal'
) {
  const freeMonthlyNet =
    calculateWalletEarnings(freeWalletCards, spend, {}, redeemStyle) / 12 -
    freeWalletCards.reduce((s, id) => s + calculateEffectiveFee(id, selectedCredits), 0) / 12;

  const tierMonthlyNet =
    calculateWalletEarnings(tierCards, spend, {}, redeemStyle) / 12 -
    tierCards.reduce((s, id) => s + calculateEffectiveFee(id, selectedCredits), 0) / 12;

  // Welcome bonus for tier (skip held cards)
  let welcomeBonus = 0;
  for (const cardId of tierCards) {
    if (heldCards.includes(cardId)) continue;
    const card = getCard(cardId);
    if (!card?.welcomeBonus) continue;
    const wb = card.welcomeBonus;
    if (wb.isCashbackMatch) {
      welcomeBonus += calculateWalletEarnings([cardId], spend, {}, redeemStyle);
    } else if (wb.type === 'cashback') {
      welcomeBonus += wb.amount;
    } else {
      const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
      const val = (style?.valuations[card.issuer] || 1.0) / 100;
      welcomeBonus += wb.amount * val;
    }
  }

  const free = [];
  const tier = [];
  let cumFree = 0;
  let cumTier = 0;
  let breakeven = null;

  for (let m = 1; m <= 60; m++) {
    cumFree += freeMonthlyNet;
    cumTier += tierMonthlyNet + (m === 1 ? welcomeBonus : 0);
    free.push(cumFree);
    tier.push(cumTier);
    if (breakeven === null && cumTier > cumFree) breakeven = m;
  }

  return { free, tier, breakeven };
}

/** Format a number as USD, no decimals */
export function fmt(n) {
  return (parseFloat(n) || 0).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });
}
