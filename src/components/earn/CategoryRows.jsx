import { CARDS, REDEMPTION_STYLES } from '../../data/cards';
import { getEffectiveRate, fmt } from '../../utils/calculations';

export const CAT_ICONS = {
  dining:'🍽️', groceries:'🛒', flights:'✈️', travel:'🏨', gas:'⛽',
  shopping:'🛍️', subscriptions:'📱', entertainment:'🎬', other:'💳',
};

// ─── Shared entry badge ───────────────────────────────────────────────────────
function EntryBadge({ card, catId, activationStatus, amount, rdStyle }) {
  const rate = getEffectiveRate(card, catId, activationStatus, parseFloat(amount) || 0);
  const val = (rdStyle?.valuations[card.issuer] || 1.0) / 100;
  const earnings = (parseFloat(amount) || 0) * rate * val;
  const isUnactivated =
    card.rotating?.isRotating &&
    card.rotating.currentQuarter?.categories.includes(catId) &&
    !activationStatus[card.id];

  if (isUnactivated) {
    return <span className="earn-entry-rate warn">{Number.isInteger(rate) ? rate : rate.toFixed(1)}x ⚠ not activated</span>;
  }
  return (
    <>
      <span className="earn-entry-rate">{Number.isInteger(rate) ? rate : rate.toFixed(1)}x</span>
      <span className="earn-entry-earnings">= {fmt(earnings)}/mo</span>
    </>
  );
}

// ─── Category row — manual / editable ────────────────────────────────────────
export function EditableCategoryRow({ cat, entries, ownedCards, activationStatus, redeemStyle, onChange }) {
  const rdStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
  const totalAssigned = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  let bestRate = 0, bestCardId = null;
  for (const cid of ownedCards) {
    const card = CARDS.find(c => c.id === cid);
    if (!card) continue;
    const r = getEffectiveRate(card, cat.id, activationStatus, totalAssigned);
    if (r > bestRate) { bestRate = r; bestCardId = cid; }
  }

  const updateEntry = (i, field, value) => {
    const next = entries.map((e, idx) => idx === i ? { ...e, [field]: value } : e);
    onChange(next);
  };
  const removeEntry = (i) => onChange(entries.filter((_, idx) => idx !== i));
  const addEntry = () => onChange([...entries, { cardId: ownedCards[0] || '', amount: '' }]);

  return (
    <div className="earn-cat-row">
      <div className="earn-cat-header">
        <span className="earn-cat-name">{CAT_ICONS[cat.id]} {cat.label}</span>
        <span className="earn-cat-total">{totalAssigned > 0 ? `${fmt(totalAssigned)}/mo` : '—'}</span>
      </div>

      <div className="earn-cat-entries">
        {entries.map((entry, i) => {
          const card = CARDS.find(c => c.id === entry.cardId);
          const amount = parseFloat(entry.amount) || 0;
          const isOptimal = card && entry.cardId === bestCardId;
          const bestCard = CARDS.find(c => c.id === bestCardId);
          const bestVal = bestCard ? (rdStyle?.valuations[bestCard.issuer] || 1.0) / 100 : 0;
          const cardVal = card ? (rdStyle?.valuations[card.issuer] || 1.0) / 100 : 0;
          const cardRate = card ? getEffectiveRate(card, cat.id, activationStatus, amount) : 1;
          const monthlyGap = (!isOptimal && amount > 0 && bestCard)
            ? (amount * bestRate * bestVal) - (amount * cardRate * cardVal)
            : 0;

          return (
            <div key={i} className={`earn-entry-row editable ${isOptimal ? 'optimal' : monthlyGap > 0.5 ? 'suboptimal' : ''}`}>
              <select
                className="earn-entry-select"
                value={entry.cardId}
                onChange={e => updateEntry(i, 'cardId', e.target.value)}
              >
                {ownedCards.map(cid => {
                  const c = CARDS.find(x => x.id === cid);
                  return c ? <option key={cid} value={cid}>{c.name.replace('Chase ', '').replace('American Express ', 'Amex ').replace('Capital One ', '')}</option> : null;
                })}
              </select>
              <div className="earn-entry-amount-wrap">
                <span className="earn-entry-dollar">$</span>
                <input
                  className="earn-entry-input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={entry.amount}
                  onChange={e => updateEntry(i, 'amount', e.target.value)}
                />
              </div>
              <div className="earn-entry-right">
                {card && <EntryBadge card={card} catId={cat.id} activationStatus={activationStatus} amount={entry.amount} rdStyle={rdStyle} />}
                {isOptimal && <span className="earn-entry-optimal">✓ best</span>}
                {!isOptimal && monthlyGap > 0.5 && bestCard && (
                  <span className="earn-entry-gap">+{fmt(monthlyGap)}/mo with {bestCard.name.split(' ').pop()}</span>
                )}
              </div>
              {entries.length > 1 && (
                <button className="earn-entry-remove" onClick={() => removeEntry(i)} title="Remove">✕</button>
              )}
            </div>
          );
        })}
        {ownedCards.length > 0 && (
          <button className="earn-add-card" onClick={addEntry}>+ Add card</button>
        )}
      </div>
    </div>
  );
}

