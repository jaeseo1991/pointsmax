import { CARDS, CATEGORIES, REDEMPTION_STYLES } from '../../data/cards';
import { getEffectiveRate, fmt } from '../../utils/calculations';

const CAT_ICONS = {
  dining:'🍽️', groceries:'🛒', flights:'✈️', travel:'🏨', gas:'⛽',
  shopping:'🛍️', subscriptions:'📱', entertainment:'🎬', other:'💳',
};

export default function ActivationBanner({ card, ownedCards = [], activationStatus, categoryEntries, redeemStyle, onToggle }) {
  const { currentQuarter } = card.rotating;
  const isOn = !!activationStatus[card.id];
  const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
  const monthlyCap = currentQuarter.cap / 3;

  // Chase UR needs an unlocker card (CSR/CSP) to access portal/transfer rates
  const hasChaseUnlocker = ownedCards.some(id => id === 'csr' || id === 'csp');
  function cardVal(c) {
    if (c.issuer === 'Chase' && redeemStyle !== 'cashout' && !hasChaseUnlocker) return 0.01;
    return (style?.valuations[c.issuer] || 1.0) / 100;
  }

  // Sum spend and current earnings across ALL rotating categories combined
  let totalRotatingSpend = 0;
  let currentEarnings = 0;
  for (const cat of currentQuarter.categories) {
    const entries = categoryEntries[cat] || [];
    for (const e of entries) {
      const amount = parseFloat(e.amount) || 0;
      totalRotatingSpend += amount;
      const ec = CARDS.find(c => c.id === e.cardId);
      if (!ec) continue;
      const rate = getEffectiveRate(ec, cat, activationStatus, amount);
      currentEarnings += amount * rate * cardVal(ec);
    }
  }

  // Bonus earnings with combined cap applied to total rotating spend
  const effectiveSpend = Math.min(totalRotatingSpend, monthlyCap);
  const bonusEarnings = effectiveSpend * currentQuarter.multiplier * cardVal(card)
    + (totalRotatingSpend - effectiveSpend) * 1 * cardVal(card);

  const monthlyImpact = Math.max(0, bonusEarnings - currentEarnings);

  return (
    <div className={`activation-banner ${isOn ? 'activated' : ''}`}>
      <div className="activation-info">
        <div className="activation-title">
          {currentQuarter.quarter}: {card.name} — {currentQuarter.multiplier}x rotating
        </div>
        <div className="activation-cats">
          {(currentQuarter.labels || currentQuarter.categories.map(c => CATEGORIES.find(x => x.id === c)?.label)).map(label => (
            <span key={label} className="activation-cat">{label}</span>
          ))}
        </div>
        <div className={`activation-impact ${!isOn && monthlyImpact > 0 ? 'warn' : ''}`}>
          {isOn
            ? monthlyImpact > 0 ? `✓ Activated — earning ${fmt(monthlyImpact)}/mo extra` : '✓ Activated'
            : monthlyImpact > 0
              ? `⚠ Not activated — missing ${fmt(monthlyImpact)}/mo`
              : 'Activate to earn 5x on qualifying categories'}
        </div>
      </div>
      <div className="toggle-wrap">
        <span className="toggle-label">{isOn ? 'On' : 'Off'}</span>
        <label className="toggle-switch">
          <input type="checkbox" checked={isOn} onChange={onToggle} />
          <span className="toggle-slider" />
        </label>
      </div>
    </div>
  );
}
