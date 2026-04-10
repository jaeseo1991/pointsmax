import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CARDS, CATEGORIES, STATEMENT_CREDITS, REDEMPTION_STYLES, WALLET_TIERS } from '../data/cards';
import {
  calculateWalletEarnings,
  calculateEffectiveFee,
  calculateBreakeven,
  generateCumulativeData,
  getEffectiveRate,
  fmt,
} from '../utils/calculations';

// ─── Step icons ───────────────────────────────────────────────────────────────
const CAT_ICONS = { dining:'🍽️', groceries:'🛒', travel:'✈️', gas:'⛽', shopping:'🛍️', subscriptions:'📱', entertainment:'🎬', other:'💳' };
const TOP_RATES = {
  cfu: ['dining: 3x', 'all else: 1.5x'], cdc: ['everything: 2x'],
  csp: ['dining: 3x', 'travel: 2x'], csr: ['travel: 10x', 'dining: 3x'],
  amex_gold: ['dining: 4x', 'groceries: 4x', 'travel: 3x'], amex_plat: ['travel: 5x'],
  amex_bcp: ['groceries: 6x', 'subscriptions: 6x', 'gas: 3x'],
  cf: ['rotating 5x (Q2: travel, dining, subs)', '1x base'],
  discover: ['rotating 5x (Q2: shopping, groceries, subs)', '1x base'],
  wfac: ['everything: 2x'], co_venture: ['travel: 5x', 'all else: 2x'],
  usb_cash_plus: ['dining: 5x', 'subscriptions: 5x', 'groceries: 2x'],
  robinhood_gold: ['everything: 3x'],
  amazon_prime: ['shopping: 5x', 'groceries: 5x', 'dining: 2x', 'gas: 2x'],
  apple_card: ['shopping: 3x', 'subscriptions: 3x', 'all else: 2x'],
  bilt: ['dining: 3x', 'travel: 2x', 'rent: 1x (no fee)'],
};
const REDEEM_ICONS = { cashout:'💵', portal:'🖥️', transfer:'🤝', expert:'🧠' };
const STEPS = ['Spending', 'Cards', 'Eligibility', 'Credits', 'Redemption'];

// ─── Step 1: Spend ────────────────────────────────────────────────────────────
const SPEND_PRESETS = [
  {
    id: 'average',
    label: 'Average American',
    icon: '🇺🇸',
    spend: { dining: 350, groceries: 450, travel: 150, gas: 200, shopping: 250, subscriptions: 50, entertainment: 100, other: 100 },
  },
  {
    id: 'city',
    label: 'City Renter',
    icon: '🏙️',
    spend: { dining: 600, groceries: 300, travel: 300, gas: 30, shopping: 300, subscriptions: 80, entertainment: 200, other: 100 },
  },
  {
    id: 'traveler',
    label: 'Frequent Traveler',
    icon: '✈️',
    spend: { dining: 400, groceries: 200, travel: 800, gas: 100, shopping: 200, subscriptions: 60, entertainment: 100, other: 100 },
  },
  {
    id: 'family',
    label: 'Family',
    icon: '👨‍👩‍👧',
    spend: { dining: 300, groceries: 800, travel: 200, gas: 300, shopping: 400, subscriptions: 100, entertainment: 150, other: 200 },
  },
];

