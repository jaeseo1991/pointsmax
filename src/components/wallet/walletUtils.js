import { CARDS } from '../../data/cards';

export const CAT_ICONS = {
  dining: '🍽️', groceries: '🛒', flights: '✈️', travel: '🏨', gas: '⛽',
  shopping: '🛍️', subscriptions: '📱', entertainment: '🎬', other: '💳',
};

export const REDEEM_ICONS = { cashout: '💵', portal: '🖥️', transfer: '🤝', expert: '🧠' };

// Max new paid card applications to recommend at once — more is overwhelming
export const MAX_NEW_APPS = 2;

// Count new paid card applications a tier requires for a given user
export function newAppsNeeded(tier, ownedCards, heldCards) {
  return tier.cards.filter(cid => {
    if (ownedCards.includes(cid) || heldCards.includes(cid)) return false;
    const card = CARDS.find(c => c.id === cid);
    return card?.annualFee > 0; // $0-fee cards (CFU etc.) don't count as application burden
  }).length;
}

export function formatRawBonus(card) {
  const wb = card?.welcomeBonus;
  if (!wb || wb.amount === 0) return null;
  if (wb.isCashbackMatch) return 'Cashback Match';
  if (wb.type === 'cashback') return `$${wb.amount.toLocaleString()} cash back`;
  if (wb.type === 'miles')   return `${wb.amount.toLocaleString()} miles`;
  return `${wb.amount.toLocaleString()} pts`;
}
