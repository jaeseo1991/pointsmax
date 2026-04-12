import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePlaidLink } from 'react-plaid-link';
import { useApp } from '../context/AppContext';
import { CARDS, CATEGORIES, STATEMENT_CREDITS, REDEMPTION_STYLES, WALLET_TIERS } from '../data/cards';
import {
  calculateWalletEarnings,
  calculateEffectiveFee,
  getEffectiveRate,
  fmt,
} from '../utils/calculations';
import { analyzeTransactions, projectSpend } from '../utils/plaidCategories';

const API = 'http://localhost:3001';

// ─── Plaid account → card matching ───────────────────────────────────────────
// Ordered most-specific first so "Sapphire Preferred" doesn't match "Sapphire Reserve"
const CARD_NAME_PATTERNS = [
  { id: 'csr',           keywords: ['sapphire reserve'] },
  { id: 'csp',           keywords: ['sapphire preferred'] },
  { id: 'cfu',           keywords: ['freedom unlimited'] },
  { id: 'cf',            keywords: ['freedom flex', 'freedom'] },
  { id: 'amex_plat',     keywords: ['platinum card', 'the platinum', 'amex platinum'] },
  { id: 'amex_gold',     keywords: ['gold card', 'amex gold', 'american express gold'] },
  { id: 'amex_bcp',      keywords: ['blue cash preferred', 'blue cash everyday'] },
  { id: 'cdc',           keywords: ['double cash'] },
  { id: 'wfac',          keywords: ['active cash'] },
  { id: 'co_venture',    keywords: ['venture x', 'venture rewards', 'venture'] },
  { id: 'discover',      keywords: ['discover it', 'discover'] },
  { id: 'usb_cash_plus', keywords: ['cash+', 'cash plus'] },
  { id: 'robinhood_gold',keywords: ['robinhood gold', 'robinhood'] },
  { id: 'amazon_prime',  keywords: ['amazon prime', 'prime rewards', 'amazon rewards'] },
  { id: 'apple_card',    keywords: ['apple card'] },
  { id: 'bilt',          keywords: ['bilt'] },
];

function matchAccountToCard(name = '', officialName = '') {
  const haystack = `${name} ${officialName}`.toLowerCase();
  for (const { id, keywords } of CARD_NAME_PATTERNS) {
    if (keywords.some(kw => haystack.includes(kw))) return id;
  }
  return null;
}

// ─── Step icons ───────────────────────────────────────────────────────────────
const CAT_ICONS = { dining:'🍽️', groceries:'🛒', travel:'✈️', gas:'⛽', shopping:'🛍️', subscriptions:'📱', entertainment:'🎬', other:'💳' };
const TOP_RATES = {
  cfu: ['dining: 3x', 'all else: 1.5x'], cdc: ['everything: 2x'],
  csp: ['dining: 3x', 'travel: 2x'], csr: ['dining: 3x', 'travel: 3x', '+$300 travel credit'],
  amex_gold: ['dining: 4x', 'groceries: 4x', 'travel: 3x (flights)'], amex_plat: ['travel: 5x (flights)'],
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

function StepSpend({ local, setLocal, onNext, plaidSource, onConnectBank }) {
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
      {plaidSource && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--color-success-light)', border: '1px solid var(--color-success)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--color-success)' }}>
          <span>✅ <strong>Pre-filled from your bank transactions</strong> — review and adjust as needed.</span>
          <Link to="/transactions" style={{ color: 'var(--color-success)', whiteSpace: 'nowrap', textDecoration: 'underline', fontSize: 12 }}>
            See what we read →
          </Link>
        </div>
      )}
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
      {total === 0 && (
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 12, textAlign: 'center' }}>
          Enter at least one spending category to continue.
        </p>
      )}
      <div className="wizard-nav">
        <button
          onClick={onConnectBank}
          style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          ← Connect bank instead
        </button>
        <button className="btn btn-primary" onClick={onNext} disabled={total === 0}
          style={{ opacity: total === 0 ? 0.4 : 1, cursor: total === 0 ? 'not-allowed' : 'pointer' }}>
          Next: Pick Cards →</button>
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

