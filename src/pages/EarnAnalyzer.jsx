import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CARDS, CATEGORIES, REDEMPTION_STYLES } from '../data/cards';
import {
  getEffectiveRate,
  calculateGap0,
  calculateGap1,
  fmt,
} from '../utils/calculations';
import { analyzeTransactionsByCard, analyzeTransactions, projectSpend } from '../utils/plaidCategories';

const API = 'http://localhost:3001';
const MAPPING_KEY = 'pointsmax_account_map';

const CAT_ICONS = {
  dining:'🍽️', groceries:'🛒', travel:'✈️', gas:'⛽',
  shopping:'🛍️', subscriptions:'📱', entertainment:'🎬', other:'💳',
};

// ─── Account name → card ID matching (same patterns as WalletOptimizer) ───────
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

function autoMatch(name = '', officialName = '') {
  const h = `${name} ${officialName}`.toLowerCase();
  for (const { id, keywords } of CARD_NAME_PATTERNS) {
    if (keywords.some(kw => h.includes(kw))) return id;
  }
  return null;
}

// ─── Account Matcher ──────────────────────────────────────────────────────────
function AccountMatcher({ accounts, initialMapping, onSave }) {
  const [mapping, setMapping] = useState(() => {
    const m = { ...initialMapping };
    for (const acc of accounts) {
      if (m[acc.account_id] === undefined) {
        m[acc.account_id] = autoMatch(acc.name, acc.official_name) || '';
      }
    }
    return m;
  });

  return (
    <div className="earn-section">
      <div className="earn-section-title">Link your credit cards</div>
      <div className="earn-section-sub">
        We found {accounts.length} credit card account{accounts.length !== 1 ? 's' : ''} from your bank.
        Match each to a card so we can track exactly what you're earning per card.
      </div>

      <div className="account-matcher-list">
        {accounts.map(acc => {
          const matched = mapping[acc.account_id];
          const wasAutoMatched = autoMatch(acc.name, acc.official_name) === matched && !!matched;
          return (
            <div key={acc.account_id} className="account-matcher-row">
              <div className="account-matcher-bank">
                <div className="account-matcher-name">{acc.name}</div>
                {acc.mask && <div className="account-matcher-mask">···{acc.mask}</div>}
              </div>
              <span className="account-matcher-arrow">→</span>
              <div className="account-matcher-select-wrap">
                <select
                  className="account-matcher-select"
                  value={matched || ''}
                  onChange={e => setMapping(prev => ({ ...prev, [acc.account_id]: e.target.value }))}
                >
                  <option value="">Select card…</option>
                  <option value="__skip__">Not in my list (skip)</option>
                  {CARDS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {wasAutoMatched && <span className="account-matcher-auto">✓ auto-matched</span>}
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="btn btn-primary"
        style={{ marginTop: 20 }}
        onClick={() => onSave(mapping)}
      >
        Save & Analyze →
      </button>
    </div>
  );
}

// ─── Activation banner ────────────────────────────────────────────────────────
function ActivationBanner({ card, activationStatus, categoryEntries, redeemStyle, onToggle }) {
  const { currentQuarter } = card.rotating;
  const isOn = !!activationStatus[card.id];
  const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
  const val = (style?.valuations[card.issuer] || 1.0) / 100;
  const monthlyCap = currentQuarter.cap / 3;

  // Sum spend on this card across rotating categories
  let totalOnCard = 0;
  for (const cat of currentQuarter.categories) {
    const entries = categoryEntries[cat] || [];
    for (const e of entries) {
      if (e.cardId === card.id) totalOnCard += parseFloat(e.amount) || 0;
    }
  }

  const effectiveSpend = Math.min(totalOnCard, monthlyCap);
  const monthlyImpact = effectiveSpend * (currentQuarter.multiplier - 1) * val;

  return (
    <div className={`activation-banner ${isOn ? 'activated' : ''}`}>
      <div className="activation-info">
        <div className="activation-title">
          {currentQuarter.quarter}: {card.name} — {currentQuarter.multiplier}x rotating
        </div>
        <div className="activation-cats">
          {currentQuarter.categories.map(cat => {
            const catObj = CATEGORIES.find(c => c.id === cat);
            return <span key={cat} className="activation-cat">{CAT_ICONS[cat]} {catObj?.label}</span>;
          })}
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
function EditableCategoryRow({ cat, entries, ownedCards, activationStatus, redeemStyle, onChange }) {
  const rdStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
  const totalAssigned = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  // Best owned card for this category (for gap hints)
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
function CategoryRow({ cat, entries, ownedCards, activationStatus, redeemStyle }) {
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function EarnAnalyzer() {
  const { state, dispatch } = useApp();
  const { ownedCards, spend, redeemStyle, activationStatus } = state;

  // Plaid state
  const [plaidStatus, setPlaidStatus] = useState('loading'); // loading | connected | disconnected
  const [creditAccounts, setCreditAccounts] = useState([]);
  const [accountMapping, setAccountMapping] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}'); } catch { return {}; }
  });
  const [transactions, setTransactions] = useState(null); // raw Plaid transactions

  // Derived: does every credit account have a mapping decision?
  const mappingComplete = creditAccounts.length === 0 ||
    creditAccounts.every(a => accountMapping[a.account_id] !== undefined && accountMapping[a.account_id] !== '');

  // categoryEntries: per-card per-category monthly spend
  // Plaid mode: derived from transactions + mapping
  // Manual mode: stored in context
  const [manualEntries, setManualEntries] = useState(state.categoryEntries);

  const plaidEntries = useMemo(() => {
    if (!transactions || !mappingComplete || creditAccounts.length === 0) return null;
    const { byCardCategory } = analyzeTransactionsByCard(transactions, accountMapping);
    const entries = {};
    for (const [cat, cardAmounts] of Object.entries(byCardCategory)) {
      entries[cat] = Object.entries(cardAmounts)
        .filter(([cardId]) => cardId !== '__skip__')
        .map(([cardId, amount]) => ({ cardId, amount: String(amount) }));
    }
    return entries;
  }, [transactions, accountMapping, mappingComplete, creditAccounts.length]);

  // Also derive manual spend totals from Plaid transactions (for categories with no mapping)
  const plaidSpendTotals = useMemo(() => {
    if (!transactions) return null;
    const result = analyzeTransactions(transactions);
    const { monthlyAvg } = projectSpend(result.byCategory, Math.max(1, new Set(transactions.map(t => t.date.slice(0, 7))).size));
    const totals = {};
    for (const cat of CATEGORIES) totals[cat.id] = String(Math.round(monthlyAvg[cat.id] || 0));
    return totals;
  }, [transactions]);

  const isPlaidMode = plaidStatus === 'connected' && mappingComplete && !!plaidEntries;
  const categoryEntries = isPlaidMode ? plaidEntries : manualEntries;
  const effectiveSpend = plaidSpendTotals || spend;

  // Load Plaid status + accounts on mount
  useEffect(() => {
    fetch(`${API}/api/status`)
      .then(r => r.json())
      .then(data => {
        if (!data.connected) { setPlaidStatus('disconnected'); return; }
        setPlaidStatus('connected');
        return fetch(`${API}/api/accounts`)
          .then(r => r.json())
          .then(d => {
            const credit = (d.accounts || []).filter(a => a.type === 'credit');
            setCreditAccounts(credit);
          });
      })
      .catch(() => setPlaidStatus('disconnected'));
  }, []);

  // Fetch transactions once we know Plaid is connected + mapping complete
  useEffect(() => {
    if (plaidStatus !== 'connected' || !mappingComplete) return;
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 3);
    fetch(`${API}/api/transactions?start_date=${start.toISOString().slice(0,10)}&end_date=${end.toISOString().slice(0,10)}`)
      .then(r => r.json())
      .then(d => setTransactions(d.transactions || []))
      .catch(() => {});
  }, [plaidStatus, mappingComplete]);

  // Auto-populate manual entries from spend + best owned card (fallback when no Plaid)
  useEffect(() => {
    if (isPlaidMode || ownedCards.length === 0) return;
    const updated = { ...manualEntries };
    let changed = false;
    for (const cat of CATEGORIES) {
      const monthly = parseFloat(effectiveSpend[cat.id]) || 0;
      if (!monthly) continue;
      if (updated[cat.id]?.length > 0) continue;
      let bestCard = ownedCards[0], bestRate = 0;
      for (const cid of ownedCards) {
        const card = CARDS.find(c => c.id === cid);
        if (!card) continue;
        const r = getEffectiveRate(card, cat.id, activationStatus, monthly);
        if (r > bestRate) { bestRate = r; bestCard = cid; }
      }
      updated[cat.id] = [{ cardId: bestCard, amount: String(monthly) }];
      changed = true;
    }
    if (changed) {
      setManualEntries(updated);
      dispatch({ type: 'SET_CATEGORY_ENTRIES', payload: updated });
    }
  }, [ownedCards.join(','), Object.values(effectiveSpend).join(','), isPlaidMode]); // eslint-disable-line

  const saveMapping = (mapping) => {
    localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping));
    setAccountMapping(mapping);
  };

  const toggleActivation = cardId => dispatch({ type: 'TOGGLE_ACTIVATION', payload: { cardId } });

  // Gap calculations
  const gap0 = useMemo(() => calculateGap0(categoryEntries, activationStatus, redeemStyle), [categoryEntries, activationStatus, redeemStyle]);
  const gap1 = useMemo(() => calculateGap1(categoryEntries, ownedCards, activationStatus, redeemStyle), [categoryEntries, ownedCards, activationStatus, redeemStyle]);

  // Per-category breakdown for results table
  const catBreakdown = useMemo(() => {
    const rdStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
    return CATEGORIES.map(cat => {
      const entries = categoryEntries[cat.id] || [];
      const totalSpend = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      if (!totalSpend) return null;

      let actualEarnings = 0;
      for (const entry of entries) {
        const card = CARDS.find(c => c.id === entry.cardId);
        if (!card) continue;
        const amount = parseFloat(entry.amount) || 0;
        const rate = getEffectiveRate(card, cat.id, activationStatus, amount);
        const val = (rdStyle?.valuations[card.issuer] || 1.0) / 100;
        actualEarnings += amount * rate * val;
      }

      let bestOwnedRate = 0, bestOwnedCard = null;
      for (const cid of ownedCards) {
        const card = CARDS.find(c => c.id === cid);
        if (!card) continue;
        const r = getEffectiveRate(card, cat.id, activationStatus, totalSpend);
        if (r > bestOwnedRate) { bestOwnedRate = r; bestOwnedCard = card; }
      }

      let bestMarketRate = 0, bestMarketCard = null;
      for (const card of CARDS) {
        const fakeAct = card.rotating?.isRotating ? { [card.id]: true } : {};
        const r = getEffectiveRate(card, cat.id, fakeAct, totalSpend);
        if (r > bestMarketRate) { bestMarketRate = r; bestMarketCard = card; }
      }

      const opportunity = (bestMarketRate - bestOwnedRate) * totalSpend * 12 *
        ((rdStyle?.valuations[bestMarketCard?.issuer] || 1.0) / 100);

      return { cat, totalSpend, actualEarnings: actualEarnings * 12, bestOwnedRate, bestOwnedCard, bestMarketRate, bestMarketCard, opportunity };
    }).filter(Boolean).sort((a, b) => b.opportunity - a.opportunity);
  }, [categoryEntries, ownedCards, activationStatus, redeemStyle]);

  const totalAnnualEarnings = catBreakdown.reduce((s, c) => s + c.actualEarnings, 0);
  const totalAnnualFees = ownedCards.reduce((s, id) => s + (CARDS.find(c => c.id === id)?.annualFee || 0), 0);

  // AI analysis
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const fetchAI = async () => {
    setAiLoading(true); setAiError(''); setAiText('');
    const rdStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
    const cardNames = ownedCards.map(id => CARDS.find(c => c.id === id)?.name).filter(Boolean).join(', ');
    const spendSummary = catBreakdown.map(r => `${r.cat.label}: ${fmt(r.totalSpend)}/mo`).join(', ');
    const prompt = `You are a credit card rewards expert. Cards: ${cardNames || 'none'}. Monthly spend: ${spendSummary || 'not set'}. Redemption: ${rdStyle?.label}. Monthly gaps — unactivated bonuses: ${fmt(gap0)}, wrong card routing: ${fmt(gap1)}. In 3-4 sentences, give the single most impactful actionable advice. Be specific. Don't repeat the numbers back.`;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      setAiText(data.content?.[0]?.text || '');
    } catch (err) {
      setAiError(err.message || 'Failed. Check your VITE_ANTHROPIC_API_KEY.');
    } finally {
      setAiLoading(false);
    }
  };

  const rotatingOwned = CARDS.filter(c => c.rotating?.isRotating && ownedCards.includes(c.id));
  const hasAnyData = ownedCards.length > 0 || Object.values(effectiveSpend).some(v => parseFloat(v) > 0);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!hasAnyData && plaidStatus !== 'loading') {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">Start with your wallet</div>
          <div className="empty-state-desc">
            Complete the Wallet Optimizer first to load your cards and spending — then come back here to see exactly what you're earning and missing.
          </div>
          <Link to="/wallet" className="btn btn-primary">Go to Wallet Optimizer →</Link>
        </div>
      </div>
    );
  }

  // ── Account matching step (Plaid connected, unmapped accounts exist) ─────────
  const needsMapping = plaidStatus === 'connected' && creditAccounts.length > 0 && !mappingComplete;

  return (
    <div className="page-container">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 6 }}>Earn Analyzer</h1>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
          {isPlaidMode
            ? 'Showing actual spending from your connected bank accounts.'
            : 'See what each dollar earns and where you\'re leaving money behind.'}
        </p>
      </div>

      {/* ── Section A: Cards + activation ────────────────────────────────────── */}
      <div className="earn-section">
        <div className="earn-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Your Cards
          <Link to="/wallet" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-primary)', textDecoration: 'none' }}>
            Edit in Wallet Optimizer →
          </Link>
        </div>

        {ownedCards.length > 0 ? (
          <>
            <div className="earn-owned-pills" style={{ marginBottom: rotatingOwned.length > 0 ? 16 : 0 }}>
              {ownedCards.map(cid => {
                const card = CARDS.find(c => c.id === cid);
                return card ? (
                  <span key={cid} className="earn-owned-pill">
                    {card.name.replace('Chase ', '').replace('American Express ', 'Amex ').replace('Capital One ', '')}
                  </span>
                ) : null;
              })}
            </div>
            {rotatingOwned.length > 0 && (
              <div className="activation-banners">
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Quarterly bonus activation
                </div>
                {rotatingOwned.map(card => (
                  <ActivationBanner
                    key={card.id}
                    card={card}
                    activationStatus={activationStatus}
                    categoryEntries={categoryEntries}
                    redeemStyle={redeemStyle}
                    onToggle={() => toggleActivation(card.id)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>
            No cards set — <Link to="/wallet" style={{ color: 'var(--color-primary)' }}>complete the Wallet Optimizer first</Link>.
          </p>
        )}
      </div>

      {/* ── Account matcher (shown only when needed) ────────────────────────── */}
      {needsMapping && (
        <AccountMatcher
          accounts={creditAccounts}
          initialMapping={accountMapping}
          onSave={saveMapping}
        />
      )}

      {/* ── Section B: Spending by card ──────────────────────────────────────── */}
      {!needsMapping && ownedCards.length > 0 && (
        <div className="earn-section">
          <div className="earn-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            Spending by Card
            {isPlaidMode && (
              <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 500 }}>
                🔗 From your bank · last 3 months
              </span>
            )}
            {plaidStatus === 'connected' && mappingComplete && (
              <button
                className="earn-source-switch"
                style={{ fontSize: 12, color: 'var(--gray-400)' }}
                onClick={() => {
                  localStorage.removeItem(MAPPING_KEY);
                  setAccountMapping({});
                  setCreditAccounts([]);
                }}
              >
                Re-link accounts
              </button>
            )}
          </div>
          <div className="earn-section-sub">
            {isPlaidMode
              ? 'Actual spending pulled from your connected accounts. Each row shows what you earned and whether a better card is available.'
              : 'Your estimated monthly spend, routed to your best owned card per category.'}
          </div>

          <div className="earn-cat-list">
            {CATEGORIES.map(cat => {
              const entries = categoryEntries[cat.id] || [];
              const hasData = entries.some(e => parseFloat(e.amount) > 0) || (parseFloat(effectiveSpend[cat.id]) || 0) > 0;
              if (!hasData && isPlaidMode) return null;
              if (isPlaidMode) {
                if (!entries.length || !entries.some(e => parseFloat(e.amount) > 0)) return null;
                return (
                  <CategoryRow
                    key={cat.id}
                    cat={cat}
                    entries={entries}
                    ownedCards={ownedCards}
                    activationStatus={activationStatus}
                    redeemStyle={redeemStyle}
                  />
                );
              }
              // Manual mode: only show categories that have a spend budget
              if (!(parseFloat(effectiveSpend[cat.id]) || 0)) return null;
              const catEntries = entries.length > 0 ? entries : [{ cardId: ownedCards[0] || '', amount: effectiveSpend[cat.id] || '' }];
              return (
                <EditableCategoryRow
                  key={cat.id}
                  cat={cat}
                  entries={catEntries}
                  ownedCards={ownedCards}
                  activationStatus={activationStatus}
                  redeemStyle={redeemStyle}
                  onChange={next => {
                    const updated = { ...manualEntries, [cat.id]: next };
                    setManualEntries(updated);
                    dispatch({ type: 'SET_CATEGORY_ENTRIES', payload: updated });
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section C: Gap analysis ───────────────────────────────────────────── */}
      {!needsMapping && catBreakdown.length > 0 && (
        <div className="earn-results">

          {/* Gap cards */}
          <div className="gaps-section">
            <h3>Where you're leaving money behind</h3>
            <div className="gap-cards">
              {[
                { cls: 'gap0', label: 'Gap 0', title: 'Unactivated Bonuses', val: gap0,
                  desc: gap0 > 0 ? `${fmt(gap0 * 12)}/yr from rotating bonuses you haven't activated` : 'All rotating bonuses activated ✓' },
                { cls: 'gap1', label: 'Gap 1', title: 'Wrong Card Routing', val: gap1,
                  desc: gap1 > 0 ? `${fmt(gap1 * 12)}/yr lost by using a lower-earning card` : 'Your routing is optimal ✓' },
              ].map(g => (
                <div key={g.cls} className={`gap-card ${g.cls}`}>
                  <div className="gap-number">{g.label}</div>
                  <div className="gap-title">{g.title}</div>
                  <div className={`gap-value ${g.val === 0 ? 'positive' : ''}`}>
                    {g.val === 0 ? '✓ $0' : `${fmt(g.val)}/mo`}
                  </div>
                  <div className="gap-desc">{g.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Annual picture */}
          <div className="annual-summary" style={{ boxShadow: 'var(--shadow-md)', border: '1.5px solid var(--gray-200)', marginBottom: 24 }}>
            {[
              { label: 'Annual Earnings',   val: totalAnnualEarnings,                          cls: 'positive' },
              { label: 'Annual Fees',        val: -totalAnnualFees,                             cls: totalAnnualFees > 0 ? '' : 'positive' },
              { label: 'Net / Year',         val: totalAnnualEarnings - totalAnnualFees,        cls: totalAnnualEarnings >= totalAnnualFees ? 'positive' : 'negative' },
              { label: 'Routing Gap / Year',  val: (gap0 + gap1) * 12,                          cls: 'negative' },
            ].map(s => (
              <div key={s.label} className="summary-stat">
                <div className="summary-stat-label">{s.label}</div>
                <div className="summary-stat-value" style={{
                  color: s.cls === 'positive' ? 'var(--teal)' : s.cls === 'negative' ? 'var(--red)' : 'var(--gray-700)',
                }}>
                  {s.val < 0 ? '−' : ''}{fmt(Math.abs(s.val))}
                </div>
              </div>
            ))}
          </div>

          {/* Per-category opportunity table */}
          <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid var(--gray-200)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: 24 }}>
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Monthly</th>
                  <th>Earning / yr</th>
                  <th>Best you own</th>
                  <th>Best on market</th>
                  <th>Gap / yr</th>
                </tr>
              </thead>
              <tbody>
                {catBreakdown.map(row => (
                  <tr key={row.cat.id}>
                    <td><strong>{CAT_ICONS[row.cat.id]} {row.cat.label}</strong></td>
                    <td>{fmt(row.totalSpend)}</td>
                    <td style={{ color: 'var(--teal)', fontWeight: 700 }}>{fmt(row.actualEarnings)}</td>
                    <td>
                      <span className={`rate-badge ${row.bestOwnedRate >= 3 ? 'good' : 'warn'}`}>
                        {Number.isInteger(row.bestOwnedRate) ? row.bestOwnedRate : row.bestOwnedRate.toFixed(1)}x — {row.bestOwnedCard?.name.split(' ').pop()}
                      </span>
                    </td>
                    <td>
                      <span className="rate-badge market">
                        {Number.isInteger(row.bestMarketRate) ? row.bestMarketRate : row.bestMarketRate.toFixed(1)}x — {row.bestMarketCard?.name.split(' ').pop()}
                      </span>
                    </td>
                    <td style={{ color: row.opportunity > 0 ? 'var(--red)' : 'var(--teal)', fontWeight: 700 }}>
                      {row.opportunity > 0 ? `+${fmt(row.opportunity)}` : '✓'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AI analysis */}
          <div className="ai-insight-card">
            <div className="ai-insight-header">✨ AI Analysis</div>
            {!aiText && !aiLoading && !aiError && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>
                  Get a personalized recommendation based on your actual spend and gaps.
                </p>
                <button className="btn btn-primary" style={{ fontSize: 14 }} onClick={fetchAI}>
                  Get AI Analysis
                </button>
              </div>
            )}
            {aiLoading && <div className="ai-insight-loading"><div className="spinner" /> Analyzing…</div>}
            {aiError && (
              <div style={{ color: 'var(--red)', fontSize: 13 }}>
                {aiError}
                <button className="btn btn-secondary" style={{ marginLeft: 12, fontSize: 12 }} onClick={fetchAI}>Retry</button>
              </div>
            )}
            {aiText && <div className="ai-insight-body">{aiText}</div>}
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <Link to="/wallet" className="btn btn-outline" style={{ fontSize: 15 }}>
              See which wallets fix this →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
