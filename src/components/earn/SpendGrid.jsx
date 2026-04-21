import { useState } from 'react';
import { CARDS, CATEGORIES, REDEMPTION_STYLES } from '../../data/cards';
import { getEffectiveRate, fmt } from '../../utils/calculations';

function shortName(n) {
  return n.replace('Chase ', '').replace('American Express ', 'Amex ').replace('Capital One ', '');
}

function getBestCard(catId, amount, ownedCards, activationStatus) {
  let best = ownedCards[0], bestRate = 0;
  for (const cid of ownedCards) {
    const card = CARDS.find(c => c.id === cid);
    if (!card) continue;
    const r = getEffectiveRate(card, catId, activationStatus, parseFloat(amount) || 0);
    if (r > bestRate) { bestRate = r; best = cid; }
  }
  return best;
}

export default function SpendGrid({ categoryEntries, ownedCards, activationStatus, redeemStyle, onChange }) {
  const [splitOpen, setSplitOpen] = useState(new Set());
  const rdStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);

  const toggleSplit = (catId) => {
    setSplitOpen(prev => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  };

  return (
    <div className="spend-grid">
      {CATEGORIES.map(cat => {
        const entries = categoryEntries[cat.id] || [];
        const total = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const isSplit = entries.length > 1;
        const isOpen = splitOpen.has(cat.id);
        const singleAmount = !isSplit ? (entries[0]?.amount ?? '') : '';
        const currentEntries = entries.length > 0 ? entries : [{ cardId: ownedCards[0] || '', amount: '' }];

        return (
          <div key={cat.id} className={`spend-grid-cell${isOpen ? ' expanded' : ''}`}>
            <div className="spend-grid-row">
              <span className="spend-grid-icon">{cat.icon}</span>
              <span className="spend-grid-label">{cat.label}</span>
              <div className="spend-grid-input-wrap">
                <span className="spend-grid-dollar">$</span>
                <input
                  className="spend-grid-input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={isSplit ? (total || '') : singleAmount}
                  readOnly={isSplit}
                  onChange={e => {
                    if (isSplit) return;
                    const best = getBestCard(cat.id, e.target.value, ownedCards, activationStatus);
                    onChange(cat.id, [{ cardId: best, amount: e.target.value }]);
                  }}
                />
              </div>
              {ownedCards.length > 1 && (
                <button
                  className={`spend-grid-split-btn${isOpen ? ' active' : ''}`}
                  onClick={() => toggleSplit(cat.id)}
                  title={isOpen ? 'Collapse' : 'Split across cards'}
                >
                  {!isOpen && isSplit ? `${entries.length} cards` : isOpen ? '▲' : 'split'}
                </button>
              )}
            </div>

            {isOpen && (
              <div className="spend-grid-split-panel">
                {currentEntries.map((entry, i) => {
                  const card = CARDS.find(c => c.id === entry.cardId);
                  const amt = parseFloat(entry.amount) || 0;
                  const rate = card ? getEffectiveRate(card, cat.id, activationStatus, amt) : 0;
                  const val = card ? (rdStyle?.valuations[card.issuer] || 1.0) / 100 : 0;
                  const earnings = amt * rate * val;

                  const updateEntry = (field, value) => {
                    const next = currentEntries.map((e, idx) => idx === i ? { ...e, [field]: value } : e);
                    onChange(cat.id, next);
                  };
                  const removeEntry = () => {
                    const next = currentEntries.filter((_, idx) => idx !== i);
                    onChange(cat.id, next.length ? next : [{ cardId: ownedCards[0] || '', amount: '' }]);
                  };

                  return (
                    <div key={i} className="spend-split-row">
                      <select
                        className="spend-split-select"
                        value={entry.cardId}
                        onChange={e => updateEntry('cardId', e.target.value)}
                      >
                        {ownedCards.map(cid => {
                          const c = CARDS.find(x => x.id === cid);
                          return c ? <option key={cid} value={cid}>{shortName(c.name)}</option> : null;
                        })}
                      </select>
                      <div className="spend-split-amount-wrap">
                        <span className="spend-grid-dollar">$</span>
                        <input
                          className="spend-split-input"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={entry.amount}
                          onChange={e => updateEntry('amount', e.target.value)}
                        />
                      </div>
                      {card && amt > 0 && (
                        <span className="spend-split-rate">
                          {Number.isInteger(rate) ? rate : rate.toFixed(1)}x = {fmt(earnings)}/mo
                        </span>
                      )}
                      {currentEntries.length > 1 && (
                        <button className="spend-split-remove" onClick={removeEntry} title="Remove">✕</button>
                      )}
                    </div>
                  );
                })}
                <button
                  className="spend-split-add"
                  onClick={() => onChange(cat.id, [...currentEntries, { cardId: ownedCards[0] || '', amount: '' }])}
                >
                  + Add card
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
