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
const STEPS = ['Spending', 'Cards', 'Preferences'];

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

// ─── Step 2: Cards + Inline Eligibility ──────────────────────────────────────
const BANK_GROUPS = [
  { issuer: 'Chase',      label: 'Chase',            color: '#1a6bab' },
  { issuer: 'Amex',       label: 'American Express', color: '#c8992a' },
  { issuer: 'Citi',       label: 'Citi',             color: '#c41230' },
  { issuer: 'CapitalOne', label: 'Capital One',       color: '#d03027' },
  { issuer: 'Discover',   label: 'Discover',          color: '#ff6500' },
  { issuer: 'WellsFargo', label: 'Wells Fargo',       color: '#cf0a2c' },
  { issuer: 'USBank',     label: 'U.S. Bank',         color: '#0051a5' },
  { issuer: 'Robinhood',  label: 'Robinhood',         color: '#00c805' },
  { issuer: 'Apple',      label: 'Apple',             color: '#1d1d1f' },
  { issuer: 'Bilt',       label: 'Bilt',              color: '#1a1a2e' },
];
const AMEX_CARDS = CARDS.filter(c => c.issuer === 'Amex');

function StepCards({ local, setLocal, onNext, onBack }) {
  const owned = local.ownedCards;
  const [showElig, setShowElig] = useState(false);

  const toggle = id => setLocal(l => ({
    ...l,
    ownedCards: l.ownedCards.includes(id) ? l.ownedCards.filter(c => c !== id) : [...l.ownedCards, id],
  }));
  const setField = (key, val) => setLocal(l => ({ ...l, [key]: val }));
  const toggleHeld = id => setLocal(l => ({
    ...l,
    heldCards: l.heldCards.includes(id) ? l.heldCards.filter(c => c !== id) : [...l.heldCards, id],
  }));

  const totalFee = CARDS.filter(c => owned.includes(c.id)).reduce((s, c) => s + c.annualFee, 0);
  const over524 = local.cards24months >= 5;
  const amexFull = local.amexCount >= 5;

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
                {bank.issuer === 'Chase' && over524 && (
                  <span className="eligibility-warn-badge">⚠ Over 5/24</span>
                )}
                {bank.issuer === 'Amex' && amexFull && (
                  <span className="eligibility-warn-badge">⚠ Amex limit</span>
                )}
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
              {bankCards.map(card => {
                const restricted = (card.issuer === 'Chase' && over524) || (card.issuer === 'Amex' && amexFull);
                return (
                  <button key={card.id}
                    className={`card-option ${owned.includes(card.id) ? 'selected' : ''} ${restricted ? 'restricted' : ''}`}
                    onClick={() => toggle(card.id)}>
                    <div className="card-check" />
                    <div className="card-color-bar" style={{ background: card.color }} />
                    <div className="card-info">
                      <div className="card-name">{card.name}</div>
                      <div className="card-fee-row">
                        <span className={`card-fee-badge ${card.annualFee === 0 ? 'free' : 'paid'}`}>
                          {card.annualFee === 0 ? 'No fee' : `$${card.annualFee}/yr`}
                        </span>
                        {restricted && !owned.includes(card.id) && (
                          <span className="card-ineligible-tag">Not eligible</span>
                        )}
                      </div>
                      <div className="card-rates">
                        {(TOP_RATES[card.id] || []).map(r => (
                          <span key={r} className={`rate-chip ${/[4-9]x|10x/.test(r) ? 'highlight' : ''}`}>{r}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
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

      {/* Inline eligibility — collapsible */}
      <div className="eligibility-inline">
        <button className="eligibility-toggle" onClick={() => setShowElig(s => !s)}>
          <span>Eligibility &amp; restrictions</span>
          <span className="eligibility-toggle-hint">Affects which cards you can apply for</span>
          <span className="eligibility-toggle-arrow">{showElig ? '▲' : '▼'}</span>
        </button>
        {showElig && (
          <div className="eligibility-inline-body">
            <div className="eligibility-inline-row">
              <div className="field-group">
                <label>New cards opened in last 24 months <span className="hint">(Chase 5/24)</span></label>
                <select value={local.cards24months} onChange={e => setField('cards24months', parseInt(e.target.value))}>
                  {[0,1,2,3,4,5,6].map(v => <option key={v} value={v}>{v === 6 ? '6+' : v}</option>)}
                </select>
                {over524 && <p className="field-warn">Over 5/24 — new Chase cards are flagged above</p>}
              </div>
              <div className="field-group">
                <label>Open Amex cards currently <span className="hint">(5-card max)</span></label>
                <select value={local.amexCount} onChange={e => setField('amexCount', parseInt(e.target.value))}>
                  {[0,1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                {amexFull && <p className="field-warn">At limit — new Amex cards flagged above</p>}
              </div>
            </div>
            <div className="field-group" style={{ marginTop: 12 }}>
              <label>Amex cards you've held before <span className="hint">(once-per-lifetime bonus rule)</span></label>
              <div className="chips-grid" style={{ marginTop: 8 }}>
                {AMEX_CARDS.map(card => (
                  <button key={card.id}
                    className={`chip ${local.heldCards.includes(card.id) ? 'selected' : ''}`}
                    onClick={() => toggleHeld(card.id)}>
                    {card.name.replace('Amex ', '')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Next: Preferences →</button>
      </div>
    </>
  );
}

// ─── Step 3: Preferences (Redemption + Credits merged) ───────────────────────
function StepPreferences({ local, setLocal, onNext, onBack }) {
  const { redeemStyle, selectedCredits, ownedCards } = local;
  const relevantCards = CARDS.filter(c => ownedCards.includes(c.id) && STATEMENT_CREDITS[c.id]);

  const toggleCredit = (cardId, creditId) => {
    const current = selectedCredits[cardId] || [];
    const next = current.includes(creditId) ? current.filter(x => x !== creditId) : [...current, creditId];
    setLocal(l => ({ ...l, selectedCredits: { ...l.selectedCredits, [cardId]: next } }));
  };
  const selectAllCredits = cardId => {
    const allIds = (STATEMENT_CREDITS[cardId] || []).map(c => c.id);
    setLocal(l => ({ ...l, selectedCredits: { ...l.selectedCredits, [cardId]: allIds } }));
  };
  const deselectAllCredits = cardId => {
    setLocal(l => ({ ...l, selectedCredits: { ...l.selectedCredits, [cardId]: [] } }));
  };
  const isCreditSelected = (cardId, creditId) => (selectedCredits[cardId] || []).includes(creditId);
  const getEffectiveFeeForCard = card => {
    const credits = STATEMENT_CREDITS[card.id] || [];
    const sel = selectedCredits[card.id] || [];
    return Math.max(0, card.annualFee - credits.filter(c => sel.includes(c.id)).reduce((s, c) => s + c.value, 0));
  };

  return (
    <>
      <h2 className="step-heading">Preferences</h2>
      <p className="step-subheading">How you redeem points determines their value.</p>

      <div className="redemption-grid">
        {REDEMPTION_STYLES.map(style => {
          const isSel = redeemStyle === style.id;
          return (
            <button key={style.id} className={`redemption-option ${isSel ? 'selected' : ''}`}
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

      {relevantCards.length > 0 && (
        <>
          <div className="pref-section-divider">
            <span>Statement credits on your cards</span>
            <span className="pref-section-hint">Check the ones you actually use — they reduce your effective fee</span>
          </div>
          {relevantCards.map(card => {
            const credits = STATEMENT_CREDITS[card.id] || [];
            const sel = selectedCredits[card.id] || [];
            const allSel = credits.every(c => sel.includes(c.id));
            const effectiveFee = getEffectiveFeeForCard(card);
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
                  <button className={`credits-select-all ${allSel ? 'active' : ''}`}
                    onClick={() => allSel ? deselectAllCredits(card.id) : selectAllCredits(card.id)}>
                    {allSel ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="credits-list">
                  {credits.map(credit => (
                    <button key={credit.id}
                      className={`credit-item ${isCreditSelected(card.id, credit.id) ? 'selected' : ''}`}
                      onClick={() => toggleCredit(card.id, credit.id)}>
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
          })}
        </>
      )}

      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-success" onClick={onNext} disabled={!redeemStyle}
          style={{ opacity: redeemStyle ? 1 : 0.5, cursor: redeemStyle ? 'pointer' : 'not-allowed' }}>
          See My Results →
        </button>
      </div>
    </>
  );
}

// ─── Shared helper ───────────────────────────────────────────────────────────
function formatRawBonus(card) {
  const wb = card?.welcomeBonus;
  if (!wb || wb.amount === 0) return null;
  if (wb.isCashbackMatch) return 'Cashback Match';
  if (wb.type === 'cashback') return `$${wb.amount.toLocaleString()} cash back`;
  if (wb.type === 'miles')   return `${wb.amount.toLocaleString()} miles`;
  return `${wb.amount.toLocaleString()} pts`;
}

// ─── Recommendation Banner ────────────────────────────────────────────────────
function RecommendationBanner({ tiers, ownedCards, heldCards = [], totalMonthlySpend, spend, redeemStyle }) {
  // Use 'current' as baseline if it exists, else fall back to 'free'
  const baseline = tiers.find(t => t.id === 'current') || tiers.find(t => t.id === 'free');
  const upgradeTiers = tiers.filter(t => t.id !== 'current' && t.id !== 'free');
  if (!baseline || upgradeTiers.length === 0) return null;

  // Alias so rest of logic stays readable
  const freeTier = baseline;
  const paidTiers = upgradeTiers;

  // Score by 3-year total: year1 (ongoing + bonus) + 2 more years of ongoing.
  // This gives the welcome bonus real but bounded weight — it matters in year 1,
  // but the ongoing rate dominates by year 3. canHitSpend ensures the bonus is achievable.
  const threeYr = t => t.year1 + t.netPerYear * 2;

  const scored = paidTiers.map(t => ({
    ...t,
    score: threeYr(t),
    ongoingAdv: t.netPerYear - freeTier.netPerYear,
    year1Adv: t.year1 - freeTier.year1,
  })).sort((a, b) => b.score - a.score);

  // Hard filter: only recommend tiers where the user can actually hit every new card's
  // minimum spend requirement without increasing their monthly spending.
  const canHitSpend = (tier) => {
    for (const cid of tier.cards) {
      if (ownedCards.includes(cid) || heldCards.includes(cid)) continue;
      const card = CARDS.find(c => c.id === cid);
      const wb = card?.welcomeBonus;
      if (!wb || wb.spend === 0 || wb.isCashbackMatch) continue;
      if (totalMonthlySpend < wb.spend / wb.months) return false;
    }
    return true;
  };

  const achievable = scored.filter(canHitSpend);
  const best = achievable.length > 0 ? achievable[0] : scored[0];
  // Free/current wins if its 3-year total beats the best achievable paid tier
  const freeIsBest = threeYr(best) <= threeYr(freeTier);
  const newCards = best.cards.filter(cid => !ownedCards.includes(cid));

  // "Spend up" nudge: best out-of-reach tier with a better 3-year total
  const nextUp = scored.find(t => !canHitSpend(t) && threeYr(t) > threeYr(best));
  const nextUpMonthlyNeeded = nextUp
    ? Math.ceil(Math.max(...nextUp.cards
        .filter(cid => !ownedCards.includes(cid) && !heldCards.includes(cid))
        .map(cid => {
          const card = CARDS.find(c => c.id === cid);
          const wb = card?.welcomeBonus;
          return (wb?.spend && wb.months) ? wb.spend / wb.months : 0;
        })
      ))
    : 0;
  const nextUpSpendMore = nextUp ? Math.max(0, nextUpMonthlyNeeded - totalMonthlySpend) : 0;
  const nextUp5yr = nextUp ? nextUp.year1 + nextUp.netPerYear * 4 : 0;
  const best5yr = best.year1 + best.netPerYear * 4;

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

  // Build a plain-English summary explaining why this tier was picked
  const buildSummaryText = () => {
    const monthlyStr = fmt(totalMonthlySpend);

    if (freeIsBest) {
      const gap = fmt(Math.abs(best.ongoingAdv));
      const baselineLabel = freeTier.id === 'current' ? 'your current cards' : 'your no-fee cards';
      return `At ${monthlyStr}/mo, even the best paid option (${best.name}) costs ${gap}/yr more in fees than it earns back in rewards. Stick with ${baselineLabel}.`;
    }

    // Was a higher tier filtered out because it's out of reach?
    if (nextUp) {
      return `At ${monthlyStr}/mo, ${best.name} earns you ${fmt(best.ongoingAdv)}/yr more after fees and is the best combo you can unlock with your current spending. ${nextUp.name} would earn more, but its bonus spend requirements need ${fmt(nextUpMonthlyNeeded)}/mo — more than you currently spend.`;
    }

    // Most premium achievable tier that scored worse
    const skipped = achievable
      .slice(1)
      .sort((a, b) => b.effectiveFee - a.effectiveFee)[0];

    if (skipped && skipped.netPerYear < best.netPerYear) {
      const skippedOngoing = skipped.netPerYear - freeTier.netPerYear;
      const verdict = skippedOngoing < 0
        ? `${skipped.name}'s annual fee would cost you ${fmt(Math.abs(skippedOngoing))}/yr more than it earns back`
        : `${skipped.name} would only net ${fmt(skippedOngoing)}/yr — ${fmt(best.ongoingAdv - skippedOngoing)} less for a higher fee`;
      return `At ${monthlyStr}/mo, ${best.name} earns you ${fmt(best.ongoingAdv)}/yr more after fees — the best return for what you actually spend. ${verdict}.`;
    }

    return `At ${monthlyStr}/mo, ${best.name} earns you ${fmt(best.ongoingAdv)}/yr more after fees than your current setup — without spending a dollar more.`;
  };

  const summaryText = buildSummaryText();

  if (freeIsBest) {
    return (
      <div className="rec-banner rec-free">
        <div className="rec-icon">✓</div>
        <div className="rec-content">
          <div className="rec-headline">{freeTier.id === 'current' ? 'Your current wallet is the right call' : 'Your free wallet is the right call'}</div>
          <div className="rec-detail">{summaryText}</div>
        </div>
      </div>
    );
  }

  const redemptionStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);

  return (
    <div className="rec-banner rec-paid">
      {/* Summary: plain-English spend-aware rationale */}
      {summaryText && <div className="rec-summary">{summaryText}</div>}

      {/* Row 1: headline + KPI chips */}
      <div className="rec-top">
        <div className="rec-headline">Upgrade to <strong>{best.name}</strong></div>
        <div className="rec-kpis">
          {best.ongoingAdv > 0 && (
            <span className="rec-kpi">{fmt(best.ongoingAdv)}/yr ongoing</span>
          )}
          {best.welcomeBonus > 0 && best.year1Adv > 0 && (
            <span className="rec-kpi rec-kpi-accent">{fmt(best.year1Adv)} in Year 1</span>
          )}
        </div>
      </div>

      {/* Row 2: per-card application rows */}
      {newCards.length > 0 ? (
        <div className="rec-applications">
          {newCards.map(cid => {
            const card = CARDS.find(c => c.id === cid);
            if (!card) return null;
            const wb = card.welcomeBonus;
            const rawBonus = formatRawBonus(card);
            const dollarVal = !wb || wb.amount === 0 ? 0
              : wb.type === 'cashback' ? wb.amount
              : Math.round(wb.amount * ((redemptionStyle?.valuations[card.issuer] || 1.0) / 100));

            let feasibility = null, statusLine = null;
            if (wb && wb.spend > 0 && totalMonthlySpend > 0) {
              const monthlyNeeded = Math.ceil(wb.spend / wb.months);
              const shortfall = Math.max(0, monthlyNeeded - totalMonthlySpend);
              const pct = Math.min(100, (totalMonthlySpend / monthlyNeeded) * 100);
              feasibility = pct >= 100 ? 'easy' : pct >= 65 ? 'stretch' : 'hard';
              if (feasibility === 'easy') {
                statusLine = <>Put <strong>{fmt(monthlyNeeded)}/mo</strong> on this card for {wb.months} months — your existing spend covers it.</>;
              } else if (feasibility === 'stretch') {
                statusLine = <>Requires all your spending on this card + <strong>{fmt(shortfall)}/mo more</strong> for {wb.months} months.</>;
              } else {
                statusLine = <>You'd still be <strong>{fmt(shortfall)}/mo short</strong> even with all spend here — only viable with a large purchase.</>;
              }
            }

            return (
              <div key={cid} className={`rec-app-row${feasibility ? ` rec-app-${feasibility}` : ''}`}>
                <div className="rec-app-top">
                  <span className="rec-app-name">{card.name}</span>
                  {rawBonus && dollarVal > 0 && (
                    <span className="rec-app-bonus">{rawBonus} <span className="rec-app-bonus-val">≈ {fmt(dollarVal)}</span></span>
                  )}
                  {wb && wb.spend > 0 && (
                    <span className="rec-app-req">Spend {fmt(wb.spend)} in {wb.months}mo</span>
                  )}
                  {feasibility && (
                    <span className={`rec-app-badge rec-app-badge-${feasibility}`}>
                      {feasibility === 'easy' ? 'Achievable' : feasibility === 'stretch' ? 'Stretch' : 'Difficult'}
                    </span>
                  )}
                </div>
                {statusLine && <div className="rec-app-status">{statusLine}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rec-owned-note">You already own all the cards — just optimize your routing.</div>
      )}

      {/* Spend-up nudge: show what they'd unlock by spending a bit more */}
      {nextUp && nextUpSpendMore > 0 && (nextUp5yr - best5yr) > 50 && (
        <div className="rec-spendUp">
          <span className="rec-spendUp-icon">↑</span>
          <span className="rec-spendUp-text">
            Spend <strong>{fmt(nextUpSpendMore)}/mo more</strong> and {nextUp.name} becomes reachable
            — that's <strong>{fmt(nextUp5yr - best5yr)} more over 5 years</strong>.
          </span>
        </div>
      )}

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

// Compute welcome bonus discounted by spend feasibility.
// Each new card's dollar bonus is multiplied by how achievable the spend req is.
// A $900 bonus requiring $4k/3mo is worth $900 if you spend $2k/mo (covers it),
// but only $450 if you spend $1k/mo (50% coverage).
function adjustedWelcomeBonus(tierCards, ownedCards, heldCards, totalMonthlySpend, redeemStyle) {
  const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
  let total = 0;
  for (const cardId of tierCards) {
    if (ownedCards.includes(cardId) || heldCards.includes(cardId)) continue;
    const card = CARDS.find(c => c.id === cardId);
    if (!card?.welcomeBonus?.amount) continue;
    const wb = card.welcomeBonus;
    const dollarBonus = wb.isCashbackMatch ? 0 // dynamic; ignore in scoring
      : wb.type === 'cashback' ? wb.amount
      : Math.round(wb.amount * ((style?.valuations[card.issuer] || 1.0) / 100));
    const feasibility = wb.spend > 0 && totalMonthlySpend > 0
      ? Math.min(1, (totalMonthlySpend * wb.months) / wb.spend)
      : 1;
    total += dollarBonus * feasibility;
  }
  return total;
}

function buildBonusItems(cardIds, ownedCards, heldCards, redeemStyle) {
  const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
  return cardIds
    .filter(cid => !ownedCards.includes(cid) && !heldCards.includes(cid))
    .map(cid => {
      const card = CARDS.find(c => c.id === cid);
      const raw = formatRawBonus(card);
      if (!raw || !card?.welcomeBonus?.amount) return null;
      const rawDollar = card.welcomeBonus.type === 'cashback'
        ? card.welcomeBonus.amount
        : Math.round(card.welcomeBonus.amount * ((style?.valuations[card.issuer] || 1.0) / 100));
      const shortName = card.name.replace('Chase ', '').replace('Amex ', '').replace('Capital One ', '');
      return { name: shortName, raw, dollar: fmt(rawDollar), rawDollar };
    })
    .filter(Boolean);
}

// ─── Bonus breakdown popover ──────────────────────────────────────────────────
function BonusBreakdown({ items }) {
  const [visible, setVisible] = useState(false);
  if (!items || items.length === 0) return null;
  return (
    <span
      className="bonus-breakdown-wrap"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span className="cmp-tooltip-icon">?</span>
      {visible && (
        <span className="bonus-breakdown-pop">
          {items.map((item, i) => (
            <span key={i} className="bonus-breakdown-row">
              <span className="bonus-breakdown-name">{item.name}</span>
              <span className="bonus-breakdown-val">{item.raw} <span className="bonus-breakdown-dol">({item.dollar})</span></span>
            </span>
          ))}
          {items.length > 1 && (
            <span className="bonus-breakdown-total">
              <span>Total</span>
              <span>{fmt(items.reduce((s, i) => s + i.rawDollar, 0))}</span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// ─── Side-by-Side Comparison ──────────────────────────────────────────────────
function TierComparison({ tiers, defaultA, defaultB, totalMonthlySpend, ownedCards = [], heldCards = [], redeemStyle = 'portal' }) {
  const [idA, setIdA] = useState(defaultA ?? tiers[0]?.id);
  const [idB, setIdB] = useState(defaultB ?? tiers[2]?.id ?? tiers[1]?.id);
  const tA = tiers.find(t => t.id === idA);
  const tB = tiers.find(t => t.id === idB);
  if (!tA || !tB) return null;

  // 3-year totals: welcome bonus counts once (already in year1), then netPerYear × 2 more
  const threeYearA = tA.year1 + tA.netPerYear * 2;
  const threeYearB = tB.year1 + tB.netPerYear * 2;
  const threeYearDelta = threeYearB - threeYearA; // positive → B wins

  // Winner determined by 3-year total
  const winner3yr = Math.abs(threeYearDelta) < 1 ? null : threeYearDelta > 0 ? tB : tA;
  const annualDelta = tB.netPerYear - tA.netPerYear; // positive → B better annually

  // Break-even: how many months until the cumulative advantage crosses zero
  // cumX[m] = welcomeBonus + netPerYear * m/12
  let breakevenMonth = null;
  if (winner3yr) {
    const [win, lose] = threeYearDelta > 0 ? [tB, tA] : [tA, tB];
    for (let m = 1; m <= 60; m++) {
      const cumWin  = win.welcomeBonus  + win.netPerYear  * m / 12;
      const cumLose = lose.welcomeBonus + lose.netPerYear * m / 12;
      if (cumWin > cumLose) { breakevenMonth = m; break; }
    }
  }

  const redeemLabel = REDEMPTION_STYLES.find(r => r.id === (tA.redeemStyle || tB.redeemStyle))?.label || 'your redemption style';

  const metrics = [
    {
      label: 'Annual Earnings',
      tooltip: 'The best card in this wallet for each spending category, multiplied by your monthly spend and point valuation. Assumes you always use the highest-earning card for each purchase.',
      a: tA.earnings, b: tB.earnings, fmt: fmt,
    },
    {
      label: 'Effective Fee',
      tooltip: 'Total annual fees minus any statement credits you selected (e.g. $120 Amex dining credit). This is your real out-of-pocket cost after offsets.',
      a: -tA.effectiveFee, b: -tB.effectiveFee,
      fmt: v => v === 0 ? '$0' : `−${fmt(Math.abs(v))}`,
      higherWins: false,
    },
    {
      label: 'Net / Year',
      tooltip: 'Annual Earnings minus Effective Fee. What you actually keep each year on an ongoing basis — the most honest apples-to-apples number.',
      a: tA.netPerYear, b: tB.netPerYear, fmt: fmt,
    },
    {
      label: 'Welcome Bonus',
      tooltip: 'One-time signup bonus for new cards only — not counted for cards you already own. Converted to dollars at your selected redemption style. Requires hitting the minimum spend within the offer window.',
      a: tA.welcomeBonus, b: tB.welcomeBonus,
      fmt: v => v > 0 ? fmt(v) : '—',
      bonusItemsA: buildBonusItems(tA.cards, ownedCards, heldCards, redeemStyle),
      bonusItemsB: buildBonusItems(tB.cards, ownedCards, heldCards, redeemStyle),
    },
    {
      label: 'Year 1 Total',
      tooltip: 'Net/Year plus the welcome bonus. Your best-case first year, assuming you hit the minimum spend for every signup bonus.',
      a: tA.year1, b: tB.year1, fmt: fmt,
    },
    {
      label: '3-Year Total',
      tooltip: 'Year 1 Total plus Net/Year for years 2–3. Bonuses counted once. Assumes your spending stays consistent — adjust the spend inputs to model changes.',
      a: threeYearA, b: threeYearB, fmt: fmt,
      highlight: true,
    },
  ];

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
          <div className={`comparison-col-header ${threeYearA > threeYearB ? 'winner' : ''}`}>{tA.name}</div>
          <div className={`comparison-col-header ${threeYearB > threeYearA ? 'winner' : ''}`}>{tB.name}</div>
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
          const higherWins = m.higherWins !== false;
          const aWins = higherWins ? m.a > m.b : m.a < m.b;
          const bWins = higherWins ? m.b > m.a : m.b < m.a;
          return (
            <div key={m.label} className={`comparison-row${m.highlight ? ' comparison-row-highlight' : ''}`}>
              <div className="comparison-metric">
                <span className="comparison-metric-label">
                  {m.label}
                  {m.tooltip && (
                    <span className="cmp-tooltip-wrap">
                      <span className="cmp-tooltip-icon">?</span>
                      <span className="cmp-tooltip-box">
                        {m.tooltip.split('\n').map((line, i) => (
                          <span key={i} style={{ display: 'block' }}>{line}</span>
                        ))}
                      </span>
                    </span>
                  )}
                </span>
                {m.note && <span className="comparison-note">{m.note}</span>}
              </div>
              <div className={`comparison-cell ${aWins ? 'cell-winner' : bWins ? 'cell-loser' : ''}`}>
                {aWins && <span className="cell-check">✓</span>}
                {m.fmt(m.a)}
                {m.bonusItemsA && <BonusBreakdown items={m.bonusItemsA} />}
              </div>
              <div className={`comparison-cell ${bWins ? 'cell-winner' : aWins ? 'cell-loser' : ''}`}>
                {bWins && <span className="cell-check">✓</span>}
                {m.fmt(m.b)}
                {m.bonusItemsB && <BonusBreakdown items={m.bonusItemsB} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Aha callout */}
      {winner3yr ? (
        <div className="comparison-aha">
          <div className="comparison-aha-left">
            <div className="comparison-aha-label">3-year advantage</div>
            <div className="comparison-aha-number">{fmt(Math.abs(threeYearDelta))}</div>
            <div className="comparison-aha-name">more with {winner3yr.name}</div>
          </div>
          <div className="comparison-aha-pills">
            {Math.abs(annualDelta) >= 1 && (
              <span className="comparison-aha-pill">
                {fmt(Math.abs(annualDelta))}/yr ongoing edge
              </span>
            )}
            {winner3yr.welcomeBonus > 0 && (
              <span className="comparison-aha-pill">
                {fmt(winner3yr.welcomeBonus)} welcome bonus (Year 1)
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="comparison-verdict tied">These wallets perform equally at your spend level</div>
      )}

      {/* Footnote */}
      <p className="comparison-footnote">
        Projections assume your{totalMonthlySpend > 0 ? ` ${fmt(totalMonthlySpend)}/mo` : ''} spending pattern stays consistent over 3 years.
        Welcome bonuses are shown at full value in Year 1 — actual payout depends on hitting the minimum spend requirement within the offer window.
        Point valuations reflect your selected redemption style.
      </p>
    </div>
  );
}

// ─── Custom Combo Builder ─────────────────────────────────────────────────────
function CustomComboBuilder({ spend, selectedCredits, redeemStyle, heldCards, activationStatus, currentTier }) {
  const [customCards, setCustomCards] = useState([]);

  const toggle = id => setCustomCards(prev =>
    prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
  );

  const earnings   = customCards.length > 0 ? calculateWalletEarnings(customCards, spend, activationStatus, redeemStyle) : 0;
  const effectiveFee = customCards.reduce((s, id) => s + calculateEffectiveFee(id, selectedCredits), 0);
  const netPerYear = earnings - effectiveFee;

  let wb = 0;
  for (const cardId of customCards) {
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
      wb += wbObj.amount * ((style?.valuations[card.issuer] || 1.0) / 100);
    }
  }

  const vsCurrentNet = currentTier ? netPerYear - currentTier.netPerYear : null;

  return (
    <div className="custom-builder">
      <div className="custom-builder-header">
        <div>
          <h3 className="custom-builder-title">Build Your Own Combo</h3>
          <p className="custom-builder-desc">Mix and match any cards to see live earnings for your spend profile.</p>
        </div>
      </div>

      <div className="custom-chip-grid">
        {CARDS.map(card => {
          const sel = customCards.includes(card.id);
          return (
            <button key={card.id}
              className={`custom-chip ${sel ? 'selected' : ''}`}
              onClick={() => toggle(card.id)}>
              <span className="custom-chip-dot" style={{ background: card.color }} />
              <span className="custom-chip-name">
                {card.name.replace('Chase ', '').replace('Amex ', '').replace('Capital One ', '')}
              </span>
              {card.annualFee > 0 && <span className="custom-chip-fee">${card.annualFee}</span>}
            </button>
          );
        })}
      </div>

      {customCards.length > 0 ? (
        <div className="custom-stats">
          <div className="custom-stat">
            <span className="custom-stat-label">Annual Earnings</span>
            <span className="custom-stat-value">{fmt(earnings)}</span>
          </div>
          <div className="custom-stat">
            <span className="custom-stat-label">Annual Fees</span>
            <span className="custom-stat-value" style={{ color: 'var(--gray-500)' }}>
              {effectiveFee > 0 ? `−${fmt(effectiveFee)}` : '$0'}
            </span>
          </div>
          <div className="custom-stat">
            <span className="custom-stat-label">Net / Year</span>
            <span className="custom-stat-value" style={{ color: netPerYear >= 0 ? 'var(--color-success)' : '#dc2626' }}>
              {fmt(netPerYear)}
            </span>
          </div>
          {wb > 0 && (
            <div className="custom-stat">
              <span className="custom-stat-label">Welcome Bonus</span>
              <span className="custom-stat-value" style={{ color: '#6366f1' }}>{fmt(wb)}</span>
            </div>
          )}
          {vsCurrentNet !== null && (
            <div className="custom-stat custom-stat-vs">
              <span className="custom-stat-label">vs Your Current Wallet</span>
              <span className="custom-stat-value" style={{ color: vsCurrentNet >= 0 ? 'var(--color-success)' : '#dc2626', fontWeight: 700 }}>
                {vsCurrentNet >= 0 ? '+' : ''}{fmt(vsCurrentNet)}/yr
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="custom-empty">Select cards above to see live estimates</div>
      )}
    </div>
  );
}

// ─── Results ──────────────────────────────────────────────────────────────────
function WalletResults({ local, onRestart, onGoToStep }) {
  const { spend, ownedCards, selectedCredits, redeemStyle, heldCards, activationStatus } = local;
  const freeWallet = WALLET_TIERS.find(t => t.id === 'free');
  const [expandedTier, setExpandedTier] = useState(null);

  // Prepend "Your Current Wallet" if user has cards
  const currentWalletDef = ownedCards.length > 0
    ? { id: 'current', name: 'Your Current Wallet', description: 'Your cards, optimally routed', cards: ownedCards }
    : null;
  const tierDefs = currentWalletDef ? [currentWalletDef, ...WALLET_TIERS] : WALLET_TIERS;

  const tiers = tierDefs.map(tier => {
    const earnings = calculateWalletEarnings(tier.cards, spend, activationStatus, redeemStyle);
    const totalFee = tier.cards.reduce((s, id) => {
      const card = CARDS.find(c => c.id === id);
      return s + (card?.annualFee || 0);
    }, 0);
    const effectiveFee = tier.cards.reduce((s, id) => s + calculateEffectiveFee(id, selectedCredits), 0);
    const netPerYear = earnings - effectiveFee;

    // Welcome bonus — skip cards the user already owns or has previously held
    let wb = 0;
    for (const cardId of tier.cards) {
      if (ownedCards.includes(cardId)) continue;
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

    // Current wallet has no welcome bonus (already own the cards)
    if (tier.id === 'current') wb = 0;

    const year1 = netPerYear + wb;
    const breakeven = (tier.id !== 'free' && tier.id !== 'current')
      ? calculateBreakeven(freeWallet.cards, tier.cards, spend, selectedCredits, heldCards, redeemStyle)
      : null;

    return { ...tier, earnings, totalFee, effectiveFee, netPerYear, year1, welcomeBonus: wb, breakeven };
  });

  const currentTier = tiers.find(t => t.id === 'current') || null;
  const totalMonthlySpend = Object.values(spend).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  // Best tier = same 3-year formula as RecommendationBanner
  const bestTier = [...tiers]
    .filter(t => t.id !== 'current' && t.id !== 'free')
    .sort((a, b) => (b.year1 + b.netPerYear * 2) - (a.year1 + a.netPerYear * 2))[0] || tiers[0];

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

      {/* 1. Recommendation — quick answer at the top */}
      <RecommendationBanner tiers={tiers} ownedCards={ownedCards} heldCards={heldCards} totalMonthlySpend={totalMonthlySpend} spend={spend} redeemStyle={redeemStyle} />

      {/* 2. Compare tool — most actionable view, above tier cards */}
      <TierComparison
        tiers={tiers}
        defaultA={currentTier ? 'current' : 'free'}
        defaultB={bestTier?.id}
        totalMonthlySpend={totalMonthlySpend}
        ownedCards={ownedCards}
        heldCards={heldCards}
        redeemStyle={redeemStyle}
      />

      {/* 3. Tier cards — detailed breakdown */}
      <div className="results-section">
        <h3 className="results-section-title">Wallet Options</h3>
        <div className="wallet-tiers">
          {tiers.map(tier => {
            const isCurrent = tier.id === 'current';
            const isBest = tier.id === bestTier?.id;
            const isExpanded = expandedTier === tier.id;
            // Chart baseline: prefer current wallet, fall back to free
            const chartBaseCards = currentTier ? currentTier.cards : freeWallet.cards;
            const chartBaseName  = currentTier ? 'Your Current Wallet' : 'Free Wallet';

            const vsCurrentDelta = currentTier && !isCurrent ? tier.netPerYear - currentTier.netPerYear : null;
            const newCardIds = tier.cards.filter(cid => !ownedCards.includes(cid) && !heldCards.includes(cid));

            return (
              <div key={tier.id} className={`wallet-tier ${isCurrent ? 'tier-current' : ''} ${isBest ? 'best' : ''} ${isExpanded ? 'expanded' : ''}`}>

                {/* ── Collapsed header (always visible) ── */}
                <div className="wt-header" onClick={() => setExpandedTier(isExpanded ? null : tier.id)}>
                  <div className="wt-left">
                    <div className="wt-name">
                      {tier.name}
                      {isCurrent && <span className="badge-current">CURRENT</span>}
                      {!isCurrent && isBest && <span className="badge-best">BEST</span>}
                    </div>
                    <div className="wt-pills">
                      {tier.cards.map(cid => {
                        const card = CARDS.find(c => c.id === cid);
                        const owns = ownedCards.includes(cid);
                        return card ? (
                          <span key={cid} className={`wt-pill ${owns ? 'wt-pill-own' : 'wt-pill-new'}`}>
                            {card.name.replace('Chase ', '').replace('Amex ', '').replace('Capital One ', '')}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                  <div className="wt-right">
                    <div className="wt-kpi">
                      <span className="wt-kpi-val">{fmt(tier.netPerYear)}</span>
                      <span className="wt-kpi-label">net/yr</span>
                    </div>
                    {vsCurrentDelta !== null && (
                      <div className={`wt-delta ${vsCurrentDelta >= 0 ? 'pos' : 'neg'}`}>
                        {vsCurrentDelta >= 0 ? '+' : ''}{fmt(vsCurrentDelta)}/yr vs yours
                      </div>
                    )}
                    {isCurrent && (
                      <div className="wt-delta pos">your baseline</div>
                    )}
                    <span className="wt-chevron">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div className="wt-body">

                    {/* Earnings breakdown */}
                    <div className="wt-breakdown">
                      {/* Per-category earnings rows */}
                      {(() => {
                        const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
                        return CATEGORIES.map(cat => {
                          const monthly = parseFloat(spend[cat.id]) || 0;
                          if (!monthly) return null;
                          // Find best card in this tier for this category
                          let bestCard = null, bestRate = 0;
                          for (const cid of tier.cards) {
                            const card = CARDS.find(c => c.id === cid);
                            if (!card) continue;
                            const r = getEffectiveRate(card, cat.id, activationStatus, monthly);
                            if (r > bestRate) { bestRate = r; bestCard = card; }
                          }
                          if (!bestCard) return null;
                          const val = (style?.valuations[bestCard.issuer] || 1.0) / 100;
                          const annual = monthly * 12 * bestRate * val;
                          const shortName = bestCard.name.replace('Chase ', '').replace('Amex ', '').replace('Capital One ', '');
                          return (
                            <div key={cat.id} className="wt-breakdown-row wt-breakdown-cat">
                              <span className="wt-breakdown-cat-label">
                                {cat.icon} {cat.label}
                                <span className="wt-breakdown-cat-detail">
                                  {fmt(monthly)}/mo × {bestRate}x ({shortName}) × {(val * 100).toFixed(1)}¢/pt × 12
                                </span>
                              </span>
                              <span>{fmt(annual)}</span>
                            </div>
                          );
                        }).filter(Boolean);
                      })()}
                      <div className="wt-breakdown-row wt-breakdown-subtotal">
                        <span>Total earnings</span><span>{fmt(tier.earnings)}</span>
                      </div>
                      {/* Per-card fee breakdown */}
                      {tier.cards.map(cid => {
                        const card = CARDS.find(c => c.id === cid);
                        if (!card || card.annualFee === 0) return null;
                        const cardCredits = STATEMENT_CREDITS[cid] || [];
                        const chosenCredits = cardCredits.filter(cr =>
                          (selectedCredits[cid] || []).includes(cr.id)
                        );
                        const creditSum = chosenCredits.reduce((s, cr) => s + cr.value, 0);
                        const effective = Math.max(0, card.annualFee - creditSum);
                        const shortName = card.name.replace('Chase ', '').replace('Amex ', '').replace('Capital One ', '');
                        return (
                          <div key={cid} className="wt-breakdown-fee-card">
                            <div className="wt-breakdown-row wt-breakdown-cat">
                              <span>{shortName}</span>
                              <span>−${card.annualFee}</span>
                            </div>
                            {chosenCredits.map(cr => (
                              <div key={cr.id} className="wt-breakdown-row wt-breakdown-credit">
                                <span>+ {cr.label}</span>
                                <span>+${cr.value}</span>
                              </div>
                            ))}
                            {creditSum > 0 && (
                              <div className="wt-breakdown-row wt-breakdown-cat" style={{ fontWeight: 600 }}>
                                <span>Effective fee</span>
                                <span>−${effective}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="wt-breakdown-row muted">
                        <span>Total fees after credits</span>
                        <span>{tier.effectiveFee > 0 ? `−${fmt(tier.effectiveFee)}` : '$0'}</span>
                      </div>
                      <div className="wt-breakdown-row total">
                        <span>Net / year</span><span>{fmt(tier.netPerYear)}</span>
                      </div>
                      {tier.netPerYear < 0 && (
                        <div className="wt-breakdown-negative-note">
                          Fees outweigh rewards at your current spend level — you'd pay more than you earn back.
                        </div>
                      )}
                      {!isCurrent && tier.welcomeBonus > 0 && (
                        <div className="wt-breakdown-row accent">
                          <span>+ Welcome bonus</span><span>{fmt(tier.welcomeBonus)}</span>
                        </div>
                      )}
                      {!isCurrent && tier.welcomeBonus > 0 && (
                        <div className="wt-breakdown-row total accent">
                          <span>Year 1 total</span><span>{fmt(tier.year1)}</span>
                        </div>
                      )}
                    </div>

                    {/* New card applications */}
                    {newCardIds.length > 0 && (
                      <div className="wt-new-cards">
                        <div className="wt-section-label">New applications needed</div>
                        {newCardIds.map(cid => {
                          const card = CARDS.find(c => c.id === cid);
                          if (!card) return null;
                          const f = getBonusFeasibility(card);
                          const rdStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
                          const raw = formatRawBonus(card);
                          const wb = card.welcomeBonus;
                          const dollarVal = !wb?.amount ? 0
                            : wb.type === 'cashback' ? wb.amount
                            : Math.round(wb.amount * ((rdStyle?.valuations[card.issuer] || 1.0) / 100));
                          const effFee = calculateEffectiveFee(cid, selectedCredits);
                          const feasLabel = { easy: 'Achievable', stretch: 'Stretch', hard: 'Difficult', match: 'Year 1 match', held: 'Already held' };
                          const monthlyNeeded = wb?.spend > 0 ? Math.ceil(wb.spend / wb.months) : 0;
                          const shortfall = monthlyNeeded > 0 ? Math.max(0, monthlyNeeded - totalMonthlySpend) : 0;
                          return (
                            <div key={cid} className="wt-card-row">
                              <div className="wt-card-row-top">
                                <span className="wt-card-row-name">{card.name}</span>
                                <span className="wt-card-row-fee">
                                  {effFee === 0 ? 'No annual fee'
                                    : effFee < card.annualFee ? `$${effFee}/yr after credits`
                                    : `$${card.annualFee}/yr`}
                                </span>
                              </div>
                              {raw && dollarVal > 0 && (
                                <div className="wt-card-row-bonus">
                                  <span className="wt-bonus-raw">{raw}</span>
                                  <span className="wt-bonus-dol">≈ {fmt(dollarVal)}</span>
                                  {f && <span className={`wt-bonus-badge wt-bonus-${f.tier}`}>{feasLabel[f.tier]}</span>}
                                </div>
                              )}
                              {f && wb?.spend > 0 && f.tier !== 'held' && f.tier !== 'match' && (
                                <div className="wt-card-row-spend">
                                  Spend {fmt(wb.spend)} in {wb.months}mo
                                  {shortfall > 0
                                    ? <> — needs <strong>{fmt(shortfall)}/mo more</strong> than your current total</>
                                    : <> — <strong>your {fmt(totalMonthlySpend)}/mo covers it</strong></>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Breakeven */}
                    {!isCurrent && tier.id !== 'free' && (
                      <div className={`wt-breakeven ${tier.breakeven ? 'ok' : 'never'}`}>
                        {tier.breakeven
                          ? `Pays for itself vs free wallet by month ${tier.breakeven}`
                          : "Doesn't break even vs free wallet within 5 years at this spend level"}
                      </div>
                    )}

                    {/* Chart */}
                    {!isCurrent && tier.id !== 'free' && (() => {
                      const chartData = generateCumulativeData(
                        chartBaseCards, tier.cards, spend, selectedCredits, heldCards, redeemStyle
                      );
                      return (
                        <div className="tier-chart">
                          <div className="tier-chart-title">Annual net vs. {chartBaseName}</div>
                          <NetAdvantageChart
                            freeData={chartData.free}
                            tierData={chartData.tier}
                            tierName={tier.name}
                            welcomeBonus={tier.welcomeBonus}
                          />
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Custom combo builder */}
      <CustomComboBuilder
        spend={spend}
        selectedCredits={selectedCredits}
        redeemStyle={redeemStyle}
        heldCards={heldCards}
        activationStatus={activationStatus}
        currentTier={currentTier}
      />

      {/* 5. Optimize current — best card per category */}
      {ownedCards.length > 0 && (
        <div className="best-card-section">
          <h3 className="best-card-title">Optimize Your Current Wallet</h3>
          <p className="best-card-subtitle">Best card to use for each spend category right now.</p>
          <div className="best-card-table">
            {CATEGORIES.filter(cat => parseFloat(spend[cat.id]) > 0).map(cat => {
              const monthly = parseFloat(spend[cat.id]) || 0;
              let bestCard = null, bestRate = 0, bestVal = 0;
              for (const cid of ownedCards) {
                const card = CARDS.find(c => c.id === cid);
                if (!card) continue;
                const rate = getEffectiveRate(card, cat.id, activationStatus, monthly);
                const rdStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
                const val = (rdStyle?.valuations[card.issuer] || 1.0) / 100;
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
        {step === 2 && <StepPreferences {...stepProps} />}
      </div>
    </div>
  );
}