function StepCards({ local, setLocal, onNext, onBack, plaidDetectedCards = [] }) {
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

      {plaidDetectedCards.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-success-light)', border: '1px solid var(--color-success)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--color-success)' }}>
          🔗 <strong>{plaidDetectedCards.length} card{plaidDetectedCards.length !== 1 ? 's' : ''} detected from your bank</strong> — review and add any that are missing.
        </div>
      )}

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
            </div>
            <div className="card-grid">
              {bankCards.map(card => {
                const restricted = (card.issuer === 'Chase' && over524) || (card.issuer === 'Amex' && amexFull);
                return (
                  <button key={card.id}
                    className={`card-option ${owned.includes(card.id) ? 'selected' : ''} ${restricted ? 'restricted' : ''}`}
                    onClick={() => toggle(card.id)}>
                    <div className="card-check" />
                    <div className="card-info">
                      <div className="card-name">{card.name}</div>
                      <div className="card-fee-row">
                        <span className={`card-fee-badge ${card.annualFee === 0 ? 'free' : 'paid'}`}>
                          {card.annualFee === 0 ? 'No fee' : `$${card.annualFee}/yr`}
                        </span>
                        {plaidDetectedCards.includes(card.id) && (
                          <span className="card-detected-badge">🔗 from bank</span>
                        )}
                        {restricted && !owned.includes(card.id) && (
                          <span className="card-ineligible-tag">Not eligible</span>
                        )}
                      </div>
                      <div className="card-rates">
                        {(TOP_RATES[card.id] || []).map(r => (
                          <span key={r} className="rate-chip">{r}</span>
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

      {owned.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 12, textAlign: 'center' }}>
          Select at least one card you currently own to continue.
        </p>
      )}
      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext} disabled={owned.length === 0}
          style={{ opacity: owned.length === 0 ? 0.4 : 1, cursor: owned.length === 0 ? 'not-allowed' : 'pointer' }}>
          Next: Preferences →</button>
      </div>
    </>
  );
}

// Cards that earn transferable points (not cashback).
// Chase UR cards (CFU, CF) are excluded — they need CSR/CSP to transfer,
// and those are listed directly here.
const TRANSFER_ELIGIBLE_IDS = new Set(['csr', 'csp', 'amex_gold', 'amex_plat', 'cdc', 'co_venture']);

// Max new paid card applications to recommend at once — more is overwhelming
const MAX_NEW_APPS = 2;

// Count new paid card applications a tier requires for a given user
function newAppsNeeded(tier, ownedCards, heldCards) {
  return tier.cards.filter(cid => {
    if (ownedCards.includes(cid) || heldCards.includes(cid)) return false;
    const card = CARDS.find(c => c.id === cid);
    return card?.annualFee > 0; // $0-fee cards (CFU etc.) don't count as application burden
  }).length;
}

// ─── Step 3: Preferences (Redemption + Credits merged) ───────────────────────
function StepPreferences({ local, setLocal, onNext, onBack }) {
  const { redeemStyle, selectedCredits, ownedCards } = local;

  const canTransfer = ownedCards.some(id => TRANSFER_ELIGIBLE_IDS.has(id));

  const [showAdvanced, setShowAdvanced] = useState(
    canTransfer && (redeemStyle === 'transfer' || redeemStyle === 'expert')
  );

  // If user no longer has any transfer-eligible card, reset to portal
  useEffect(() => {
    if (!canTransfer && (redeemStyle === 'transfer' || redeemStyle === 'expert')) {
      setLocal(l => ({ ...l, redeemStyle: 'portal' }));
      setShowAdvanced(false);
    }
  }, [canTransfer]);

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

  const mainStyles   = REDEMPTION_STYLES.filter(s => s.id === 'cashout' || s.id === 'portal');
  const advStyles    = REDEMPTION_STYLES.filter(s => s.id === 'transfer' || s.id === 'expert');

  const RedemptionBtn = ({ style }) => {
    const isSel = redeemStyle === style.id;
    return (
      <button className={`redemption-option ${isSel ? 'selected' : ''}`}
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
  };

  return (
    <>
      <h2 className="step-heading">Preferences</h2>
      <p className="step-subheading">How you redeem points determines their value.</p>

      <div className="redemption-grid">
        {mainStyles.map(style => <RedemptionBtn key={style.id} style={style} />)}
      </div>

      {canTransfer ? (
        <button className="advanced-toggle" onClick={() => {
          setShowAdvanced(s => !s);
          if (showAdvanced && (redeemStyle === 'transfer' || redeemStyle === 'expert')) {
            setLocal(l => ({ ...l, redeemStyle: 'portal' }));
          }
        }}>
          {showAdvanced ? '▲ Hide advanced options' : '+ I optimize with transfer partners'}
        </button>
      ) : (
        <div className="advanced-toggle-locked">
          🔒 Transfer partner options require a card that earns transferable points (e.g. Sapphire Reserve, Amex Gold, Citi Double Cash)
        </div>
      )}

      {canTransfer && showAdvanced && (
        <div className="redemption-grid" style={{ marginTop: 12 }}>
          {advStyles.map(style => <RedemptionBtn key={style.id} style={style} />)}
        </div>
      )}

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
function RecommendationBanner({ tiers, displayTierIds, ownedCards, heldCards = [], totalMonthlySpend, spend, redeemStyle, onViewDetails }) {
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

  const achievable = scored.filter(t => canHitSpend(t) && newAppsNeeded(t, ownedCards, heldCards) <= MAX_NEW_APPS);
  const best = achievable.length > 0 ? achievable[0] : scored[0];

  // Only recommend an upgrade if it clears $75/yr over 3 years per new card application needed.
  // If you already own all the cards, any positive advantage is worth it (zero friction).
  const newCards = best.cards.filter(cid => !ownedCards.includes(cid));
  const newCardsNeeded = newCards.filter(cid => !heldCards.includes(cid));
  const upgradeThreshold = newCardsNeeded.length > 0 ? 75 * 3 : 0;
  const threeYrAdvVsBaseline = threeYr(best) - threeYr(freeTier);
  const freeIsBest = threeYrAdvVsBaseline < upgradeThreshold;

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
  const nextUp3yr = nextUp ? nextUp.year1 + nextUp.netPerYear * 2 : 0;
  const best3yr = best.year1 + best.netPerYear * 2;

  // Find which categories drive the advantage (best tier rate vs free tier rate)
  // Also capture the best card name and raw multiplier for narrative use.
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
      let bestCardName = null;
      let bestMultiplier = 0;
      for (const cid of best.cards) {
        const card = CARDS.find(c => c.id === cid);
        if (!card) continue;
        const r = getEffectiveRate(card, cat.id, {}, monthly);
        const v = (style?.valuations[card.issuer] || 1.0) / 100;
        if (r * v > bestRate) {
          bestRate = r * v;
          bestMultiplier = r;
          bestCardName = card.name.replace('Chase ', '').replace('American Express ', 'Amex ').replace('Capital One ', '');
        }
      }
      const annualGain = (bestRate - freeRate) * monthly * 12;
      return annualGain > 0 ? { cat, monthly, annualGain, bestCardName, bestMultiplier } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.annualGain - a.annualGain)
    .slice(0, 3);

  // Format multiplier: whole numbers stay clean (3x), decimals get one place (1.5x)
  const fmtMult = m => Number.isInteger(m) ? `${m}` : m.toFixed(1);

  // Build a conversational summary — lead with WHY, not the numbers
  const buildSummaryText = () => {
    const threeYrAdv = (best.year1 + best.netPerYear * 2) - (freeTier.year1 + freeTier.netPerYear * 2);
    const bonusBridges = best.ongoingAdv < 0 && threeYrAdv > 0;

    // Determine the main driver behind the recommendation
    const creditsOffsetFee = best.effectiveFee < best.totalFee * 0.5; // credits cut fee in half+
    const strongEarner = best.ongoingAdv > 200;
    const bonusDriven = bonusBridges || (best.welcomeBonus > best.effectiveFee);

    if (freeIsBest) {
      if (best.ongoingAdv < 0) {
        return `At your spending level, the fees on premium cards would outweigh the extra rewards — ${freeTier.id === 'current' ? 'your current wallet' : 'a no-fee setup'} is the smarter play right now.`;
      }
      return `${freeTier.id === 'current' ? 'Your current wallet' : 'A no-fee setup'} is already doing the job well at your spending level — the upgrade isn't meaningful enough to justify opening new cards.`;
    }

    // Build the "why this card wins" opening clause
    let why = '';
    if (creditsOffsetFee && strongEarner) {
      why = `statement credits largely offset the annual fee, and the earning rates on your top categories pull ahead of cheaper alternatives`;
    } else if (creditsOffsetFee) {
      why = `statement credits more than cover the annual fee, so you're essentially getting the rewards for free`;
    } else if (bonusDriven && bonusBridges) {
      why = `the welcome bonus puts you well ahead in year one, and the ongoing rewards hold their own after that`;
    } else if (bonusDriven) {
      why = `a strong welcome bonus combined with solid ongoing rewards makes this the highest-value option over time`;
    } else if (strongEarner) {
      why = `the earning rates on your top spend categories outpace everything else in your range`;
    } else {
      why = `it offers the best balance of rewards and fees at your spending level`;
    }

    // Build a specific category earnings sentence
    let categoryDetail = '';
    if (catAdvantages.length > 0) {
      const totalGain = catAdvantages.reduce((s, a) => s + a.annualGain, 0);
      const topCat = catAdvantages[0];
      const secondCat = catAdvantages[1];

      const fmtTop = fmtMult(topCat.bestMultiplier);
      const fmtSec = secondCat ? fmtMult(secondCat.bestMultiplier) : '';
      if (catAdvantages.length === 1) {
        categoryDetail = ` ${topCat.bestCardName} earns ${fmtTop}x on your ${topCat.cat.label.toLowerCase()} spend — worth ${fmt(topCat.annualGain)}/yr more than the next-best option.`;
      } else if (catAdvantages.length === 2) {
        categoryDetail = ` ${topCat.bestCardName}'s ${fmtTop}x on ${topCat.cat.label.toLowerCase()} and ${secondCat.bestCardName}'s ${fmtSec}x on ${secondCat.cat.label.toLowerCase()} drive most of the gap — ${fmt(totalGain)}/yr more at your current spend.`;
      } else {
        categoryDetail = ` ${topCat.bestCardName}'s ${fmtTop}x on ${topCat.cat.label.toLowerCase()} and ${secondCat.bestCardName}'s ${fmtSec}x on ${secondCat.cat.label.toLowerCase()} are your biggest earners, with ${fmt(totalGain)}/yr more across your top categories.`;
      }
    }

    // Skipped tier note (e.g. "Traveler carries a higher fee without meaningfully better returns")
    const skipped = achievable
      .slice(1)
      .filter(t => !displayTierIds || displayTierIds.includes(t.id))
      .sort((a, b) => b.effectiveFee - a.effectiveFee)[0];
    const skippedNote = (!nextUp && skipped && skipped.netPerYear < best.netPerYear)
      ? ` ${skipped.name} carries a higher fee without meaningfully better returns for your spend profile.`
      : '';

    // Nudge if a higher tier is just out of reach
    const nudge = nextUp
      ? ` If you can grow your monthly spend to ${fmt(nextUpMonthlyNeeded)}, ${nextUp.name} unlocks even more value.`
      : '';

    return `${best.name} is your best option — ${why}.${categoryDetail}${skippedNote}${nudge}`;
  };

  const summaryText = buildSummaryText();

  if (freeIsBest) {
    return (
      <div className="rec-banner rec-free">
        <div className="rec-icon">✓</div>
        <div className="rec-content">
          <div className="rec-headline">{freeTier.id === 'current' ? 'Your current wallet is the right call' : 'Your free wallet is the right call'}</div>
          <div className="rec-detail">{summaryText}</div>
          {onViewDetails && (
            <button className="rec-view-btn" onClick={onViewDetails}>Compare options below ↓</button>
          )}
        </div>
      </div>
    );
  }

  const redemptionStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);

  return (
    <div className="rec-banner rec-paid">
      {/* Summary: plain-English spend-aware rationale */}
      {summaryText && (
        <div className="rec-summary">
          <span className="rec-summary-label">Bottom line</span>
          {summaryText}
        </div>
      )}

      {/* Row 1: headline */}
      <div className="rec-top">
        <div className="rec-headline">Upgrade to <strong>{best.name}</strong></div>
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
      {nextUp && nextUpSpendMore > 0 && (nextUp3yr - best3yr) > 50 && (
        <div className="rec-spendUp">
          <span className="rec-spendUp-icon">↑</span>
          <span className="rec-spendUp-text">
            Spend <strong>{fmt(nextUpSpendMore)}/mo more</strong> and {nextUp.name} becomes reachable
            — that's <strong>{fmt(nextUp3yr - best3yr)} more over 3 years</strong>.
          </span>
        </div>
      )}

      {onViewDetails && (
        <button className="rec-view-btn" onClick={onViewDetails}>View wallet options ↓</button>
      )}

    </div>
  );
}



// ─── Custom Combo Builder ─────────────────────────────────────────────────────
const CHASE_UR_UNLOCKERS_UI = new Set(['csr', 'csp']);

function CustomComboBuilder({ spend, selectedCredits, redeemStyle, heldCards, activationStatus, currentTier }) {
  const [customCards, setCustomCards] = useState([]);
  // Track CFU cards that were auto-added (so we can auto-remove them)
  const [autoAdded, setAutoAdded] = useState(new Set());

  const toggle = id => {
    setCustomCards(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id];

      // When adding CSR/CSP: auto-add CFU if not already present
      if (!prev.includes(id) && CHASE_UR_UNLOCKERS_UI.has(id)) {
        if (!next.includes('cfu')) {
          setAutoAdded(a => new Set([...a, 'cfu']));
          return [...next, 'cfu'];
        }
      }

      // When removing CSR/CSP: if CFU was auto-added and no other unlocker remains, remove it
      if (prev.includes(id) && CHASE_UR_UNLOCKERS_UI.has(id)) {
        const remainingUnlockers = next.filter(c => CHASE_UR_UNLOCKERS_UI.has(c));
        if (remainingUnlockers.length === 0) {
          setAutoAdded(a => { const n = new Set(a); n.delete('cfu'); return n; });
          return next.filter(c => c !== 'cfu' || !autoAdded.has('cfu'));
        }
      }

      // If user manually adds CFU, it's no longer auto-managed
      if (!prev.includes('cfu') && id === 'cfu') {
        setAutoAdded(a => { const n = new Set(a); n.delete('cfu'); return n; });
      }

      return next;
    });
  };

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
              className={`custom-chip ${sel ? 'selected' : ''} ${autoAdded.has(card.id) ? 'auto-added' : ''}`}
              onClick={() => toggle(card.id)}
              title={autoAdded.has(card.id) ? 'Auto-added — pairs with your CSR/CSP to unlock 1.5x on all spend' : undefined}>
              <span className="custom-chip-dot" style={{ background: card.color }} />
              <span className="custom-chip-name">
                {card.name.replace('Chase ', '').replace('Amex ', '').replace('Capital One ', '')}
                {autoAdded.has(card.id) && <span className="custom-chip-auto"> ✦</span>}
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
// ─── TierCard ─────────────────────────────────────────────────────────────────
function TierCard({ tier, initialCredits, isCurrent, isBest, isOutOfReach, tooManyApps, isExpanded, onToggleExpand, tierCardRef, ownedCards, heldCards, activationStatus, spend, redeemStyle, baseline, newCardIds, totalMonthlySpend }) {
  const [localCredits, setLocalCredits] = useState(initialCredits);

  const toggleCredit = (cardId, creditId) => {
    setLocalCredits(prev => {
      const current = prev[cardId] || [];
      const next = current.includes(creditId)
        ? current.filter(id => id !== creditId)
        : [...current, creditId];
      return { ...prev, [cardId]: next };
    });
  };

  // Recompute fee/net live from localCredits
  const localEffectiveFee = tier.cards.reduce((s, id) => s + calculateEffectiveFee(id, localCredits), 0);
  const localNetPerYear = tier.earnings - localEffectiveFee;
  const localYear1 = localNetPerYear + tier.welcomeBonus;
  const totalCreditValue = tier.cards.reduce((sum, cid) => {
    const available = STATEMENT_CREDITS[cid] || [];
    const applied = localCredits[cid] || [];
    return sum + available.filter(c => applied.includes(c.id)).reduce((s, c) => s + c.value, 0);
  }, 0);

  // Benefit chips for collapsed header — show categories earning 2x+, plus a catch-all chip
  // if a card in the tier earns a flat rate on all categories (e.g. CFU 1.5x, WFAC 2x)
  const tierBenefits = CATEGORIES
    .map(cat => {
      let best = 0;
      for (const cid of tier.cards) {
        const card = CARDS.find(c => c.id === cid);
        if (!card) continue;
        const r = getEffectiveRate(card, cat.id, activationStatus, parseFloat(spend[cat.id]) || 0);
        if (r > best) best = r;
      }
      return best >= 2 ? { cat, rate: best } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);

  // Catch-all chip: find the best baseline rate across wallet cards.
  // Uses the minimum rate per card (e.g. CFU has 3x dining but 1.5x on everything else → baseline 1.5x)
  const catchAllChip = (() => {
    let bestBaseline = 0;
    for (const cid of tier.cards) {
      const card = CARDS.find(c => c.id === cid);
      if (!card) continue;
      const baseline = Math.min(...Object.values(card.rates));
      if (baseline > bestBaseline) bestBaseline = baseline;
    }
    // Only show if the baseline is above 1x and below the lowest named tier benefit
    const lowestBenefit = tierBenefits.length > 0 ? tierBenefits[tierBenefits.length - 1].rate : Infinity;
    if (bestBaseline > 1 && bestBaseline < lowestBenefit) return bestBaseline;
    return null;
  })();

  const rdStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);

  return (
    <div
      ref={tierCardRef}
      className={`wallet-tier ${isCurrent ? 'tier-current' : ''} ${isBest ? 'best' : ''} ${isExpanded ? 'expanded' : ''}`}
    >
      {/* ── Collapsed header ── */}
      <div className="wt-header" onClick={onToggleExpand}>
        <div className="wt-left">
          <div className="wt-name">
            {tier.name}
            {isCurrent && <span className="badge-current">CURRENT</span>}
            {!isCurrent && isBest && <span className="badge-best">BEST</span>}
            {tooManyApps && <span className="badge-future">LONG-TERM GOAL</span>}
            {!tooManyApps && isOutOfReach && <span className="badge-locked">↑ SPEND MORE</span>}
          </div>
          {tier.description && <div className="wt-description">{tier.description}</div>}
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
          {(tierBenefits.length > 0 || catchAllChip) && (
            <div className="wt-benefits">
              {tierBenefits.map(({ cat, rate }) => (
                <span key={cat.id} className="wt-benefit">
                  {rate % 1 === 0 ? rate : rate.toFixed(1)}x {cat.label.toLowerCase()}
                </span>
              ))}
              {catchAllChip && (
                <span className="wt-benefit wt-benefit-flat">
                  {catchAllChip % 1 === 0 ? catchAllChip : catchAllChip.toFixed(1)}x everything else
                </span>
              )}
            </div>
          )}
        </div>
        <div className="wt-right">
          <div className="wt-kpi">
            <span className="wt-kpi-val">{fmt(localNetPerYear)}</span>
            <span className="wt-kpi-label">net/yr</span>
            {totalCreditValue > 0 && (
              <span className="wt-kpi-credits">incl. ${totalCreditValue} in credits</span>
            )}
          </div>
          {!isCurrent && baseline && (() => {
            const baselineNet = baseline.earnings - baseline.effectiveFee;
            const baselineY1 = baselineNet + (baseline.welcomeBonus || 0);
            const delta3yr = (localYear1 + localNetPerYear * 2) - (baselineY1 + baselineNet * 2);
            return (
              <div className={`wt-delta ${delta3yr >= 0 ? 'pos' : 'neg'}`}>
                {delta3yr >= 0 ? '+' : '−'}{fmt(Math.abs(delta3yr))} over 3 yrs
              </div>
            );
          })()}
          {isCurrent && <div className="wt-delta pos">your baseline</div>}
          <span className="wt-chevron">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {isExpanded && (
        <div className="wt-body">

          {/* Earnings by category */}
          <div className="wt-section-label">Earnings by category</div>
          <div className="wt-breakdown">
            {CATEGORIES.map(cat => {
              const monthly = parseFloat(spend[cat.id]) || 0;
              if (!monthly) return null;
              let bestCard = null, bestRate = 0;
              for (const cid of tier.cards) {
                const card = CARDS.find(c => c.id === cid);
                if (!card) continue;
                const r = getEffectiveRate(card, cat.id, activationStatus, monthly);
                if (r > bestRate) { bestRate = r; bestCard = card; }
              }
              if (!bestCard) return null;
              const val = (rdStyle?.valuations[bestCard.issuer] || 1.0) / 100;
              const annual = monthly * 12 * bestRate * val;
              const shortName = bestCard.name.replace('Chase ', '').replace('Amex ', '').replace('Capital One ', '');
              return (
                <div key={cat.id} className="wt-breakdown-row wt-breakdown-cat">
                  <span className="wt-breakdown-cat-label">
                    {cat.icon} {cat.label}
                    <span className="wt-breakdown-cat-detail">{Number.isInteger(bestRate) ? bestRate : bestRate.toFixed(1)}x · {shortName}</span>
                  </span>
                  <span>{fmt(annual)}/yr</span>
                </div>
              );
            }).filter(Boolean)}
          </div>

          {/* Annual fees + interactive credit pills */}
          {tier.cards.some(cid => (CARDS.find(c => c.id === cid)?.annualFee || 0) > 0) && (
            <>
              <div className="wt-section-label" style={{ marginTop: 16 }}>Annual fees</div>
              {tier.cards.map(cid => {
                const card = CARDS.find(c => c.id === cid);
                if (!card || card.annualFee === 0) return null;
                const allCredits = STATEMENT_CREDITS[cid] || [];
                if (allCredits.length === 0) return null;
                const appliedIds = localCredits[cid] || [];
                const creditSum = allCredits.filter(cr => appliedIds.includes(cr.id)).reduce((s, cr) => s + cr.value, 0);
                const effective = card.annualFee - creditSum;
                const shortName = card.name.replace('Chase ', '').replace('Amex ', '').replace('Capital One ', '');
                return (
                  <div key={cid} className="wt-credit-card-block">
                    <div className="wt-credit-card-header">
                      <span className="wt-credit-card-name">{shortName}</span>
                      <span className="wt-credit-card-fee">
                        ${card.annualFee}/yr →{' '}
                        <strong style={{ color: effective <= 0 ? 'var(--color-success)' : undefined }}>
                          {effective > 0 ? `$${effective} net` : effective === 0 ? 'fully offset' : `+$${Math.abs(effective)} net positive`}
                        </strong>
                      </span>
                    </div>
                    <div className="wt-credit-pills">
                      {allCredits.map(cr => {
                        const applied = appliedIds.includes(cr.id);
                        return (
                          <button
                            key={cr.id}
                            className={`wt-credit-pill ${applied ? 'wt-credit-pill-on' : 'wt-credit-pill-off'}`}
                            title={cr.description}
                            onClick={() => toggleCredit(cid, cr.id)}
                          >
                            {applied ? '✓ ' : ''}{cr.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Summary equation */}
          <div className="wt-summary-row">
            <div className="wt-summary-item">
              <span className="wt-summary-label">Rewards</span>
              <span className="wt-summary-val">{fmt(tier.earnings)}</span>
            </div>
            <div className="wt-summary-sep">{localEffectiveFee <= 0 ? '+' : '−'}</div>
            <div className="wt-summary-item">
              <span className="wt-summary-label">{localEffectiveFee <= 0 ? 'Fee savings' : 'Net fees'}</span>
              <span className="wt-summary-val" style={{ color: localEffectiveFee <= 0 ? 'var(--color-success)' : undefined }}>
                {fmt(Math.abs(localEffectiveFee))}
              </span>
            </div>
            <div className="wt-summary-sep">=</div>
            <div className="wt-summary-item wt-summary-net">
              <span className="wt-summary-label">Net / yr</span>
              <span className="wt-summary-val">{fmt(localNetPerYear)}</span>
            </div>
            {!isCurrent && tier.welcomeBonus > 0 && (
              <>
                <div className="wt-summary-sep">+</div>
                <div className="wt-summary-item">
                  <span className="wt-summary-label">Yr 1 bonus</span>
                  <span className="wt-summary-val">{fmt(tier.welcomeBonus)}</span>
                </div>
                <div className="wt-summary-sep">=</div>
                <div className="wt-summary-item wt-summary-net">
                  <span className="wt-summary-label">Year 1</span>
                  <span className="wt-summary-val">{fmt(localYear1)}</span>
                </div>
              </>
            )}
          </div>
          {localNetPerYear < 0 && (
            <div className="wt-breakdown-negative-note">Fees outweigh rewards at your current spend level.</div>
          )}

          {/* Cards to apply for */}
          {newCardIds.length > 0 && (
            <div className="wt-new-cards">
              <div className="wt-section-label">Cards to apply for</div>
              {newCardIds.length > 1 && (
                <div className="wt-stagger-note">
                  <span className="wt-stagger-icon">💡</span>
                  <span>Stagger applications 3–6 months apart — opening multiple cards at once makes it harder to hit each bonus requirement.</span>
                </div>
              )}
              <div className="rec-applications">
                {newCardIds.map(cid => {
                  const card = CARDS.find(c => c.id === cid);
                  if (!card) return null;
                  const wb = card.welcomeBonus;
                  const rawBonus = formatRawBonus(card);
                  const dollarVal = !wb?.amount ? 0
                    : wb.type === 'cashback' ? wb.amount
                    : Math.round(wb.amount * ((rdStyle?.valuations[card.issuer] || 1.0) / 100));

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
                        {rawBonus && dollarVal === 0 && (
                          <span className="rec-app-bonus">{rawBonus}</span>
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
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function WalletResults({ local, onRestart, onGoToStep, plaidSource }) {
  const { spend, ownedCards, selectedCredits, redeemStyle, heldCards, activationStatus } = local;
  const [expandedTier, setExpandedTier] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const tierSectionRef = useRef(null);
  const tierCardRefs = useRef({});

  // Prepend "Your Current Wallet" if user has cards
  const currentWalletDef = ownedCards.length > 0
    ? { id: 'current', name: 'Your Current Wallet', description: 'Your cards, best routing applied', cards: ownedCards }
    : null;
  const tierDefs = currentWalletDef ? [currentWalletDef, ...WALLET_TIERS] : WALLET_TIERS;

  // For predefined tiers, auto-apply only easy/universal credits (autoApply: true) for unowned cards.
  // For owned cards, use the user's actual selectedCredits so we don't override their choices.
  const creditsForTier = (tierCards) => {
    const merged = { ...selectedCredits };
    for (const id of tierCards) {
      if (ownedCards.includes(id)) continue; // keep user's selection
      const available = STATEMENT_CREDITS[id];
      if (available?.length) merged[id] = available.filter(c => c.autoApply).map(c => c.id);
    }
    return merged;
  };

  const tiers = tierDefs.map(tier => {
    const earnings = calculateWalletEarnings(tier.cards, spend, activationStatus, redeemStyle);
    const totalFee = tier.cards.reduce((s, id) => {
      const card = CARDS.find(c => c.id === id);
      return s + (card?.annualFee || 0);
    }, 0);
    const tierCredits = creditsForTier(tier.cards);
    const effectiveFee = tier.cards.reduce((s, id) => s + calculateEffectiveFee(id, tierCredits), 0);
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

    return { ...tier, earnings, totalFee, effectiveFee, netPerYear, year1, welcomeBonus: wb };
  });

  const currentTier = tiers.find(t => t.id === 'current') || null;
  const totalMonthlySpend = Object.values(spend).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  // Same spend-achievability filter as RecommendationBanner — must stay in sync
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

  // Best tier = achievable + 3-year total, matching RecommendationBanner exactly
  const candidateTiers = [...tiers].filter(t => t.id !== 'current' && t.id !== 'free');
  const achievableTiers = candidateTiers.filter(t => canHitSpend(t) && newAppsNeeded(t, ownedCards, heldCards) <= MAX_NEW_APPS);
  const baseline = currentTier || tiers.find(t => t.id === 'free');
  const baselineThreeYr = baseline ? baseline.year1 + baseline.netPerYear * 2 : 0;
  const topCandidate = (achievableTiers.length > 0 ? achievableTiers : candidateTiers)
    .sort((a, b) => (b.year1 + b.netPerYear * 2) - (a.year1 + a.netPerYear * 2))[0];

  // Apply the same $75/yr threshold as RecommendationBanner — no BEST badge if advantage is trivial
  const topNewCards = topCandidate?.cards.filter(cid => !ownedCards.includes(cid) && !heldCards.includes(cid)) || [];
  const topThreshold = topNewCards.length > 0 ? 75 * 3 : 0;
  const topThreeYrAdv = topCandidate ? (topCandidate.year1 + topCandidate.netPerYear * 2) - baselineThreeYr : 0;
  const bestTier = topThreeYrAdv >= topThreshold ? topCandidate : null;

  // Display tiers — baseline first, then paid options sorted so the best is always Option 1
  const nonBaselineSorted = [...candidateTiers]
    .sort((a, b) => (b.year1 + b.netPerYear * 2) - (a.year1 + a.netPerYear * 2));
  const paidDisplayTiers = [nonBaselineSorted[0], nonBaselineSorted[1]]
    .filter(Boolean)
    .map((t, i) => ({ ...t, name: `Option ${i + 1}` }));
  const displayTiers = [baseline, ...paidDisplayTiers]
    .filter(Boolean)
    .filter((t, i, arr) => arr.findIndex(x => x?.id === t.id) === i);

  return (
    <div className="wizard">
      {/* ── Results hero ── */}
      <div className="results-hero">
        <div className="results-hero-title">Your Wallet Analysis</div>
        {plaidSource && (
          <div className="results-hero-plaid">
            🔗 Spending from Plaid &nbsp;·&nbsp;
            <Link to="/transactions" style={{ color: 'var(--color-success)', textDecoration: 'underline' }}>
              View transactions →
            </Link>
          </div>
        )}

        {/* Summary cards */}
        <div className="results-summary-row">
          {/* Spend */}
          <button className="results-summary-card" onClick={() => onGoToStep(0)}>
            <span className="rsc-icon">💳</span>
            <div className="rsc-content">
              <span className="rsc-label">Monthly spend</span>
              <span className="rsc-value">{fmt(totalMonthlySpend)}</span>
              {(() => {
                const topCats = CATEGORIES
                  .map(cat => ({ cat, val: parseFloat(spend[cat.id]) || 0 }))
                  .filter(x => x.val > 0)
                  .sort((a, b) => b.val - a.val)
                  .slice(0, 3);
                return topCats.length > 0 && (
                  <span className="rsc-detail">
                    {topCats.map(({ cat, val }) => `${cat.icon} ${fmt(val)}`).join('  ')}
                  </span>
                );
              })()}
            </div>
            <span className="rsc-edit">✎</span>
          </button>

          {/* Cards */}
          <button className="results-summary-card" onClick={() => onGoToStep(1)}>
            <span className="rsc-icon">🃏</span>
            <div className="rsc-content">
              <span className="rsc-label">Your cards</span>
              <span className="rsc-value">{ownedCards.length} card{ownedCards.length !== 1 ? 's' : ''}</span>
              <span className="rsc-detail">
                {ownedCards.slice(0, 3).map(cid => {
                  const card = CARDS.find(c => c.id === cid);
                  return card?.name.replace('Chase ', '').replace('Amex ', '').replace('Capital One ', '');
                }).filter(Boolean).join(', ')}
                {ownedCards.length > 3 ? ` +${ownedCards.length - 3} more` : ''}
              </span>
            </div>
            <span className="rsc-edit">✎</span>
          </button>

          {/* Redemption */}
          <button className="results-summary-card" onClick={() => onGoToStep(2)}>
            <span className="rsc-icon">{REDEEM_ICONS[redeemStyle] || '💵'}</span>
            <div className="rsc-content">
              <span className="rsc-label">Redemption</span>
              <span className="rsc-value">{REDEMPTION_STYLES.find(r => r.id === redeemStyle)?.label}</span>
              <span className="rsc-detail">{REDEMPTION_STYLES.find(r => r.id === redeemStyle)?.description}</span>
            </div>
            <span className="rsc-edit">✎</span>
          </button>
        </div>
      </div>

      {/* 1. Recommendation — quick answer at the top */}
      <RecommendationBanner
        tiers={displayTiers}
        displayTierIds={displayTiers.map(t => t.id)}
        ownedCards={ownedCards}
        heldCards={heldCards}
        totalMonthlySpend={totalMonthlySpend}
        spend={spend}
        redeemStyle={redeemStyle}
        onViewDetails={() => {
          tierSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (bestTier) {
            setExpandedTier(bestTier.id);
          }
        }}
      />

      {/* 2. Tier cards */}
      {(() => {
        return (
      <div className="results-section" ref={tierSectionRef}>
        <h3 className="results-section-title">Wallet Options</h3>
        <div className="wallet-tiers">
          {displayTiers.map(tier => {
            const isCurrent = tier.id === 'current' || tier.id === 'free';
            const isBest = tier.id === bestTier?.id;
            const tooManyApps = !isCurrent && newAppsNeeded(tier, ownedCards, heldCards) > MAX_NEW_APPS;
            const isOutOfReach = !isCurrent && !isBest && !achievableTiers.some(a => a.id === tier.id);
            const isExpanded = expandedTier === tier.id;
            const newCardIds = tier.cards.filter(cid => !ownedCards.includes(cid) && !heldCards.includes(cid));
            const initialCredits = creditsForTier(tier.cards);

            return (
              <TierCard
                key={tier.id}
                tier={tier}
                initialCredits={initialCredits}
                isCurrent={isCurrent}
                isBest={isBest}
                isOutOfReach={isOutOfReach}
                tooManyApps={tooManyApps}
                isExpanded={isExpanded}
                onToggleExpand={() => setExpandedTier(isExpanded ? null : tier.id)}
                tierCardRef={el => { tierCardRefs.current[tier.id] = el; }}
                ownedCards={ownedCards}
                heldCards={heldCards}
                activationStatus={activationStatus}
                spend={spend}
                redeemStyle={redeemStyle}
                baseline={baseline}
                newCardIds={newCardIds}
                totalMonthlySpend={totalMonthlySpend}
              />
            );
          })}
        </div>
      </div>
        );
      })()}

      {/* 3. Custom combo builder — collapsible */}
      <div className="collapsible-section">
        <button className="collapsible-toggle" onClick={() => setShowCustom(s => !s)}>
          <span>Build a custom combo</span>
          <span className="collapsible-hint">Mix any cards to see live earnings</span>
          <span className="collapsible-chevron">{showCustom ? '▲' : '▼'}</span>
        </button>
        {showCustom && (
          <CustomComboBuilder
            spend={spend}
            selectedCredits={selectedCredits}
            redeemStyle={redeemStyle}
            heldCards={heldCards}
            activationStatus={activationStatus}
            currentTier={currentTier}
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
        <Link to="/earn" className="btn btn-primary" style={{ fontSize: 14 }}>Analyze My Earning →</Link>
        <button onClick={onRestart} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline' }}>
          Reset all
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--gray-400)', textAlign: 'center', marginTop: 24, lineHeight: 1.5 }}>
        Earnings estimates are based on standard published rates. Portal bookings, limited-time offers, and category caps may change your actual return. Always verify current terms before applying.
      </p>
    </div>
  );
}

// ─── Plaid Link Step ──────────────────────────────────────────────────────────
function PlaidLinkButton({ onSuccess, label }) {
  const [linkToken, setLinkToken] = useState(null);
  const [tokenError, setTokenError] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/create_link_token`, { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d.error) setTokenError(d.error);
        else setLinkToken(d.link_token);
      })
      .catch(() => setTokenError('server_unavailable'));
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess: async (publicToken) => {
      await fetch(`${API}/api/exchange_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token: publicToken }),
      });
      onSuccess();
    },
  });

  if (tokenError) return null; // server not running — hide button, only show skip

  return (
    <button
      className="btn btn-primary"
      onClick={() => open()}
      disabled={!ready}
      style={{ opacity: ready ? 1 : 0.5, fontSize: 15, padding: '12px 28px' }}
    >
      {ready ? (label || '🔗 Connect bank account') : 'Loading…'}
    </button>
  );
}

function PlaidLinkStep({ onLinked, onSkip }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [connectedCount, setConnectedCount] = useState(0); // 0 = not connected

  // Check if Plaid is already connected on mount
  useEffect(() => {
    fetch(`${API}/api/status`)
      .then(r => r.json())
      .then(d => { if (d.connected) setConnectedCount(d.count || 1); })
      .catch(() => {});
  }, []);

  const fetchAndAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 3);
      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);

      // Fetch transactions and accounts in parallel
      const [txnRes, acctRes] = await Promise.all([
        fetch(`${API}/api/transactions?start_date=${startDate}&end_date=${endDate}`),
        fetch(`${API}/api/accounts`),
      ]);
      const txnData = await txnRes.json();
      const acctData = await acctRes.json();
      if (txnData.error) throw new Error(txnData.error);

      // Spend from transactions
      const analysis = analyzeTransactions(txnData.transactions);
      const { monthlyAvg } = projectSpend(analysis.byCategory, 3);
      const spend = {};
      for (const cat of ['dining', 'groceries', 'travel', 'gas', 'shopping', 'subscriptions', 'entertainment', 'other']) {
        const val = Math.round(monthlyAvg[cat] || 0);
        spend[cat] = val > 0 ? String(val) : '';
      }

      // Detect owned cards from credit accounts
      const creditAccounts = (acctData.accounts || []).filter(a => a.type === 'credit');
      const detectedCards = creditAccounts
        .map(a => matchAccountToCard(a.name, a.official_name))
        .filter(Boolean)
        .filter((id, i, arr) => arr.indexOf(id) === i); // dedupe

      onLinked(spend, detectedCards);
    } catch (e) {
      setError('Could not analyze transactions. You can still enter spend manually.');
      setAnalyzing(false);
    }
  }, [onLinked]);

  const handleSuccess = useCallback(() => {
    setConnectedCount(c => c + 1);
    fetchAndAnalyze();
  }, [fetchAndAnalyze]);

  if (analyzing) {
    return (
      <div className="page-container narrow">
        <div className="step-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🔄</div>
          <h2 className="step-heading">Analyzing your transactions…</h2>
          <p className="step-subheading">We're reading 3 months of spending to pre-fill your profile.</p>
        </div>
      </div>
    );
  }

  // Already connected — show count, option to add more, or proceed
  if (connectedCount > 0) {
    return (
      <div className="page-container narrow">
        <div className="step-card" style={{ textAlign: 'center', padding: '40px 32px' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🏦</div>
          <h2 className="step-heading" style={{ marginBottom: 8 }}>
            {connectedCount === 1 ? '1 bank connected' : `${connectedCount} banks connected`}
          </h2>
          <p className="step-subheading" style={{ maxWidth: 400, margin: '0 auto 8px' }}>
            {connectedCount === 1
              ? 'Spend across multiple banks? Add another account for a complete picture.'
              : `Great — we'll merge transactions from all ${connectedCount} accounts for the most accurate spend breakdown.`}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 24 }}>
            <button
              className="btn btn-primary"
              onClick={fetchAndAnalyze}
              style={{ fontSize: 15, padding: '12px 28px' }}
            >
              Use my transaction data →
            </button>
            <PlaidLinkButton onSuccess={handleSuccess} label="+ Connect another bank" />
            {error && (
              <p style={{ fontSize: 13, color: 'var(--color-gap0)', margin: 0 }}>{error}</p>
            )}
            <button
              onClick={onSkip}
              style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline', marginTop: 4 }}
            >
              Skip, I'll enter manually →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container narrow">
      <div className="step-card" style={{ textAlign: 'center', padding: '40px 32px' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🏦</div>
        <h2 className="step-heading" style={{ marginBottom: 8 }}>Auto-fill from your banks</h2>
        <p className="step-subheading" style={{ maxWidth: 400, margin: '0 auto 28px' }}>
          Connect one or more bank accounts to automatically calculate your monthly spend by category. Add all the banks you use — we'll merge them.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <PlaidLinkButton onSuccess={handleSuccess} />
          {error && (
            <p style={{ fontSize: 13, color: 'var(--color-gap0)', margin: 0 }}>{error}</p>
          )}
          <button
            onClick={onSkip}
            style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline', marginTop: 4 }}
          >
            Skip, I'll enter manually →
          </button>
        </div>

        <div style={{ marginTop: 32, padding: '14px 20px', background: 'var(--gray-50)', borderRadius: 10, textAlign: 'left', maxWidth: 400, margin: '32px auto 0' }}>
          <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: 0, lineHeight: 1.6 }}>
            🔒 <strong>Secure read-only access.</strong> We only read transaction categories and amounts — never account numbers or credentials. Powered by Plaid.
          </p>
        </div>
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

  // Show Plaid link step when there's no existing spend data
  const hasSpend = Object.values(local.spend).some(v => parseFloat(v) > 0);
  const [showLinkStep, setShowLinkStep] = useState(!hasSpend);
  const [plaidSource, setPlaidSource] = useState(false); // true if spend came from Plaid
  const [plaidDetectedCards, setPlaidDetectedCards] = useState([]); // card IDs matched from bank accounts

  const syncToContext = (updatedLocal) => {
    dispatch({ type: 'SET_SPEND', payload: updatedLocal.spend });
    dispatch({ type: 'SET_OWNED_CARDS', payload: updatedLocal.ownedCards });
    dispatch({ type: 'SET_ELIGIBILITY', payload: { cards24months: updatedLocal.cards24months, amexCount: updatedLocal.amexCount, heldCards: updatedLocal.heldCards } });
    dispatch({ type: 'SET_CREDITS', payload: updatedLocal.selectedCredits });
    dispatch({ type: 'SET_REDEEM_STYLE', payload: updatedLocal.redeemStyle });
    dispatch({ type: 'SET_ACTIVATION', payload: updatedLocal.activationStatus });
  };

  const syncAndFinish = (updatedLocal) => {
    syncToContext(updatedLocal);
    setDone(true);
  };

  // On mount: if localStorage had a completed session, sync it to AppContext so
  // EarnAnalyzer (and any other page reading context) sees the data immediately.
  useEffect(() => {
    if (isComplete(local)) syncToContext(local);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setShowLinkStep(true);
    setPlaidSource(false);
    dispatch({ type: 'RESET' });
    try { localStorage.removeItem(LS_KEY); } catch {}
  };

  // Plaid link step handlers
  const handlePlaidLinked = useCallback((spend, detectedCards = []) => {
    setLocal(l => ({
      ...l,
      spend,
      // Pre-populate ownedCards if we detected any; keep existing selections otherwise
      ownedCards: detectedCards.length > 0 ? detectedCards : l.ownedCards,
    }));
    setPlaidDetectedCards(detectedCards);
    setPlaidSource(true);
    setShowLinkStep(false);
  }, []);

  const handlePlaidSkip = useCallback(() => {
    setShowLinkStep(false);
  }, []);

  if (showLinkStep && !done) {
    return <PlaidLinkStep onLinked={handlePlaidLinked} onSkip={handlePlaidSkip} />;
  }

  if (done) {
    return (
      <div className="page-container">
        <WalletResults local={local} onRestart={restart} onGoToStep={goToStep} plaidSource={plaidSource} />
      </div>
    );
  }

  const stepProps = { local, setLocal, onNext: next, onBack: () => setStep(s => s - 1), plaidSource, plaidDetectedCards, onConnectBank: () => setShowLinkStep(true) };

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
