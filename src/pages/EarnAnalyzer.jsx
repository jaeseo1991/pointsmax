import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CARDS, CATEGORIES, REDEMPTION_STYLES } from '../data/cards';
import { getEffectiveRate, calculateGap0, calculateGap1, fmt } from '../utils/calculations';
import { analyzeTransactionsByCard, analyzeTransactions, projectSpend } from '../utils/plaidCategories';
import PlaidConnectButton from '../components/PlaidConnectButton';
import AccountMatcher from '../components/earn/AccountMatcher';
import ActivationBanner from '../components/earn/ActivationBanner';
import { CategoryRow, CAT_ICONS } from '../components/earn/CategoryRows';
import CardSelector from '../components/earn/CardSelector';
import SpendGrid from '../components/earn/SpendGrid';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const MAPPING_KEY = 'pointsmax_account_map';

export default function EarnAnalyzer() {
  const { state, dispatch } = useApp();
  const { ownedCards, spend, redeemStyle, activationStatus } = state;

  // Plaid state
  const [plaidStatus, setPlaidStatus] = useState('loading'); // loading | connected | disconnected
  const [creditAccounts, setCreditAccounts] = useState([]);
  const [accountMapping, setAccountMapping] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}'); } catch { return {}; }
  });
  const [transactions, setTransactions] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualEntries, setManualEntries] = useState(state.categoryEntries);

  const mappingComplete = creditAccounts.length === 0 ||
    creditAccounts.every(a => accountMapping[a.account_id] !== undefined && accountMapping[a.account_id] !== '');

  // Plaid-derived entries
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

  // Load Plaid status on mount
  const loadPlaidStatus = () => {
    fetch(`${API}/api/status`)
      .then(r => r.json())
      .then(data => {
        if (!data.connected) { setPlaidStatus('disconnected'); return; }
        setPlaidStatus('connected');
        return fetch(`${API}/api/accounts`)
          .then(r => r.json())
          .then(d => setCreditAccounts((d.accounts || []).filter(a => a.type === 'credit')));
      })
      .catch(() => setPlaidStatus('disconnected'));
  };

  useEffect(() => { loadPlaidStatus(); }, []);

  // Fetch transactions once connected + mapped
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

  // Sync ownedCards from Plaid mapping (merge, don't replace)
  useEffect(() => {
    if (!isPlaidMode) return;
    const plaidCards = [...new Set(Object.values(accountMapping).filter(id => id && id !== '__skip__'))];
    if (!plaidCards.length) return;
    const merged = [...new Set([...ownedCards, ...plaidCards])];
    if (merged.length !== ownedCards.length) {
      dispatch({ type: 'SET_OWNED_CARDS', payload: merged });
    }
  }, [isPlaidMode]); // eslint-disable-line

  // Auto-populate manual entries from spend when cards are added
  useEffect(() => {
    if (isPlaidMode || ownedCards.length === 0) return;
    const updated = { ...manualEntries };
    let changed = false;
    for (const cat of CATEGORIES) {
      const monthly = parseFloat(effectiveSpend[cat.id]) || 0;
      if (!monthly || updated[cat.id]?.length > 0) continue;
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

  const handlePlaidSuccess = () => {
    setPlaidStatus('loading');
    loadPlaidStatus();
  };

  const updateManualEntries = (catId, entries) => {
    const updated = { ...manualEntries, [catId]: entries };
    setManualEntries(updated);
    dispatch({ type: 'SET_CATEGORY_ENTRIES', payload: updated });
  };

  const toggleActivation = cardId => dispatch({ type: 'TOGGLE_ACTIVATION', payload: { cardId } });

  // Calculations
  const gap0 = useMemo(() => calculateGap0(categoryEntries, ownedCards, activationStatus, redeemStyle), [categoryEntries, ownedCards, activationStatus, redeemStyle]);
  const gap1 = useMemo(() => calculateGap1(categoryEntries, ownedCards, activationStatus, redeemStyle), [categoryEntries, ownedCards, activationStatus, redeemStyle]);

  // Activation status with all owned rotating cards treated as active — used to
  // compute the "best possible" rate ceiling in the breakdown table.
  const fullyActivated = useMemo(() => {
    const result = { ...activationStatus };
    for (const cid of ownedCards) {
      const card = CARDS.find(c => c.id === cid);
      if (card?.rotating?.isRotating) result[cid] = true;
    }
    return result;
  }, [ownedCards, activationStatus]);

  const catBreakdown = useMemo(() => {
    const rdStyle = REDEMPTION_STYLES.find(r => r.id === redeemStyle);

    // Pre-compute total spend assigned to each rotating card across all its rotating categories.
    // The quarterly cap ($1,500) is shared across all rotating categories — not per-category.
    const rotatingTotalByCard = {};
    for (const cid of ownedCards) {
      const card = CARDS.find(c => c.id === cid);
      if (!card?.rotating?.isRotating) continue;
      let total = 0;
      for (const rCat of card.rotating.currentQuarter.categories) {
        const rEntries = categoryEntries[rCat] || [];
        for (const e of rEntries) {
          if (e.cardId === cid) total += parseFloat(e.amount) || 0;
        }
      }
      rotatingTotalByCard[cid] = total;
    }

    return CATEGORIES.map(cat => {
      const entries = categoryEntries[cat.id] || [];
      const totalSpend = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      if (!totalSpend) return null;

      // Actual earnings — 1¢/point flat (raw multiplier × spend, no valuation assumption)
      let actualEarnings = 0;
      for (const entry of entries) {
        const card = CARDS.find(c => c.id === entry.cardId);
        if (!card) continue;
        const amount = parseFloat(entry.amount) || 0;
        const isRotatingCat = card.rotating?.isRotating && card.rotating.currentQuarter?.categories.includes(cat.id);
        if (isRotatingCat && activationStatus[card.id]) {
          const { multiplier, cap } = card.rotating.currentQuarter;
          const monthlyCap = cap / 3;
          const totalRot = rotatingTotalByCard[card.id] || amount;
          const capRatio = Math.min(1, monthlyCap / totalRot);
          actualEarnings += (amount * capRatio * multiplier + amount * (1 - capRatio) * 1) * 0.01;
        } else {
          actualEarnings += amount * getEffectiveRate(card, cat.id, activationStatus, amount) * 0.01;
        }
      }

      // Best rate — assumes all rotating cards activated, with combined cap
      let bestOwnedRate = 0, bestOwnedCard = null;
      for (const cid of ownedCards) {
        const card = CARDS.find(c => c.id === cid);
        if (!card) continue;
        const isRotatingCat = card.rotating?.isRotating && card.rotating.currentQuarter?.categories.includes(cat.id);
        let r;
        if (isRotatingCat) {
          const { multiplier, cap } = card.rotating.currentQuarter;
          const monthlyCap = cap / 3;
          const totalRot = Math.max(rotatingTotalByCard[cid] || 0, totalSpend);
          const capRatio = Math.min(1, monthlyCap / totalRot);
          r = capRatio * multiplier + (1 - capRatio) * 1;
        } else {
          r = getEffectiveRate(card, cat.id, fullyActivated, totalSpend);
        }
        if (r > bestOwnedRate) { bestOwnedRate = r; bestOwnedCard = card; }
      }

      const ownedGap = Math.max(0, bestOwnedRate * totalSpend * 12 * 0.01 - actualEarnings * 12);

      const bestOwnedIsRotating = !!(bestOwnedCard?.rotating?.isRotating && bestOwnedCard.rotating.currentQuarter?.categories.includes(cat.id));
      return { cat, totalSpend, actualEarnings: actualEarnings * 12, bestOwnedRate, bestOwnedCard, bestOwnedIsRotating, ownedGap };
    }).filter(Boolean).sort((a, b) => b.ownedGap - a.ownedGap);
  }, [categoryEntries, ownedCards, activationStatus, fullyActivated, redeemStyle]);

  const totalAnnualEarnings = catBreakdown.reduce((s, c) => s + c.actualEarnings, 0);
  const totalRoutingGap = catBreakdown.reduce((s, c) => s + c.ownedGap, 0);

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
      const res = await fetch(`${API}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiText(data.text || '');
    } catch (err) {
      setAiError(err.message || 'AI analysis failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const rotatingOwned = CARDS.filter(c => c.rotating?.isRotating && ownedCards.includes(c.id));
  const needsMapping = plaidStatus === 'connected' && creditAccounts.length > 0 && !mappingComplete;
  const showHero = plaidStatus === 'disconnected' && !manualMode && ownedCards.length === 0;
  const showManual = !isPlaidMode && !needsMapping && !showHero && plaidStatus !== 'loading';

  return (
    <div className="page-container">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 6 }}>Earn Analyzer</h1>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
          {isPlaidMode
            ? 'Showing actual spending from your connected bank.'
            : 'See what each dollar earns and where you\'re leaving money behind.'}
        </p>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {plaidStatus === 'loading' && (
        <div style={{ color: 'var(--gray-400)', fontSize: 14, padding: '8px 0' }}>Checking connection…</div>
      )}

      {/* ── Hero: Plaid CTA ─────────────────────────────────────────────────── */}
      {showHero && (
        <div className="plaid-hero">
          <div className="plaid-hero-icon">🏦</div>
          <div className="plaid-hero-title">See what you actually earn</div>
          <div className="plaid-hero-desc">
            Connect your bank to analyze real transactions and find exactly where you're leaving rewards on the table.
          </div>
          <PlaidConnectButton onSuccess={handlePlaidSuccess} />
          <button className="plaid-hero-manual" onClick={() => setManualMode(true)}>
            No thanks — I'll enter spend manually
          </button>
        </div>
      )}

      {/* ── Account matcher ─────────────────────────────────────────────────── */}
      {needsMapping && (
        <AccountMatcher accounts={creditAccounts} initialMapping={accountMapping} onSave={saveMapping} />
      )}

      {/* ── Plaid mode ──────────────────────────────────────────────────────── */}
      {isPlaidMode && !needsMapping && (
        <>
          <div className="earn-section">
            <div className="earn-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Your Cards
              <span className="plaid-connected-badge">🔗 Connected via Plaid</span>
            </div>
            {ownedCards.length > 0 && (
              <div className="earn-owned-pills" style={{ marginBottom: rotatingOwned.length > 0 ? 16 : 0 }}>
                {ownedCards.map(cid => {
                  const card = CARDS.find(c => c.id === cid);
                  return card ? (
                    <span key={cid} className="earn-owned-pill">
                      <span className="card-chip-dot" style={{ background: card.color }} />
                      {card.name.replace('Chase ', '').replace('American Express ', 'Amex ').replace('Capital One ', '')}
                    </span>
                  ) : null;
                })}
              </div>
            )}
            {rotatingOwned.length > 0 && (
              <div className="activation-banners">
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Quarterly bonus activation
                </div>
                {rotatingOwned.map(card => (
                  <ActivationBanner key={card.id} card={card} ownedCards={ownedCards} activationStatus={activationStatus}
                    categoryEntries={categoryEntries} redeemStyle={redeemStyle} onToggle={() => toggleActivation(card.id)} />
                ))}
              </div>
            )}
            <button className="earn-relink-btn" onClick={() => { localStorage.removeItem(MAPPING_KEY); setAccountMapping({}); setCreditAccounts([]); }}>
              Re-link accounts
            </button>
          </div>

          <div className="earn-section">
            <div className="earn-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Spending by Card
              <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 500 }}>Last 3 months · actual</span>
            </div>
            <div className="earn-cat-list">
              {CATEGORIES.map(cat => {
                const entries = categoryEntries[cat.id] || [];
                if (!entries.some(e => parseFloat(e.amount) > 0)) return null;
                return <CategoryRow key={cat.id} cat={cat} entries={entries} ownedCards={ownedCards}
                  activationStatus={activationStatus} redeemStyle={redeemStyle} />;
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Manual mode ─────────────────────────────────────────────────────── */}
      {showManual && (
        <>
          {/* Plaid nudge */}
          {plaidStatus === 'disconnected' && (
            <div className="plaid-nudge-banner">
              <span>🏦 Connect your bank for analysis based on real transactions</span>
              <PlaidConnectButton onSuccess={handlePlaidSuccess} label="Connect →" compact />
            </div>
          )}

          {/* Card selector */}
          <div className="earn-section">
            <div className="earn-section-title">Your Cards</div>
            <div className="earn-section-sub">Select all the cards in your wallet.</div>
            <CardSelector
              selected={ownedCards}
              onChange={ids => dispatch({ type: 'SET_OWNED_CARDS', payload: ids })}
            />
          </div>

          {/* Activation banners */}
          {rotatingOwned.length > 0 && (
            <div className="earn-section">
              <div className="earn-section-title">Quarterly Bonus Activation</div>
              <div className="activation-banners">
                {rotatingOwned.map(card => (
                  <ActivationBanner key={card.id} card={card} ownedCards={ownedCards} activationStatus={activationStatus}
                    categoryEntries={categoryEntries} redeemStyle={redeemStyle} onToggle={() => toggleActivation(card.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Spend grid */}
          {ownedCards.length > 0 && (
            <div className="earn-section">
              <div className="earn-section-title">Monthly Spend</div>
              <div className="earn-section-sub">
                Enter how much you spend per category. We'll route each to your best card automatically.
                {ownedCards.length > 1 && ' Use "split" to assign a category across multiple cards.'}
              </div>
              <SpendGrid
                categoryEntries={manualEntries}
                ownedCards={ownedCards}
                activationStatus={activationStatus}
                redeemStyle={redeemStyle}
                onChange={updateManualEntries}
              />
            </div>
          )}
        </>
      )}

      {/* ── Results (both modes) ────────────────────────────────────────────── */}
      {!needsMapping && catBreakdown.length > 0 && (
        <div className="earn-results">

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, background: 'white', border: '1.5px solid var(--gray-200)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--gray-400)', marginBottom: 6 }}>Earning / yr</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal)' }}>{fmt(totalAnnualEarnings)}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 3 }}>at 1¢ per point</div>
            </div>
            <div style={{ flex: 1, background: 'white', border: '1.5px solid var(--gray-200)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--gray-400)', marginBottom: 6 }}>Potential upside / yr</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: totalRoutingGap > 0 ? '#d97706' : 'var(--teal)' }}>
                {totalRoutingGap > 0 ? `+${fmt(totalRoutingGap)}` : '✓ Optimized'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 3 }}>with your current cards</div>
            </div>
          </div>


          <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid var(--gray-200)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: 24 }}>
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th>Category</th><th>Monthly</th><th>Earning / yr</th>
                  <th>Best card</th><th>Potential gain / yr</th>
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
                        {row.bestOwnedIsRotating
                          ? `5x* — ${row.bestOwnedCard?.name.split(' ').pop()}`
                          : `${Number.isInteger(row.bestOwnedRate) ? row.bestOwnedRate : row.bestOwnedRate.toFixed(1)}x — ${row.bestOwnedCard?.name.split(' ').pop()}`}
                      </span>
                      {row.bestOwnedIsRotating && (
                        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 3 }}>Q2 only · $1,500/qtr cap</div>
                      )}
                    </td>
                    <td style={{ color: row.ownedGap > 0 ? 'var(--red)' : 'var(--teal)', fontWeight: 700 }}>
                      {row.ownedGap > 0 ? `+${fmt(row.ownedGap)}` : '✓'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ai-insight-card">
            <div className="ai-insight-header">✨ AI Analysis</div>
            {!aiText && !aiLoading && !aiError && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>
                  Get a personalized recommendation based on your actual spend and gaps.
                </p>
                <button className="btn btn-primary" style={{ fontSize: 14 }} onClick={fetchAI}>Get AI Analysis</button>
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