function StepSpend({ local, setLocal, onNext }) {
  const spend = local.spend;
  const total = Object.values(spend).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const applyPreset = (preset) => {
    const s = {};
    for (const cat of Object.keys(spend)) s[cat] = String(preset.spend[cat] || 0);
    setLocal(l => ({ ...l, spend: s }));
  };
  return (
    <>
      <h2 className="step-heading">Monthly Spending</h2>
      <p className="step-subheading">Enter your average monthly spend, or start with a profile.</p>
      <div className="spend-presets">
        {SPEND_PRESETS.map(p => (
          <button key={p.id} className="spend-preset-btn" onClick={() => applyPreset(p)}>
            <span className="preset-icon">{p.icon}</span>
            <span className="preset-label">{p.label}</span>
          </button>
        ))}
      </div>
      <div className="spend-grid">
        {CATEGORIES.map(cat => (
          <div className="spend-field" key={cat.id}>
            <label><span className="category-icon">{CAT_ICONS[cat.id]}</span>{cat.label}</label>
            <div className="input-wrap">
              <span>$</span>
              <input type="number" min="0" placeholder="0" value={spend[cat.id]}
                onChange={e => setLocal(l => ({ ...l, spend: { ...l.spend, [cat.id]: e.target.value } }))} />
            </div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="spend-summary">
          <span className="label">Total monthly spend</span>
          <span className="total">{fmt(total)}</span>
        </div>
      )}
      <div className="wizard-nav">
        <div />
        <button className="btn btn-primary" onClick={onNext}>Next: Pick Cards →</button>
      </div>
    </>
  );
}

// ─── Step 2: Cards ────────────────────────────────────────────────────────────
const BANK_GROUPS = [
  { issuer: 'Chase',      label: 'Chase',             color: '#1a6bab' },
  { issuer: 'Amex',       label: 'American Express',  color: '#c8992a' },
  { issuer: 'Citi',       label: 'Citi',              color: '#c41230' },
  { issuer: 'CapitalOne', label: 'Capital One',        color: '#d03027' },
  { issuer: 'Discover',   label: 'Discover',           color: '#ff6500' },
  { issuer: 'WellsFargo', label: 'Wells Fargo',        color: '#cf0a2c' },
  { issuer: 'USBank',     label: 'U.S. Bank',          color: '#0051a5' },
  { issuer: 'Robinhood',  label: 'Robinhood',          color: '#00c805' },
  { issuer: 'Apple',      label: 'Apple',              color: '#1d1d1f' },
  { issuer: 'Bilt',       label: 'Bilt',               color: '#1a1a2e' },
];

function StepCards({ local, setLocal, onNext, onBack }) {
  const owned = local.ownedCards;
  const toggle = id => setLocal(l => ({
    ...l,
    ownedCards: l.ownedCards.includes(id) ? l.ownedCards.filter(c => c !== id) : [...l.ownedCards, id],
  }));
  const totalFee = CARDS.filter(c => owned.includes(c.id)).reduce((s, c) => s + c.annualFee, 0);

  return (
    <>
      <h2 className="step-heading">Your Cards</h2>
      <p className="step-subheading">Select all credit cards you currently own.</p>

      {BANK_GROUPS.map(bank => {
        const bankCards = CARDS.filter(c => c.issuer === bank.issuer);
        if (bankCards.length === 0) return null;
        const allSelected = bankCards.every(c => owned.includes(c.id));
        const someSelected = bankCards.some(c => owned.includes(c.id));
        return (
          <div key={bank.issuer} className="bank-group">
            <div className="bank-group-header">
              <div className="bank-group-title">
                <span className="bank-dot" style={{ background: bank.color }} />
                {bank.label}
              </div>
              <button
                className={`bank-select-all ${allSelected ? 'active' : someSelected ? 'partial' : ''}`}
                onClick={() => setLocal(l => {
                  const ids = bankCards.map(c => c.id);
                  const next = allSelected
                    ? l.ownedCards.filter(id => !ids.includes(id))
                    : [...new Set([...l.ownedCards, ...ids])];
                  return { ...l, ownedCards: next };
                })}
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="card-grid">
              {bankCards.map(card => (
                <button key={card.id} className={`card-option ${owned.includes(card.id) ? 'selected' : ''}`} onClick={() => toggle(card.id)}>
                  <div className="card-check" />
                  <div className="card-color-bar" style={{ background: card.color }} />
                  <div className="card-info">
                    <div className="card-name">{card.name}</div>
                    <div className="card-fee-row">
                      <span className={`card-fee-badge ${card.annualFee === 0 ? 'free' : 'paid'}`}>
                        {card.annualFee === 0 ? 'No fee' : `$${card.annualFee}/yr`}
                      </span>
                    </div>
                    <div className="card-rates">
                      {(TOP_RATES[card.id] || []).map(r => (
                        <span key={r} className={`rate-chip ${/[4-9]x|10x/.test(r) ? 'highlight' : ''}`}>{r}</span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {owned.length > 0 && (
        <div className="spend-summary" style={{ marginTop: 20 }}>
          <span className="label">{owned.length} card{owned.length !== 1 ? 's' : ''} selected</span>
          <span className="total" style={{ fontSize: 16 }}>${totalFee}/yr in fees</span>
        </div>
      )}
      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Next: Eligibility →</button>
      </div>
    </>
  );
}

// ─── Step 3: Eligibility ──────────────────────────────────────────────────────
const AMEX_CARDS = CARDS.filter(c => c.issuer === 'Amex');
function StepEligibility({ local, setLocal, onNext, onBack }) {
  const { cards24months, amexCount, heldCards } = local;
  const set = (key, val) => setLocal(l => ({ ...l, [key]: val }));
  const toggleHeld = id => setLocal(l => ({
    ...l,
    heldCards: l.heldCards.includes(id) ? l.heldCards.filter(c => c !== id) : [...l.heldCards, id],
  }));
  return (
    <>
      <h2 className="step-heading">Eligibility Check</h2>
      <p className="step-subheading">Help us filter out cards you're not eligible for.</p>
      <div className="eligibility-grid">
        <div className="field-group">
          <label>Cards opened in last 24 months<span className="hint"> (Chase 5/24 rule)</span></label>
          <select value={cards24months} onChange={e => set('cards24months', parseInt(e.target.value))}>
            {[0,1,2,3,4,5,6].map(v => <option key={v} value={v}>{v === 6 ? '6+' : v}</option>)}
          </select>
          {cards24months >= 5 && <span style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>Over 5/24 — Chase cards unavailable</span>}
        </div>
        <div className="field-group">
          <label>Open Amex cards currently<span className="hint"> (5-card max)</span></label>
          <select value={amexCount} onChange={e => set('amexCount', parseInt(e.target.value))}>
            {[0,1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {amexCount >= 5 && <span style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>At limit — no new Amex cards</span>}
        </div>
      </div>
      <div className="chips-section">
        <div className="chips-label">
          Amex cards you've held before
          <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400, marginLeft: 8 }}>(affects welcome bonus — once per lifetime)</span>
        </div>
        <div className="chips-grid">
          {AMEX_CARDS.map(card => (
            <button key={card.id} className={`chip ${heldCards.includes(card.id) ? 'selected' : ''}`} onClick={() => toggleHeld(card.id)}>
              {card.name.replace('Amex ', '')}
            </button>
          ))}
        </div>
      </div>
      {cards24months >= 2 && (
        <div className="eligibility-note">
          💡 With {cards24months} cards opened in the last 24 months, Chase cards may require more scrutiny (5/24 rule applies at 5+).
        </div>
      )}
      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Next: Credits →</button>
      </div>
    </>
  );
}

// ─── Step 4: Credits ──────────────────────────────────────────────────────────
function StepCredits({ local, setLocal, onNext, onBack }) {
  const { selectedCredits, ownedCards } = local;
  const relevantCards = CARDS.filter(c => ownedCards.includes(c.id) && STATEMENT_CREDITS[c.id]);

  const toggle = (cardId, creditId) => {
    const current = selectedCredits[cardId] || [];
    const next = current.includes(creditId) ? current.filter(x => x !== creditId) : [...current, creditId];
    setLocal(l => ({ ...l, selectedCredits: { ...l.selectedCredits, [cardId]: next } }));
  };

  const selectAll = (cardId) => {
    const allIds = (STATEMENT_CREDITS[cardId] || []).map(c => c.id);
    setLocal(l => ({ ...l, selectedCredits: { ...l.selectedCredits, [cardId]: allIds } }));
  };

  const deselectAll = (cardId) => {
    setLocal(l => ({ ...l, selectedCredits: { ...l.selectedCredits, [cardId]: [] } }));
  };

  const isSelected = (cardId, creditId) => (selectedCredits[cardId] || []).includes(creditId);

  const getEffective = (card) => {
    const credits = STATEMENT_CREDITS[card.id] || [];
    const selected = selectedCredits[card.id] || [];
    const creditSum = credits.filter(c => selected.includes(c.id)).reduce((s, c) => s + c.value, 0);
    return Math.max(0, card.annualFee - creditSum);
  };

  const totalCreditValue = Object.entries(selectedCredits).reduce((sum, [cardId, ids]) => {
    const credits = STATEMENT_CREDITS[cardId] || [];
    return sum + credits.filter(c => ids.includes(c.id)).reduce((s, c) => s + c.value, 0);
  }, 0);

  const totalBaseFee = relevantCards.reduce((s, c) => s + c.annualFee, 0);

  return (
    <>
      <h2 className="step-heading">Statement Credits</h2>
      <p className="step-subheading">Check the credits you actually use — they reduce your effective annual fee.</p>
      {relevantCards.length === 0 ? (
        <div className="eligibility-note" style={{ marginBottom: 24 }}>None of your selected cards have statement credits. Click Next to continue.</div>
      ) : (
        relevantCards.map(card => {
          const credits = STATEMENT_CREDITS[card.id] || [];
          const selected = selectedCredits[card.id] || [];
          const allSelected = credits.every(c => selected.includes(c.id));
          const effectiveFee = getEffective(card);
          const creditSum = card.annualFee - effectiveFee;

          return (
            <div className="credits-section" key={card.id}>
              <div className="credits-card-header">
                <div>
                  <span className="credits-card-name">{card.name}</span>
                  <div className="credits-fee-calc">
                    <span className="credits-fee-base">${card.annualFee}</span>
                    {creditSum > 0 && (
                      <>
                        <span className="credits-fee-minus"> − ${creditSum} credits</span>
                        <span className="credits-fee-equals"> = </span>
                        <span className="credits-fee-effective">${effectiveFee} effective fee</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  className={`credits-select-all ${allSelected ? 'active' : ''}`}
                  onClick={() => allSelected ? deselectAll(card.id) : selectAll(card.id)}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="credits-list">
                {credits.map(credit => (
                  <button key={credit.id} className={`credit-item ${isSelected(card.id, credit.id) ? 'selected' : ''}`} onClick={() => toggle(card.id, credit.id)}>
                    <div className="credit-checkbox" />
                    <div className="credit-details">
                      <div className="credit-name">{credit.label}</div>
                      <div className="credit-desc">{credit.description}</div>
                    </div>
                    <div className="credit-value">−${credit.value}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}
      {totalCreditValue > 0 && (
        <div className="credits-total">
          <span className="label">
            ${totalBaseFee} total fees − ${totalCreditValue} credits
          </span>
          <span className="value">${totalBaseFee - totalCreditValue} effective</span>
        </div>
      )}
      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Next: Redemption →</button>
      </div>
    </>
  );
}

// ─── Step 5: Redemption ───────────────────────────────────────────────────────
function StepRedemption({ local, setLocal, onNext, onBack }) {
  const selected = local.redeemStyle;
  return (
    <>
      <h2 className="step-heading">Redemption Style</h2>
      <p className="step-subheading">How you redeem determines how we value your points.</p>
      <div className="redemption-grid">
        {REDEMPTION_STYLES.map(style => {
          const isSelected = selected === style.id;
          return (
            <button key={style.id} className={`redemption-option ${isSelected ? 'selected' : ''}`}
              onClick={() => setLocal(l => ({ ...l, redeemStyle: style.id }))}>
              <div className="redemption-label">
                <span className="redemption-dot" />
                <span>{REDEEM_ICONS[style.id]} {style.label}</span>
              </div>
              <div className="redemption-desc">{style.description}</div>
              <div className="redemption-vals">
                {['Chase', 'Amex', 'Citi', 'CapitalOne'].map(issuer => (
                  style.valuations[issuer] ? (
                    <div key={issuer} className="redemption-val">
                      <span className="issuer">{issuer}</span>
                      <span className="val">{style.valuations[issuer]}¢/pt</span>
                    </div>
                  ) : null
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-success" onClick={onNext} disabled={!selected}
          style={{ opacity: selected ? 1 : 0.5, cursor: selected ? 'pointer' : 'not-allowed' }}>
          See My Results →
        </button>
      </div>
    </>
  );
}

// ─── Annual Bar Chart ─────────────────────────────────────────────────────────
function AnnualBarChart({ freeData, tierData, tierName, welcomeBonus = 0 }) {
  const [hoverYear, setHoverYear] = useState(null);

  const W = 560, H = 220;
  const padL = 60, padR = 20, padT = 24, padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Year-end cumulative values (index 11, 23, 35, 47, 59)
  const years = [1, 2, 3, 4, 5];
  const freeYr = years.map(y => freeData[y * 12 - 1] || 0);
  const tierYr = years.map(y => tierData[y * 12 - 1] || 0);
  // Welcome bonus contribution only in year 1 on tier side
  const tierBase = years.map((y, i) => tierYr[i] - (i === 0 ? welcomeBonus : 0));

  const maxVal = Math.max(...freeYr, ...tierYr, 0);
  const minVal = Math.min(...freeYr, ...tierYr, 0);
  const range = maxVal - minVal || 1;

  const yOf = v => padT + plotH - ((v - minVal) / range) * plotH;
  const zeroY = yOf(0);

  // Bar layout: 5 groups, 2 bars each + gap
  const groupW = plotW / 5;
  const barW = groupW * 0.32;
  const groupX = i => padL + i * groupW + groupW / 2;
  const freeX = i => groupX(i) - barW - 2;
  const tierX = i => groupX(i) + 2;

  const barH = (v) => Math.abs(yOf(v) - zeroY);
  const barY = (v) => v >= 0 ? yOf(v) : zeroY;

  // Breakeven: first year where tier cumulative > free cumulative
  const breakevenYear = years.find((y, i) => tierYr[i] > freeYr[i]);

  // Y axis ticks
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount }, (_, i) => minVal + (range / (tickCount - 1)) * i);

  const fmtK = v => Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`;

  // Plain-English summary
  const yr5Adv = tierYr[4] - freeYr[4];
  const yr1Diff = tierYr[0] - freeYr[0];
  const annualAdv = (tierData[59] - freeData[59] - welcomeBonus) / 5; // steady-state annual advantage

  return (
    <div>
      {/* Plain-English callout */}
      <div className="chart-callout">
        {welcomeBonus > 0 && (
          <div className="chart-callout-bonus">
            <span className="chart-callout-bonus-dot" />
            <strong>{fmtK(welcomeBonus)}</strong> welcome bonus boosts Year 1
          </div>
        )}
        <div className="chart-callout-lines">
          {annualAdv > 0 ? (
            <span>Earns <strong>{fmtK(annualAdv)}/yr more</strong> than Free Wallet after Year 1</span>
          ) : (
            <span>Earns <strong>{fmtK(Math.abs(annualAdv))}/yr less</strong> than Free Wallet on an ongoing basis</span>
          )}
          {breakevenYear ? (
            <span> · Ahead by <strong>Year {breakevenYear}</strong></span>
          ) : (
            <span> · <strong>Doesn't surpass</strong> Free Wallet within 5 years at this spend</span>
          )}
          {yr5Adv !== 0 && (
            <span> · <strong>{yr5Adv > 0 ? '+' : ''}{fmtK(yr5Adv)}</strong> cumulative vs Free over 5 years</span>
          )}
        </div>
      </div>

      {/* SVG bar chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHoverYear(null)}
      >
        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <line key={i} x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)}
            stroke="var(--gray-100)" strokeWidth="1" />
        ))}

        {/* Zero baseline */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY}
          stroke="var(--gray-300)" strokeWidth="1" />

        {/* Bars */}
        {years.map((yr, i) => {
          const fv = freeYr[i];
          const tv = tierYr[i];
          const base = tierBase[i];
          const wb = i === 0 ? welcomeBonus : 0;
          const isBreakeven = yr === breakevenYear;
          const isHover = hoverYear === i;

          return (
            <g key={yr}
              onMouseEnter={() => setHoverYear(i)}
              style={{ cursor: 'default' }}>
              {/* Hover highlight */}
              {isHover && (
                <rect
                  x={freeX(i) - 4} y={padT - 4}
                  width={barW * 2 + 12} height={plotH + 8}
                  fill="var(--gray-50)" rx="4"
                />
              )}

              {/* Free bar */}
              <rect
                x={freeX(i)} y={barY(fv)}
                width={barW} height={Math.max(2, barH(fv))}
                fill={isHover ? 'var(--gray-400)' : 'var(--gray-300)'}
                rx="3"
              />

              {/* Tier bar — base earnings */}
              <rect
                x={tierX(i)} y={barY(Math.max(0, base))}
                width={barW} height={Math.max(2, barH(Math.max(0, base)))}
                fill={tv > fv ? 'var(--color-success)' : '#94a3b8'}
                rx="3"
              />

              {/* Tier bar — welcome bonus stacked on top */}
              {wb > 0 && base >= 0 && (
                <rect
                  x={tierX(i)} y={yOf(base + wb)}
                  width={barW} height={barH(wb)}
                  fill="#6366f1"
                  rx="3"
                />
              )}

              {/* Breakeven year badge */}
              {isBreakeven && (
                <>
                  <rect x={groupX(i) - 28} y={padT - 20} width={56} height={16} rx="8" fill="#f59e0b" />
                  <text x={groupX(i)} y={padT - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill="white">
                    BREAKEVEN
                  </text>
                </>
              )}

              {/* Year label */}
              <text x={groupX(i)} y={H - padB + 14}
                textAnchor="middle" fontSize="11" fill="var(--gray-500)" fontWeight="500">
                Yr {yr}
              </text>

              {/* Hover tooltip */}
              {isHover && (() => {
                const adv = tv - fv;
                const tx = i < 3 ? freeX(i) - 4 : freeX(i) - 100;
                const ty = padT;
                return (
                  <g>
                    <rect x={tx} y={ty} width={120} height={wb > 0 ? 80 : 64} rx="6"
                      fill="white" stroke="var(--gray-200)" strokeWidth="1"
                      style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.10))' }} />
                    <text x={tx + 10} y={ty + 15} fontSize="11" fontWeight="700" fill="var(--gray-700)">Year {yr} cumulative</text>
                    <text x={tx + 10} y={ty + 30} fontSize="10" fill="var(--gray-500)">Free: <tspan fill="var(--gray-700)" fontWeight="600">{fmtK(fv)}</tspan></text>
                    <text x={tx + 10} y={ty + 44} fontSize="10" fill="var(--gray-500)">{tierName}: <tspan fill={tv > fv ? 'var(--color-success)' : '#dc2626'} fontWeight="600">{fmtK(tv)}</tspan></text>
                    {wb > 0 && <text x={tx + 10} y={ty + 58} fontSize="10" fill="#6366f1">incl. {fmtK(wb)} bonus</text>}
                    <text x={tx + 10} y={ty + (wb > 0 ? 72 : 58)} fontSize="10" fontWeight="700"
                      fill={adv >= 0 ? 'var(--color-success)' : '#dc2626'}>
                      {adv >= 0 ? '▲' : '▼'} {fmtK(Math.abs(adv))} vs Free
                    </text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Y axis labels */}
        {yTicks.map((v, i) => (
          <text key={i} x={padL - 6} y={yOf(v) + 4}
            textAnchor="end" fontSize="10" fill="var(--gray-400)">
            {fmtK(v)}
          </text>
        ))}

        {/* Legend */}
        <rect x={padL} y={H - 10} width={12} height={10} fill="var(--gray-300)" rx="2" />
        <text x={padL + 16} y={H - 1} fontSize="10" fill="var(--gray-500)">Free Wallet</text>
        <rect x={padL + 88} y={H - 10} width={12} height={10} fill="var(--color-success)" rx="2" />
        <text x={padL + 104} y={H - 1} fontSize="10" fill="var(--gray-500)">{tierName}</text>
        {welcomeBonus > 0 && (
          <>
            <rect x={padL + 88 + (tierName.length * 6) + 20} y={H - 10} width={12} height={10} fill="#6366f1" rx="2" />
            <text x={padL + 88 + (tierName.length * 6) + 36} y={H - 1} fontSize="10" fill="var(--gray-500)">Welcome bonus</text>
          </>
        )}
      </svg>

      <p className="chart-assumption-note">Assumes optimal card selection per category within each wallet.</p>

      {/* Year-by-year table */}
      <table className="chart-year-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Free Wallet</th>
            <th>{tierName}</th>
            <th>Advantage</th>
          </tr>
        </thead>
        <tbody>
          {years.map((yr, i) => {
            const adv = tierYr[i] - freeYr[i];
            return (
              <tr key={yr}>
                <td>Yr {yr}</td>
                <td>{fmtK(freeYr[i])}</td>
                <td style={{ color: tierYr[i] > freeYr[i] ? 'var(--color-success)' : '#dc2626', fontWeight: 600 }}>
                  {fmtK(tierYr[i])}
                  {i === 0 && welcomeBonus > 0 && (
                    <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 4 }}>+{fmtK(welcomeBonus)} bonus</span>
                  )}
                </td>
                <td style={{ color: adv >= 0 ? 'var(--color-success)' : '#dc2626', fontWeight: 700 }}>
                  {adv >= 0 ? '+' : ''}{fmtK(adv)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Old cumulative chart kept for reference (unused) ─────────────────────────
function FiveYearChart({ freeData, tierData, breakeven, tierName, welcomeBonus = 0 }) {
  const [hoverMonth, setHoverMonth] = useState(null);
  const svgRef = useRef(null);

  const W = 580, H = 230;
  const padL = 68, padR = 24, padT = 22, padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allVals = [...freeData, ...tierData];
  const minY = Math.min(0, ...allVals);
  const maxY = Math.max(...allVals);
  const range = maxY - minY || 1;

  const xOf = m => padL + ((m - 1) / 59) * plotW;
  const yOf = v => padT + plotH - ((v - minY) / range) * plotH;

  const toPolyPts = data => data.map((v, i) => `${xOf(i + 1)},${yOf(v)}`).join(' ');

  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks }, (_, i) => minY + (range / (yTicks - 1)) * i);
  const yearEnds = [12, 24, 36, 48, 60];

  // Shaded gain area: polygon traces tier forward, free backward
  const gainPolygon = (() => {
    const fwd = tierData.map((v, i) => `${xOf(i + 1)},${yOf(v)}`).join(' ');
    const bwd = [...freeData].reverse().map((v, i) => `${xOf(60 - i)},${yOf(v)}`).join(' ');
    return `${fwd} ${bwd}`;
  })();

  // Hover: map SVG x → month
  const handleMouseMove = e => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const m = Math.max(1, Math.min(60, Math.round(((svgX - padL) / plotW) * 59) + 1));
    setHoverMonth(m);
  };

  const hFree = hoverMonth != null ? freeData[hoverMonth - 1] : null;
  const hTier = hoverMonth != null ? tierData[hoverMonth - 1] : null;
  const hAdv  = hFree != null ? hTier - hFree : null;
  const tooltipLeft = hoverMonth != null && hoverMonth > 40;
  const ttX = hoverMonth != null ? xOf(hoverMonth) : 0;

  const fmtK = v => v >= 1000 || v <= -1000
    ? `$${(v / 1000).toFixed(1)}k`
    : `$${Math.round(Math.abs(v))}`;
  const fmtS = v => v >= 0 ? `+${fmtK(v)}` : `-${fmtK(Math.abs(v))}`;

  // Year-end table data
  const yearRows = yearEnds.map(m => ({
    yr: m / 12,
    free: freeData[m - 1],
    tier: tierData[m - 1],
    adv: tierData[m - 1] - freeData[m - 1],
  }));

  // Summary stats
  const yr5Adv = tierData[59] - freeData[59];
  const yr1Tier = tierData[11];

  return (
    <div>
      {/* SVG chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverMonth(null)}
      >
        {/* Horizontal grid lines */}
        {yTickVals.map((v, i) => (
          <line key={i} x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)}
            stroke="var(--gray-200)" strokeWidth="1" />
        ))}

        {/* Zero baseline */}
        {minY < 0 && (
          <line x1={padL} y1={yOf(0)} x2={W - padR} y2={yOf(0)}
            stroke="var(--gray-300)" strokeWidth="1.5" strokeDasharray="4 3" />
        )}

        {/* Shaded gain area between lines */}
        <polygon points={gainPolygon}
          fill={yr5Adv >= 0 ? 'rgba(29,158,117,0.10)' : 'rgba(220,38,38,0.08)'}
          stroke="none" />

        {/* Breakeven vertical */}
        {breakeven && (() => {
          const bx = xOf(breakeven);
          const intY = (yOf(freeData[breakeven - 1]) + yOf(tierData[breakeven - 1])) / 2;
          const labelRight = breakeven < 42;
          return (
            <>
              <line x1={bx} y1={padT} x2={bx} y2={H - padB}
                stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 3" />
              <circle cx={bx} cy={intY} r="6"
                fill="#f59e0b" stroke="white" strokeWidth="2" />
              <rect x={labelRight ? bx + 8 : bx - 90} y={intY - 22}
                width="82" height="18" rx="4"
                fill="#fffbeb" stroke="#f59e0b" strokeWidth="1" />
              <text x={labelRight ? bx + 49 : bx - 49} y={intY - 9}
                textAnchor="middle" fontSize="10" fill="#92400e" fontWeight="700">
                Breakeven mo.{breakeven}
              </text>
            </>
          );
        })()}

        {/* Welcome bonus spike annotation at month 1 */}
        {welcomeBonus > 0 && (() => {
          const x1 = xOf(1);
          const y1t = yOf(tierData[0]);
          return (
            <>
              <line x1={x1} y1={y1t - 4} x2={x1} y2={y1t - 20}
                stroke="#6366f1" strokeWidth="1.5" />
              <rect x={x1 + 4} y={y1t - 30} width={72} height={16} rx="3"
                fill="#eef2ff" stroke="#6366f1" strokeWidth="1" />
              <text x={x1 + 40} y={y1t - 19}
                textAnchor="middle" fontSize="9" fill="#4338ca" fontWeight="600">
                +{fmtK(welcomeBonus)} bonus
              </text>
            </>
          );
        })()}

        {/* Free wallet line */}
        <polyline points={toPolyPts(freeData)}
          fill="none" stroke="var(--gray-400)" strokeWidth="2" strokeDasharray="6 4" />

        {/* Tier line */}
        <polyline points={toPolyPts(tierData)}
          fill="none" stroke="var(--color-success)" strokeWidth="2.5" />

        {/* Year-end dots + value labels */}
        {yearEnds.map(m => {
          const fv = freeData[m - 1];
          const tv = tierData[m - 1];
          const cx = xOf(m);
          const fAbove = fv > tv;
          const showLabel = m === 60; // only label Yr 5 end-of-line
          return (
            <g key={m}>
              <circle cx={cx} cy={yOf(fv)} r="3.5" fill="white" stroke="var(--gray-400)" strokeWidth="2" />
              <circle cx={cx} cy={yOf(tv)} r="3.5" fill="white" stroke="var(--color-success)" strokeWidth="2" />
              {showLabel && (
                <>
                  <text x={cx + 5} y={yOf(fv) + 4} fontSize="9" fill="var(--gray-500)" fontWeight="600">
                    {fmtK(fv)}
                  </text>
                  <text x={cx + 5} y={yOf(tv) + 4} fontSize="9" fill="var(--color-success)" fontWeight="700">
                    {fmtK(tv)}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Hover cursor + dots */}
        {hoverMonth != null && (
          <>
            <line x1={ttX} y1={padT} x2={ttX} y2={H - padB}
              stroke="var(--gray-300)" strokeWidth="1" />
            <circle cx={ttX} cy={yOf(hFree)} r="4"
              fill="var(--gray-400)" stroke="white" strokeWidth="1.5" />
            <circle cx={ttX} cy={yOf(hTier)} r="4"
              fill="var(--color-success)" stroke="white" strokeWidth="1.5" />
            {/* Tooltip box */}
            {(() => {
              const tw = 148, th = 68, tx = tooltipLeft ? ttX - tw - 10 : ttX + 10;
              const ty = padT + 4;
              const advColor = hAdv >= 0 ? 'var(--color-success)' : '#dc2626';
              const yr = (hoverMonth / 12).toFixed(1);
              return (
                <g>
                  <rect x={tx} y={ty} width={tw} height={th} rx="6"
                    fill="white" stroke="var(--gray-200)" strokeWidth="1"
                    style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.12))' }} />
                  <text x={tx + 10} y={ty + 16} fontSize="10" fontWeight="700" fill="var(--gray-700)">
                    Mo. {hoverMonth} (Yr {yr})
                  </text>
                  <line x1={tx + 8} y1={ty + 21} x2={tx + tw - 8} y2={ty + 21}
                    stroke="var(--gray-200)" strokeWidth="1" />
                  <text x={tx + 10} y={ty + 34} fontSize="10" fill="var(--gray-500)">
                    Free:
                  </text>
                  <text x={tx + tw - 10} y={ty + 34} fontSize="10" fill="var(--gray-600)" textAnchor="end">
                    {fmtK(hFree)}
                  </text>
                  <text x={tx + 10} y={ty + 48} fontSize="10" fill="var(--gray-500)">
                    {tierName}:
                  </text>
                  <text x={tx + tw - 10} y={ty + 48} fontSize="10" fill="var(--color-success)" fontWeight="600" textAnchor="end">
                    {fmtK(hTier)}
                  </text>
                  <text x={tx + 10} y={ty + 62} fontSize="10" fontWeight="700" fill={advColor}>
                    {hAdv >= 0 ? '▲' : '▼'} {fmtS(hAdv)} vs Free
                  </text>
                </g>
              );
            })()}
          </>
        )}

        {/* Y axis labels */}
        {yTickVals.map((v, i) => (
          <text key={i} x={padL - 6} y={yOf(v) + 4}
            textAnchor="end" fontSize="10" fill="var(--gray-400)">
            {v >= 1000 || v <= -1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`}
          </text>
        ))}

        {/* X axis year labels */}
        {yearEnds.map(m => (
          <text key={m} x={xOf(m)} y={H - padB + 16}
            textAnchor="middle" fontSize="10" fill="var(--gray-400)">
            Yr {m / 12}
          </text>
        ))}

        {/* Legend */}
        <line x1={padL} y1={H - 9} x2={padL + 22} y2={H - 9}
          stroke="var(--gray-400)" strokeWidth="2" strokeDasharray="6 4" />
        <text x={padL + 26} y={H - 5} fontSize="10" fill="var(--gray-500)">Free Wallet</text>
        <line x1={padL + 102} y1={H - 9} x2={padL + 124} y2={H - 9}
          stroke="var(--color-success)" strokeWidth="2.5" />
        <text x={padL + 128} y={H - 5} fontSize="10" fill="var(--gray-500)">{tierName}</text>
      </svg>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0 14px' }}>
        <div className="chart-stat-pill">
          <span className="chart-stat-label">Yr 1 value</span>
          <span className="chart-stat-value" style={{ color: yr1Tier >= 0 ? 'var(--color-success)' : '#dc2626' }}>
            {fmtK(yr1Tier)}
          </span>
        </div>
        <div className="chart-stat-pill">
          <span className="chart-stat-label">5-yr advantage</span>
          <span className="chart-stat-value" style={{ color: yr5Adv >= 0 ? 'var(--color-success)' : '#dc2626' }}>
            {yr5Adv >= 0 ? '+' : ''}{fmtK(yr5Adv)} vs Free
          </span>
        </div>
        <div className="chart-stat-pill">
          <span className="chart-stat-label">Breakeven</span>
          <span className="chart-stat-value" style={{ color: breakeven ? '#92400e' : 'var(--gray-500)' }}>
            {breakeven ? `Month ${breakeven}` : 'Never (5 yr)'}
          </span>
        </div>
        {welcomeBonus > 0 && (
          <div className="chart-stat-pill">
            <span className="chart-stat-label">Welcome bonus</span>
            <span className="chart-stat-value" style={{ color: '#4338ca' }}>{fmtK(welcomeBonus)}</span>
          </div>
        )}
      </div>

      {/* Year-end comparison table */}
      <table className="chart-year-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Free Wallet</th>
            <th>{tierName}</th>
            <th>Advantage</th>
          </tr>
        </thead>
        <tbody>
          {yearRows.map(r => (
            <tr key={r.yr}>
              <td>Yr {r.yr}</td>
              <td>{fmtK(r.free)}</td>
              <td style={{ color: r.tier > r.free ? 'var(--color-success)' : '#dc2626', fontWeight: 600 }}>
                {fmtK(r.tier)}
              </td>
              <td style={{ color: r.adv >= 0 ? 'var(--color-success)' : '#dc2626', fontWeight: 700 }}>
                {r.adv >= 0 ? '+' : ''}{fmtK(r.adv)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Recommendation Banner ────────────────────────────────────────────────────
function RecommendationBanner({ tiers, ownedCards, totalMonthlySpend, spend, redeemStyle }) {
  const freeTier = tiers.find(t => t.id === 'free');
  const paidTiers = tiers.filter(t => t.id !== 'free');

  // Score each paid tier: ongoing advantage weighted 3:1 over amortized bonus
  const scored = paidTiers.map(t => ({
    ...t,
    score: (t.netPerYear - freeTier.netPerYear) * 3 + t.welcomeBonus / 5,
    ongoingAdv: t.netPerYear - freeTier.netPerYear,
    year1Adv: t.year1 - freeTier.year1,
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const freeIsBest = best.ongoingAdv <= 0 && best.year1Adv <= 0;
  const newCards = best.cards.filter(cid => !ownedCards.includes(cid));

  // Find which categories drive the advantage (best tier rate vs free tier rate)
  const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
  const catAdvantages = CATEGORIES
    .map(cat => {
      const monthly = parseFloat(spend[cat.id]) || 0;
      if (monthly === 0) return null;

      let freeRate = 0;
      for (const cid of freeTier.cards) {
        const card = CARDS.find(c => c.id === cid);
        if (!card) continue;
        const r = getEffectiveRate(card, cat.id, {}, monthly);
        const v = (style?.valuations[card.issuer] || 1.0) / 100;
        if (r * v > freeRate) freeRate = r * v;
      }

      let bestRate = 0;
      for (const cid of best.cards) {
        const card = CARDS.find(c => c.id === cid);
        if (!card) continue;
        const r = getEffectiveRate(card, cat.id, {}, monthly);
        const v = (style?.valuations[card.issuer] || 1.0) / 100;
        if (r * v > bestRate) bestRate = r * v;
      }

      const annualGain = (bestRate - freeRate) * monthly * 12;
      return annualGain > 0 ? { cat, monthly, annualGain } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.annualGain - a.annualGain)
    .slice(0, 3);

  // Build a "why" sentence from top driving categories
  const buildWhySentence = () => {
    if (catAdvantages.length === 0) return null;
    const parts = catAdvantages.map(({ cat, monthly, annualGain }) =>
      `${cat.label.toLowerCase()} (${fmt(monthly)}/mo → +${fmt(annualGain)}/yr)`
    );
    if (parts.length === 1) return `Driven by your ${parts[0]}.`;
    const last = parts.pop();
    return `Driven by your ${parts.join(', ')} and ${last}.`;
  };

  const whySentence = buildWhySentence();

  if (freeIsBest) {
    return (
      <div className="rec-banner rec-free">
        <div className="rec-icon">✓</div>
        <div className="rec-content">
          <div className="rec-headline">Your free wallet is the right call at this spend level</div>
          <div className="rec-detail">
            The best paid option ({best.name}) costs {fmt(Math.abs(best.ongoingAdv))}/yr more in fees than it earns back.
            Focus on activating your rotating categories and routing spend to the right card.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rec-banner rec-paid">
      <div className="rec-icon">★</div>
      <div className="rec-content">
        <div className="rec-headline">
          Upgrade to <strong>{best.name}</strong>
        </div>
        <div className="rec-stats">
          {best.ongoingAdv > 0 && (
            <span className="rec-stat"><strong>{fmt(best.ongoingAdv)}/yr</strong> more than Free after fees</span>
          )}
          {best.welcomeBonus > 0 && best.year1Adv > 0 && (
            <span className="rec-stat"><strong>{fmt(best.year1Adv)}</strong> ahead in Year 1 with bonus</span>
          )}
          {best.breakeven && (
            <span className="rec-stat">Pays back in <strong>month {best.breakeven}</strong></span>
          )}
        </div>
        {whySentence && <div className="rec-why">{whySentence}</div>}
        {newCards.length > 0 ? (
          <div className="rec-cards-needed">
            {newCards.length} new application{newCards.length > 1 ? 's' : ''} needed:&nbsp;
            {newCards.map(cid => CARDS.find(c => c.id === cid)?.name).join(', ')}
          </div>
        ) : (
          <div className="rec-cards-needed rec-owned">
            You already own all the cards — just optimize your routing.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Net Advantage Chart ──────────────────────────────────────────────────────
function NetAdvantageChart({ freeData, tierData, tierName, welcomeBonus = 0 }) {
  const [hoverYear, setHoverYear] = useState(null);

  const years = [1, 2, 3, 4, 5];
  const cumIdx = [11, 23, 35, 47, 59];

  // Per-year net (not cumulative)
  const freeAnnual = cumIdx.map((m, i) => i === 0 ? freeData[m] : freeData[m] - freeData[cumIdx[i - 1]]);
  const tierAnnual = cumIdx.map((m, i) => i === 0 ? tierData[m] : tierData[m] - tierData[cumIdx[i - 1]]);

  // Steady-state = avg of years 2–5 (yr 1 has bonus spike)
  const freeRef    = (freeAnnual[1] + freeAnnual[2] + freeAnnual[3] + freeAnnual[4]) / 4;
  const tierSteady = (tierAnnual[1] + tierAnnual[2] + tierAnnual[3] + tierAnnual[4]) / 4;
  const ongoingAdv  = tierSteady - freeRef;
  const yr5TotalAdv = tierData[59] - freeData[59];

  const fmtK = v => Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(Math.abs(v))}`;

  // Layout
  const W = 540, H = 200;
  const padL = 58, padR = 16, padT = 20, padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allVals = [...tierAnnual, freeRef, 0];
  const maxVal  = Math.max(...allVals) * 1.22;
  const minVal  = Math.min(0, ...tierAnnual, freeRef) * 1.1;
  const range   = maxVal - minVal || 1;

  const yOf   = v  => padT + plotH * (1 - (v - minVal) / range);
  const refY  = yOf(freeRef);
  const groupW = plotW / 5;
  const barW   = groupW * 0.48;
  const cx     = i => padL + i * groupW + groupW / 2;

  // Y ticks — skip any within 14px of the reference line (avoid collision)
  const tickStep = Math.ceil((maxVal - minVal) / 4 / 100) * 100 || 100;
  const yTicks = [];
  for (let v = Math.floor(minVal / tickStep) * tickStep; v <= maxVal + tickStep / 2; v += tickStep) {
    const rounded = Math.round(v / tickStep) * tickStep;
    if (Math.abs(yOf(rounded) - refY) > 14) yTicks.push(rounded);
  }

  return (
    <div className="net-chart-wrap">
      {/* Plain-English summary */}
      <p className="net-chart-summary">
        {ongoingAdv > 0
          ? <><strong>{fmtK(ongoingAdv)}/yr more</strong> than Free on an ongoing basis</>
          : <>Free earns <strong>{fmtK(Math.abs(ongoingAdv))}/yr more</strong> on an ongoing basis</>}
        {welcomeBonus > 0 && <> · Year&nbsp;1 boosted by a <strong>{fmtK(welcomeBonus)} welcome bonus</strong></>}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHoverYear(null)}
      >
        {/* Subtle grid */}
        {yTicks.map((v, i) => (
          <line key={i} x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)}
            stroke="#f1f1f1" strokeWidth="1" />
        ))}

        {/* Free reference line */}
        <line x1={padL} y1={refY} x2={W - padR} y2={refY}
          stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" />
        {/* Reference line pill label on left axis */}
        <rect x={0} y={refY - 9} width={padL - 4} height={18} rx="4" fill="#f8fafc" />
        <text x={padL - 8} y={refY + 4} textAnchor="end" fontSize="9" fontWeight="600" fill="#64748b">
          Free
        </text>

        {/* Bars */}
        {years.map((yr, i) => {
          const v      = tierAnnual[i];
          const isAbove = v >= freeRef;
          const isHov  = hoverYear === i;
          const isYr1  = i === 0 && welcomeBonus > 0;
          const barTop = yOf(Math.max(v, 0));
          const barBot = yOf(0);
          const bH     = Math.max(3, barBot - barTop);

          // Label: inside (white) if bar tall enough, else above with a floor so it never clips
          const labelInside = bH > 26;
          const rawLabelY   = labelInside ? barTop + bH / 2 + 4 : barTop - 7;
          const labelY      = Math.max(padT + 12, rawLabelY);
          const labelFill   = labelInside ? 'white' : (isAbove ? '#3C3489' : '#dc2626');

          return (
            <g key={yr} onMouseEnter={() => setHoverYear(i)} style={{ cursor: 'default' }}>
              {/* Hover tray */}
              {isHov && (
                <rect x={cx(i) - barW / 2 - 5} y={padT - 2}
                  width={barW + 10} height={plotH + 4}
                  fill="#f8fafc" rx="4" />
              )}

              {/* Bar */}
              <rect
                x={cx(i) - barW / 2} y={barTop}
                width={barW} height={bH}
                fill={isAbove ? '#3C3489' : '#dc2626'}
                opacity={isYr1 ? 0.68 : isHov ? 1 : 0.88}
                rx="3"
              />

              {/* Value label */}
              <text x={cx(i)} y={labelY}
                textAnchor="middle" fontSize="10" fontWeight="700" fill={labelFill}>
                {fmtK(v)}
              </text>

              {/* "w/ bonus" sub-label below year label for yr 1 */}
              {isYr1 && (
                <text x={cx(i)} y={H - padB + 24}
                  textAnchor="middle" fontSize="9" fill="#6366f1">
                  +{fmtK(welcomeBonus)} bonus
                </text>
              )}

              {/* Hover tooltip */}
              {isHov && (() => {
                const tooltipW = 136;
                const advVsFree = v - freeAnnual[i];
                const rows = [
                  { label: `${tierName}`, val: fmtK(v), color: '#3C3489' },
                  { label: 'Free Wallet', val: fmtK(freeAnnual[i]), color: '#64748b' },
                  ...(isYr1 ? [{ label: 'incl. bonus', val: fmtK(welcomeBonus), color: '#6366f1' }] : []),
                  { label: 'vs Free', val: `${advVsFree >= 0 ? '+' : '−'}${fmtK(Math.abs(advVsFree))}`, color: advVsFree >= 0 ? '#1D9E75' : '#dc2626' },
                ];
                const tx = i < 3 ? cx(i) + barW / 2 + 6 : cx(i) - barW / 2 - tooltipW - 6;
                const ty = padT + 2;
                const th = 18 + rows.length * 17;
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect x={tx} y={ty} width={tooltipW} height={th} rx="7"
                      fill="white" stroke="#e2e8f0" strokeWidth="1"
                      style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.09))' }} />
                    <text x={tx + 10} y={ty + 13} fontSize="10" fontWeight="700" fill="#334155">
                      Year {yr} — annual
                    </text>
                    <line x1={tx + 8} y1={ty + 17} x2={tx + tooltipW - 8} y2={ty + 17} stroke="#f1f5f9" strokeWidth="1" />
                    {rows.map((r, ri) => (
                      <g key={ri}>
                        <text x={tx + 10} y={ty + 29 + ri * 17} fontSize="10" fill="#94a3b8">{r.label}</text>
                        <text x={tx + tooltipW - 8} y={ty + 29 + ri * 17} fontSize="10" fill={r.color} fontWeight="600" textAnchor="end">{r.val}</text>
                      </g>
                    ))}
                  </g>
                );
              })()}

              {/* X axis label */}
              <text x={cx(i)} y={H - padB + 14}
                textAnchor="middle" fontSize="11" fill="#64748b" fontWeight="500">
                Yr {yr}
              </text>
            </g>
          );
        })}

        {/* Y axis value labels (skip ticks near ref line) */}
        {yTicks.map((v, i) => (
          <text key={i} x={padL - 6} y={yOf(v) + 4}
            textAnchor="end" fontSize="10" fill="#94a3b8">
            {fmtK(v)}
          </text>
        ))}
      </svg>

      {/* HTML legend — flexbox centers it naturally */}
      <div className="net-chart-legend">
        <span className="net-chart-legend-item">
          <span className="net-chart-swatch" style={{ background: '#3C3489' }} />
          {tierName} annual net
        </span>
        <span className="net-chart-legend-item">
          <span className="net-chart-dash" />
          Free Wallet
        </span>
        {welcomeBonus > 0 && (
          <span className="net-chart-legend-item">
            <span className="net-chart-swatch" style={{ background: '#6366f1', opacity: 0.7 }} />
            Yr 1 incl. bonus
          </span>
        )}
      </div>

      <p className="chart-assumption-note">Net of annual fees · Assumes optimal card routing per category</p>

      {/* Stat pills — centered */}
      <div className="net-chart-pills">
        <div className="chart-stat-pill">
          <span className="chart-stat-label">Ongoing advantage</span>
          <span className="chart-stat-value" style={{ color: ongoingAdv >= 0 ? '#1D9E75' : '#dc2626' }}>
            {ongoingAdv >= 0 ? '+' : '−'}{fmtK(Math.abs(ongoingAdv))}/yr vs Free
          </span>
        </div>
        {welcomeBonus > 0 && (
          <div className="chart-stat-pill">
            <span className="chart-stat-label">Year 1 (with bonus)</span>
            <span className="chart-stat-value" style={{ color: '#3C3489' }}>
              {fmtK(tierAnnual[0])}
            </span>
          </div>
        )}
        <div className="chart-stat-pill">
          <span className="chart-stat-label">5-yr total vs Free</span>
          <span className="chart-stat-value" style={{ color: yr5TotalAdv >= 0 ? '#1D9E75' : '#dc2626' }}>
            {yr5TotalAdv >= 0 ? '+' : '−'}{fmtK(Math.abs(yr5TotalAdv))}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Side-by-Side Comparison ──────────────────────────────────────────────────
function TierComparison({ tiers }) {
  const [idA, setIdA] = useState(tiers[0]?.id);
  const [idB, setIdB] = useState(tiers[2]?.id || tiers[1]?.id);
  const tA = tiers.find(t => t.id === idA);
  const tB = tiers.find(t => t.id === idB);
  if (!tA || !tB) return null;

  const metrics = [
    { label: 'Annual Earnings',  a: tA.earnings,    b: tB.earnings,    fmt: fmt,  note: '' },
    { label: 'Effective Fee',    a: -tA.effectiveFee, b: -tB.effectiveFee, fmt: v => v === 0 ? '$0' : `−${fmt(Math.abs(v))}`, note: 'after credits' },
    { label: 'Net / Year',       a: tA.netPerYear,  b: tB.netPerYear,  fmt: fmt,  note: 'earnings − fees' },
    { label: 'Welcome Bonus',    a: tA.welcomeBonus, b: tB.welcomeBonus, fmt: v => v > 0 ? fmt(v) : '—', note: 'new cards only' },
    { label: 'Year 1 Total',     a: tA.year1,       b: tB.year1,       fmt: fmt,  note: 'net + bonus' },
  ];

  const delta = tA.netPerYear - tB.netPerYear;
  const year1Delta = tA.year1 - tB.year1;
  const winner = delta > 0 ? tA : delta < 0 ? tB : null;

  return (
    <div className="tier-comparison">
      <h3 className="comparison-heading">Compare Wallets</h3>
      <div className="comparison-selectors">
        <select value={idA} onChange={e => setIdA(e.target.value)} className="comparison-select">
          {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="comparison-vs">vs</span>
        <select value={idB} onChange={e => setIdB(e.target.value)} className="comparison-select">
          {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div className="comparison-table">
        {/* Column headers */}
        <div className="comparison-row comparison-header">
          <div className="comparison-metric" />
          <div className={`comparison-col-header ${delta > 0 ? 'winner' : ''}`}>{tA.name}</div>
          <div className={`comparison-col-header ${delta < 0 ? 'winner' : ''}`}>{tB.name}</div>
        </div>

        {/* Cards row */}
        <div className="comparison-row">
          <div className="comparison-metric">Cards</div>
          <div className="comparison-cell">
            {tA.cards.map(cid => {
              const c = CARDS.find(x => x.id === cid);
              return c ? <span key={cid} className="comp-pill">{c.name.replace('Chase ', '').replace('Amex ', '')}</span> : null;
            })}
          </div>
          <div className="comparison-cell">
            {tB.cards.map(cid => {
              const c = CARDS.find(x => x.id === cid);
              return c ? <span key={cid} className="comp-pill">{c.name.replace('Chase ', '').replace('Amex ', '')}</span> : null;
            })}
          </div>
        </div>

        {/* Metric rows */}
        {metrics.map(m => {
          const aWins = m.a > m.b;
          const bWins = m.b > m.a;
          return (
            <div key={m.label} className="comparison-row">
              <div className="comparison-metric">
                {m.label}
                {m.note && <span className="comparison-note">{m.note}</span>}
              </div>
              <div className={`comparison-cell ${aWins ? 'cell-winner' : bWins ? 'cell-loser' : ''}`}>
                {aWins && <span className="cell-check">✓</span>}
                {m.fmt(m.a)}
              </div>
              <div className={`comparison-cell ${bWins ? 'cell-winner' : aWins ? 'cell-loser' : ''}`}>
                {bWins && <span className="cell-check">✓</span>}
                {m.fmt(m.b)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Verdict */}
      <div className={`comparison-verdict ${winner ? '' : 'tied'}`}>
        {winner
          ? <>
              <strong>{winner.name}</strong> wins —&nbsp;
              {Math.abs(delta) > 0 && <>{fmt(Math.abs(delta))}/yr more on an ongoing basis</>}
              {Math.abs(year1Delta) > 0 && Math.abs(delta) > 0 && ', '}
              {Math.abs(year1Delta) > 0 && <>{fmt(Math.abs(year1Delta))} better in Year 1</>}
            </>
          : 'These wallets perform equally at your spend level'}
      </div>
    </div>
  );
}

// ─── Results ──────────────────────────────────────────────────────────────────
function WalletResults({ local, onRestart, onGoToStep }) {
  const { spend, ownedCards, selectedCredits, redeemStyle, heldCards, activationStatus } = local;
  const freeWallet = WALLET_TIERS.find(t => t.id === 'free');
  const [expandedTier, setExpandedTier] = useState(null);

  const tiers = WALLET_TIERS.map(tier => {
    const earnings = calculateWalletEarnings(tier.cards, spend, activationStatus, redeemStyle);
    const totalFee = tier.cards.reduce((s, id) => {
      const card = CARDS.find(c => c.id === id);
      return s + (card?.annualFee || 0);
    }, 0);
    const effectiveFee = tier.cards.reduce((s, id) => s + calculateEffectiveFee(id, selectedCredits), 0);
    const netPerYear = earnings - effectiveFee;

    // Welcome bonus — skip cards in heldCards
    let wb = 0;
    for (const cardId of tier.cards) {
      if (heldCards.includes(cardId)) continue;
      const card = CARDS.find(c => c.id === cardId);
      if (!card?.welcomeBonus) continue;
      const wbObj = card.welcomeBonus;
      if (wbObj.isCashbackMatch) {
        wb += calculateWalletEarnings([cardId], spend, activationStatus, redeemStyle);
      } else if (wbObj.type === 'cashback') {
        wb += wbObj.amount;
      } else {
        const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
        const val = (style?.valuations[card.issuer] || 1.0) / 100;
        wb += wbObj.amount * val;
      }
    }

    const year1 = netPerYear + wb;
    const breakeven = tier.id !== 'free'
      ? calculateBreakeven(freeWallet.cards, tier.cards, spend, selectedCredits, heldCards, redeemStyle)
      : null;

    return { ...tier, earnings, totalFee, effectiveFee, netPerYear, year1, welcomeBonus: wb, breakeven };
  });

  const bestTier = [...tiers].sort((a, b) => b.netPerYear - a.netPerYear)[0];
  const totalMonthlySpend = Object.values(spend).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  // Returns feasibility info for a single card's welcome bonus
  function getBonusFeasibility(card) {
    const wb = card.welcomeBonus;
    if (!wb || wb.spend === 0) return null;
    if (heldCards.includes(card.id)) return { tier: 'held', pct: 0, monthsNeeded: null };
    if (wb.isCashbackMatch) return { tier: 'match', pct: 100, monthsNeeded: null };

    const monthsNeeded = totalMonthlySpend > 0 ? wb.spend / totalMonthlySpend : Infinity;
    const pct = Math.min(100, (totalMonthlySpend * wb.months / wb.spend) * 100);

    let tier;
    if (pct >= 100) tier = 'easy';
    else if (pct >= 65) tier = 'stretch';
    else tier = 'hard';

    return { tier, pct, monthsNeeded, required: wb.spend, window: wb.months };
  }

  return (
    <div className="wizard">
      <div className="results-header">
        <h2>Your Wallet Analysis</h2>
        <p>
          {fmt(totalMonthlySpend)}/mo spend &nbsp;·&nbsp;{' '}
          {ownedCards.length} card{ownedCards.length !== 1 ? 's' : ''} &nbsp;·&nbsp;{' '}
          {REDEMPTION_STYLES.find(r => r.id === redeemStyle)?.label}
        </p>
      </div>

      {/* Step edit bar */}
      <div className="results-edit-bar">
        {STEPS.map((label, i) => (
          <button key={i} className="results-edit-step" onClick={() => onGoToStep(i)}>
            <span className="results-edit-num">{i + 1}</span>
            {label}
            <span className="results-edit-icon">✎</span>
          </button>
        ))}
      </div>

      {/* Recommendation banner */}
      <RecommendationBanner tiers={tiers} ownedCards={ownedCards} totalMonthlySpend={totalMonthlySpend} spend={spend} redeemStyle={redeemStyle} />

      {/* Wallet tiers */}
      <div style={{ marginBottom: 36 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-700)', marginBottom: 14 }}>Wallet Tiers</h3>
        <div className="wallet-tiers">
          {tiers.map((tier, i) => {
            const isBest = tier.id === bestTier.id;
            const isExpanded = expandedTier === tier.id;
            return (
              <div key={tier.id} className={`wallet-tier ${isBest ? 'best' : ''} ${isExpanded ? 'expanded' : ''}`}>
                <div className="wallet-tier-top"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpandedTier(isExpanded ? null : tier.id)}>
                  <div className="wallet-tier-label">
                    <div className="tier-name">
                      {tier.name}
                      {isBest && <span className="badge-best">BEST</span>}
                    </div>
                    <div className="tier-desc">{tier.description}</div>
                  </div>
                  <div className="wallet-tier-cards">
                    {tier.cards.map(cid => {
                      const card = CARDS.find(c => c.id === cid);
                      const owns = ownedCards.includes(cid);
                      return card ? (
                        <span key={cid} className={`wallet-card-pill ${owns ? 'owned' : 'new-card'}`}>
                          {owns ? '✓ ' : '+ '}
                          {card.name.replace('Chase ', '').replace('Amex ', '').replace('Capital One ', '')}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--gray-400)', flexShrink: 0, marginLeft: 8 }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>
                <div className="wallet-tier-stats">
                  <div className="tier-stat">
                    <div className="tier-stat-label">Annual Earnings</div>
                    <div className={`tier-stat-value ${tier.earnings > 0 ? 'positive' : ''}`}>{fmt(tier.earnings)}</div>
                  </div>
                  <div className="tier-stat">
                    <div className="tier-stat-label">Eff. Fee</div>
                    <div className="tier-stat-value muted">{tier.effectiveFee > 0 ? `−${fmt(tier.effectiveFee)}` : '$0'}</div>
                  </div>
                  <div className="tier-stat">
                    <div className="tier-stat-label">Net / Year</div>
                    <div className={`tier-stat-value ${tier.netPerYear >= 0 ? 'positive' : 'negative'}`}>{fmt(tier.netPerYear)}</div>
                  </div>
                  <div className="tier-stat">
                    <div className="tier-stat-label">Welcome Bonus</div>
                    <div className="tier-stat-value muted">{tier.welcomeBonus > 0 ? fmt(tier.welcomeBonus) : '—'}</div>
                  </div>
                  <div className="tier-stat">
                    <div className="tier-stat-label">Year 1 Total</div>
                    <div className={`tier-stat-value ${tier.year1 >= 0 ? 'positive' : 'negative'}`}>{fmt(tier.year1)}</div>
                  </div>
                </div>
                {/* Bonus feasibility */}
                {tier.cards.some(cid => {
                  const card = CARDS.find(c => c.id === cid);
                  return card?.welcomeBonus?.spend > 0 && !ownedCards.includes(cid);
                }) && (
                  <div className="bonus-feasibility">
                    <div className="bonus-feasibility-title">Welcome Bonus Feasibility</div>
                    {tier.cards.map(cid => {
                      const card = CARDS.find(c => c.id === cid);
                      if (!card?.welcomeBonus) return null;
                      if (ownedCards.includes(cid)) return null;
                      const f = getBonusFeasibility(card);
                      if (!f) return null;

                      const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
                      const val = (style?.valuations[card.issuer] || 1.0) / 100;
                      const wb = card.welcomeBonus;
                      const bonusDisplay = wb.isCashbackMatch
                        ? 'Cashback Match'
                        : wb.type === 'cashback'
                          ? fmt(wb.amount)
                          : fmt(wb.amount * val);

                      const badgeLabels = { easy: 'Easy', stretch: 'Stretch', hard: 'Hard to reach', held: 'Already held', match: 'Year 1 match' };

                      const effectiveFee = calculateEffectiveFee(cid, selectedCredits);

                      return (
                        <div key={cid} className="bonus-row">
                          <div className="bonus-row-top">
                            <span className="bonus-card-name">{card.name}</span>
                            <span className="bonus-amount">{bonusDisplay} bonus</span>
                            <span className={`bonus-badge ${f.tier}`}>{badgeLabels[f.tier]}</span>
                          </div>
                          <div className="bonus-fee-line">
                            <span className="bonus-fee-label">Annual fee:</span>
                            {card.annualFee === 0 ? (
                              <span className="bonus-fee-value free">No annual fee</span>
                            ) : effectiveFee < card.annualFee ? (
                              <>
                                <span className="bonus-fee-value strikethrough">${card.annualFee}</span>
                                <span className="bonus-fee-value effective">${effectiveFee} after credits</span>
                              </>
                            ) : (
                              <span className="bonus-fee-value">${card.annualFee}/yr</span>
                            )}
                          </div>
                          {f.tier !== 'held' && f.tier !== 'match' && (
                            <div className="bonus-progress-wrap">
                              <div className="bonus-spend-requirement">
                                <span className="bonus-spend-req-label">Spend requirement:</span>
                                <span className="bonus-spend-req-value">{fmt(f.required)} in {f.window} mo</span>
                                <span className="bonus-spend-req-rate">
                                  ({fmt(Math.ceil(f.required / f.window))}/mo needed · you spend {fmt(totalMonthlySpend)}/mo)
                                </span>
                              </div>
                              <div className="bonus-progress-bar">
                                <div className={`bonus-progress-fill ${f.tier}`} style={{ width: `${f.pct}%` }} />
                              </div>
                              <span className="bonus-progress-label">
                                {f.tier === 'easy'
                                  ? `✓ On track — you'll hit it in ~${Math.ceil(f.monthsNeeded)} mo at your current spend`
                                  : `At ${fmt(totalMonthlySpend)}/mo you'd need ${Math.ceil(f.monthsNeeded).toFixed(0)} mo — ${f.window} mo window`}
                              </span>
                            </div>
                          )}
                          {f.tier === 'match' && (
                            <div className="bonus-progress-label" style={{ textAlign: 'left', color: 'var(--color-primary)' }}>
                              All cashback earned in year 1 is doubled at year-end
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {tier.breakeven !== null && (
                  <div className={`breakeven-badge ${tier.breakeven === null ? 'never' : ''}`}>
                    {tier.breakeven ? `✓ Pays for itself in month ${tier.breakeven}` : '✓ Immediately profitable'}
                  </div>
                )}
                {tier.id !== 'free' && tier.breakeven === null && (
                  <div className="breakeven-badge never">Doesn't break even within 5 years at this spend level</div>
                )}

                {/* 5-year chart (expanded) */}
                {isExpanded && (() => {
                  const chartData = generateCumulativeData(
                    freeWallet.cards, tier.cards, spend, selectedCredits, heldCards, redeemStyle
                  );
                  return (
                    <div className="tier-chart">
                      <div className="tier-chart-title">Net Advantage vs. Free Wallet by Year</div>
                      <NetAdvantageChart
                        freeData={chartData.free}
                        tierData={chartData.tier}
                        tierName={tier.name}
                        welcomeBonus={tier.welcomeBonus}
                      />
                      <div className="tier-chart-footer">
                        {chartData.breakeven
                          ? `${tier.name} surpasses the Free Wallet in month ${chartData.breakeven} (~${(chartData.breakeven / 12).toFixed(1)} years).`
                          : `At your current spend of ${fmt(Object.values(spend).reduce((s,v) => s+(parseFloat(v)||0),0))}/mo, ${tier.name} doesn't surpass the Free Wallet within 5 years.`}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Side-by-side comparison */}
      <TierComparison tiers={tiers} />

      {/* Best card per category */}
      {ownedCards.length > 0 && (
        <div className="best-card-section">
          <h3 className="best-card-title">Optimize Your Current Wallet</h3>
          <p className="best-card-subtitle">Best card to use for each category, given the cards you own.</p>
          <div className="best-card-table">
            {CATEGORIES.filter(cat => parseFloat(spend[cat.id]) > 0).map(cat => {
              const monthly = parseFloat(spend[cat.id]) || 0;
              let bestCard = null, bestRate = 0, bestVal = 0;
              for (const cid of ownedCards) {
                const card = CARDS.find(c => c.id === cid);
                if (!card) continue;
                const rate = getEffectiveRate(card, cat.id, activationStatus, monthly);
                const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
                const val = (style?.valuations[card.issuer] || 1.0) / 100;
                if (rate * val > bestRate * bestVal) { bestCard = card; bestRate = rate; bestVal = val; }
              }
              if (!bestCard) return null;
              const annualValue = monthly * 12 * bestRate * bestVal;
              return (
                <div key={cat.id} className="best-card-row">
                  <div className="best-card-cat">
                    <span className="best-card-icon">{CAT_ICONS[cat.id]}</span>
                    <span className="best-card-cat-name">{cat.label}</span>
                    <span className="best-card-spend">{fmt(monthly)}/mo</span>
                  </div>
                  <div className="best-card-result">
                    <span className="best-card-name" style={{ borderLeft: `3px solid ${bestCard.color}` }}>
                      {bestCard.name}
                    </span>
                    <span className="best-card-rate">{bestRate % 1 === 0 ? bestRate : bestRate.toFixed(1)}x</span>
                    <span className="best-card-annual">{fmt(annualValue)}/yr</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
        <Link to="/earn" className="btn btn-primary" style={{ fontSize: 14 }}>Analyze My Earning →</Link>
        <button onClick={onRestart} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline' }}>
          Reset all
        </button>
      </div>
    </div>
  );
}

// ─── Main WalletOptimizer ─────────────────────────────────────────────────────
const LS_KEY = 'pointsmax_wallet';

function isComplete(s) {
  return Object.values(s.spend).some(v => parseFloat(v) > 0)
    && s.ownedCards.length > 0
    && !!s.redeemStyle;
}

function loadFromStorage(fallback) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch {}
  return fallback;
}

export default function WalletOptimizer() {
  const { state, dispatch } = useApp();

  const defaultLocal = {
    spend: { ...state.spend },
    ownedCards: [...state.ownedCards],
    cards24months: state.cards24months,
    amexCount: state.amexCount,
    heldCards: [...state.heldCards],
    selectedCredits: { ...state.selectedCredits },
    redeemStyle: state.redeemStyle,
    categoryEntries: { ...state.categoryEntries },
    activationStatus: { ...state.activationStatus },
  };

  const [local, setLocal] = useState(() => loadFromStorage(defaultLocal));

  // Persist to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(local)); } catch {}
  }, [local]);

  // Auto-show results if context already has completed data
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(() => isComplete(local));

  const syncAndFinish = (updatedLocal) => {
    dispatch({ type: 'SET_SPEND', payload: updatedLocal.spend });
    dispatch({ type: 'SET_OWNED_CARDS', payload: updatedLocal.ownedCards });
    dispatch({ type: 'SET_ELIGIBILITY', payload: { cards24months: updatedLocal.cards24months, amexCount: updatedLocal.amexCount, heldCards: updatedLocal.heldCards } });
    dispatch({ type: 'SET_CREDITS', payload: updatedLocal.selectedCredits });
    dispatch({ type: 'SET_REDEEM_STYLE', payload: updatedLocal.redeemStyle });
    setDone(true);
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      syncAndFinish(local);
    }
  };

  const goToStep = (n) => {
    setDone(false);
    setStep(n);
  };

  const restart = () => {
    const blank = {
      spend: { dining:'', groceries:'', travel:'', gas:'', shopping:'', subscriptions:'', entertainment:'', other:'' },
      ownedCards: [], cards24months: 0, amexCount: 0, heldCards: [],
      selectedCredits: {}, redeemStyle: 'portal', categoryEntries: {}, activationStatus: {},
    };
    setStep(0);
    setDone(false);
    setLocal(blank);
    dispatch({ type: 'RESET' });
    try { localStorage.removeItem(LS_KEY); } catch {}
  };

  if (done) {
    return (
      <div className="page-container">
        <WalletResults local={local} onRestart={restart} onGoToStep={goToStep} />
      </div>
    );
  }

  const stepProps = { local, setLocal, onNext: next, onBack: () => setStep(s => s - 1) };

  return (
    <div className="page-container narrow">
      {/* Progress bar */}
      <div className="progress-bar">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`progress-step ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`}
            onClick={() => i < step && setStep(i)}
            style={{ cursor: i < step ? 'pointer' : 'default' }}
          >
            <div className="step-circle">{i < step ? '✓' : i + 1}</div>
            <span className="step-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="step-card">
        {step === 0 && <StepSpend {...stepProps} />}
        {step === 1 && <StepCards {...stepProps} />}
        {step === 2 && <StepEligibility {...stepProps} />}
        {step === 3 && <StepCredits {...stepProps} />}
        {step === 4 && <StepRedemption {...stepProps} />}
      </div>
    </div>
  );
}