// ─── Category row (Plaid mode — read-only) ────────────────────────────────────
export function CategoryRow({ cat, entries, ownedCards, activationStatus, redeemStyle }) {
  const rdStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
  const totalSpend = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  if (!totalSpend) return null;

  let bestRate = 0, bestCardId = null;
  for (const cid of ownedCards) {
    const card = CARDS.find(c => c.id === cid);
    if (!card) continue;
    const r = getEffectiveRate(card, cat.id, activationStatus, totalSpend);
    if (r > bestRate) { bestRate = r; bestCardId = cid; }
  }

  return (
    <div className="earn-cat-row">
      <div className="earn-cat-header">
        <span className="earn-cat-name">{CAT_ICONS[cat.id]} {cat.label}</span>
        <span className="earn-cat-total">{fmt(totalSpend)}/mo</span>
      </div>
      <div className="earn-cat-entries">
        {entries.map((entry, i) => {
          const card = CARDS.find(c => c.id === entry.cardId);
          if (!card) return null;
          const amount = parseFloat(entry.amount) || 0;
          const rate = getEffectiveRate(card, cat.id, activationStatus, amount);
          const val = (rdStyle?.valuations[card.issuer] || 1.0) / 100;
          const monthlyEarnings = amount * rate * val;
          const isOptimal = entry.cardId === bestCardId;
          const bestCard = CARDS.find(c => c.id === bestCardId);
          const bestVal = bestCard ? (rdStyle?.valuations[bestCard.issuer] || 1.0) / 100 : val;
          const monthlyGap = !isOptimal ? (amount * bestRate * bestVal) - monthlyEarnings : 0;
          const isUnactivated =
            card.rotating?.isRotating &&
            card.rotating.currentQuarter?.categories.includes(cat.id) &&
            !activationStatus[card.id];

          return (
            <div key={i} className={`earn-entry-row ${isOptimal ? 'optimal' : monthlyGap > 0.5 ? 'suboptimal' : ''}`}>
              <div className="earn-entry-left">
                <span className="earn-entry-card">
                  {card.name.replace('Chase ', '').replace('American Express ', 'Amex ').replace('Capital One ', '')}
                </span>
                {isUnactivated && <span className="earn-entry-warn">⚠ bonus not activated</span>}
              </div>
              <div className="earn-entry-right">
                <span className="earn-entry-amount">{fmt(amount)}/mo</span>
                <span className="earn-entry-rate">{Number.isInteger(rate) ? rate : rate.toFixed(1)}x</span>
                <span className="earn-entry-earnings">= {fmt(monthlyEarnings)}/mo</span>
                {!isOptimal && monthlyGap > 0.5 && bestCard && (
                  <span className="earn-entry-gap">
                    → use {bestCard.name.replace('Chase ', '').replace('American Express ', 'Amex ').replace('Capital One ', '')} +{fmt(monthlyGap)}/mo
                  </span>
                )}
                {isOptimal && <span className="earn-entry-optimal">✓</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
