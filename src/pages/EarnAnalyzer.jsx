import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CARDS, CATEGORIES, REDEMPTION_STYLES } from '../data/cards';
import {
  getEffectiveRate,
  calculateGap0,
  calculateGap1,
  calculateGap2,
  calculateWalletEarnings,
  calculateEffectiveFee,
  fmt,
} from '../utils/calculations';

const CAT_ICONS = { dining:'🍽️', groceries:'🛒', travel:'✈️', gas:'⛽', shopping:'🛍️', subscriptions:'📱', entertainment:'🎬', other:'💳' };

// Flip an owned card
function useOwnedCards() {
  const { state, dispatch } = useApp();
  const toggle = cardId => {
    const next = state.ownedCards.includes(cardId)
      ? state.ownedCards.filter(id => id !== cardId)
      : [...state.ownedCards, cardId];
    dispatch({ type: 'SET_OWNED_CARDS', payload: next });
  };
  return { ownedCards: state.ownedCards, toggle };
}

// ─── Rate badge ───────────────────────────────────────────────────────────────
function RateBadge({ card, category, activationStatus, monthlySpend, redeemStyle }) {
  if (!card) return null;
  const rate = getEffectiveRate(card, category, activationStatus, monthlySpend);
  const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
  const valCents = style?.valuations[card.issuer] || 1.0;
  const pct = (rate * valCents).toFixed(1);

  const isRotatingUnactivated =
    card.rotating?.isRotating &&
    card.rotating.currentQuarter?.categories.includes(category) &&
    !activationStatus[card.id];

  if (isRotatingUnactivated) {
    return <span className="rate-badge bad">{card.name.split(' ').pop()} — 1x ✗ Not activated</span>;
  }

  const isHighlight = rate >= 3;
  return (
    <span className={`rate-badge ${isHighlight ? 'good' : 'warn'}`}>
      {card.name.split(' ').pop()} — {rate % 1 === 0 ? rate : rate.toFixed(1)}x @ {valCents}¢ = {pct}%
    </span>
  );
}

// ─── Activation banner for one rotating card ─────────────────────────────────
function ActivationBanner({ card, activationStatus, spend, redeemStyle, onToggle }) {
  const { currentQuarter } = card.rotating;
  const isOn = !!activationStatus[card.id];

  // Impact calculation: monthly gain from activating
  const monthlyImpact = useMemo(() => {
    let gain = 0;
    for (const cat of currentQuarter.categories) {
      const monthly = parseFloat(spend[cat]) || 0;
      if (!monthly) continue;
      const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
      const val = (style?.valuations[card.issuer] || 1.0) / 100;
      const monthlyCap = currentQuarter.cap / 3;
      const effectiveSpend = Math.min(monthly, monthlyCap);
      gain += effectiveSpend * (currentQuarter.multiplier - 1) * val;
    }
    return gain;
  }, [card, currentQuarter, spend, redeemStyle]);

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
            ? `✓ Activated — earning up to ${fmt(monthlyImpact)}/mo extra`
            : monthlyImpact > 0
              ? `⚠ Not activated — you're missing ${fmt(monthlyImpact)}/mo`
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function EarnAnalyzer() {
  const { state, dispatch } = useApp();
  const { ownedCards, spend, redeemStyle, activationStatus } = state;
  const { toggle: toggleOwned } = useOwnedCards();

  // Local category entries (synced to context on change)
  const [categoryEntries, setCategoryEntries] = useState(state.categoryEntries);
  const [showResults, setShowResults] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistDone, setWaitlistDone] = useState(false);

  // Auto-populate category entries when ownedCards or spend changes
  useEffect(() => {
    if (ownedCards.length === 0) return;
    const existingCats = Object.keys(categoryEntries);
    const updated = { ...categoryEntries };
    let changed = false;

    for (const cat of CATEGORIES) {
      const monthly = parseFloat(spend[cat.id]) || 0;
      if (!monthly) continue;
      if (existingCats.includes(cat.id) && updated[cat.id].length > 0) continue;

      // Find best owned card for this category
      let bestCard = ownedCards[0];
      let bestRate = 0;
      for (const cid of ownedCards) {
        const card = CARDS.find(c => c.id === cid);
        if (!card) continue;
        const rate = getEffectiveRate(card, cat.id, activationStatus, monthly);
        if (rate > bestRate) { bestRate = rate; bestCard = cid; }
      }
      updated[cat.id] = [{ cardId: bestCard, amount: String(monthly) }];
      changed = true;
    }

    if (changed) {
      setCategoryEntries(updated);
      dispatch({ type: 'SET_CATEGORY_ENTRIES', payload: updated });
    }
  }, [ownedCards.join(','), Object.values(spend).join(',')]);

  const syncEntries = entries => {
    setCategoryEntries(entries);
    dispatch({ type: 'SET_CATEGORY_ENTRIES', payload: entries });
  };

  const toggleActivation = cardId => dispatch({ type: 'TOGGLE_ACTIVATION', payload: { cardId } });

  // Category helpers
  const updateEntry = (cat, idx, field, value) => {
    const updated = { ...categoryEntries, [cat]: [...(categoryEntries[cat] || [])] };
    updated[cat][idx] = { ...updated[cat][idx], [field]: value };
    syncEntries(updated);
  };

  const addEntry = cat => {
    const updated = { ...categoryEntries };
    updated[cat] = [...(updated[cat] || []), { cardId: ownedCards[0] || '', amount: '' }];
    syncEntries(updated);
  };

  const removeEntry = (cat, idx) => {
    const updated = { ...categoryEntries };
    updated[cat] = updated[cat].filter((_, i) => i !== idx);
    syncEntries(updated);
  };

  // Gaps
  const gap0 = useMemo(() => calculateGap0(categoryEntries, activationStatus, redeemStyle), [categoryEntries, activationStatus, redeemStyle]);
  const gap1 = useMemo(() => calculateGap1(categoryEntries, ownedCards, activationStatus, redeemStyle), [categoryEntries, ownedCards, activationStatus, redeemStyle]);
  const gap2 = useMemo(() => calculateGap2(categoryEntries, ownedCards, activationStatus, redeemStyle), [categoryEntries, ownedCards, activationStatus, redeemStyle]);

  // Per-category summary
  const catBreakdown = useMemo(() => {
    return CATEGORIES.map(cat => {
      const entries = categoryEntries[cat.id] || [];
      const totalSpend = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      if (!totalSpend) return null;

      const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);

      let actualEarnings = 0;
      for (const entry of entries) {
        const card = CARDS.find(c => c.id === entry.cardId);
        if (!card) continue;
        const amount = parseFloat(entry.amount) || 0;
        const rate = getEffectiveRate(card, cat.id, activationStatus, amount);
        const val = (style?.valuations[card.issuer] || 1.0) / 100;
        actualEarnings += amount * rate * val;
      }

      // Best owned
      let bestOwnedRate = 0, bestOwnedCard = null;
      for (const cid of ownedCards) {
        const card = CARDS.find(c => c.id === cid);
        if (!card) continue;
        const rate = getEffectiveRate(card, cat.id, activationStatus, totalSpend);
        if (rate > bestOwnedRate) { bestOwnedRate = rate; bestOwnedCard = card; }
      }

      // Best market
      let bestMarketRate = 0, bestMarketCard = null;
      for (const card of CARDS) {
        const fakeAct = card.rotating?.isRotating ? { [card.id]: true } : {};
        const rate = getEffectiveRate(card, cat.id, fakeAct, totalSpend);
        if (rate > bestMarketRate) { bestMarketRate = rate; bestMarketCard = card; }
      }

      return {
        cat,
        totalSpend,
        actualEarnings: actualEarnings * 12,
        bestOwnedRate,
        bestOwnedCard,
        bestMarketRate,
        bestMarketCard,
        opportunity: (bestMarketRate - bestOwnedRate) * totalSpend * 12 * ((style?.valuations[bestMarketCard?.issuer] || 1.0) / 100),
      };
    }).filter(Boolean).sort((a, b) => b.opportunity - a.opportunity);
  }, [categoryEntries, ownedCards, activationStatus, redeemStyle]);

  const totalAnnualEarnings = catBreakdown.reduce((s, c) => s + c.actualEarnings, 0);
  const totalAnnualFees = ownedCards.reduce((s, id) => {
    const card = CARDS.find(c => c.id === id);
    return s + (card?.annualFee || 0);
  }, 0);

  // AI analysis
  const buildPrompt = () => {
    const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);
    const cardNames = ownedCards.map(id => CARDS.find(c => c.id === id)?.name).filter(Boolean).join(', ');
    const spendSummary = Object.entries(spend).filter(([, v]) => parseFloat(v) > 0)
      .map(([k, v]) => `${k}: $${v}/mo`).join(', ');
    return `You are a credit card rewards expert. A user has these credit cards: ${cardNames || 'none'}. Their monthly spend: ${spendSummary || 'not specified'}. Their redemption style: ${style?.label}. Their monthly opportunity gaps: Gap 0 (unactivated bonuses) = ${fmt(gap0)}, Gap 1 (wrong routing) = ${fmt(gap1)}, Gap 2 (better cards) = ${fmt(gap2)}. In 3-4 sentences, give them the single most impactful actionable advice to maximize their rewards. Be specific and direct. Don't repeat the numbers back to them.`;
  };

  const fetchAI = async () => {
    setAiLoading(true);
    setAiError('');
    setAiText('');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          messages: [{ role: 'user', content: buildPrompt() }],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      setAiText(data.content?.[0]?.text || 'No response received.');
    } catch (err) {
      setAiError(err.message || 'Failed to get AI analysis. Check your VITE_ANTHROPIC_API_KEY.');
    } finally {
      setAiLoading(false);
    }
  };

  const rotatingOwned = CARDS.filter(c => c.rotating?.isRotating && ownedCards.includes(c.id));

  if (ownedCards.length === 0 && Object.values(spend).every(v => !parseFloat(v))) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">Start with your wallet</div>
          <div className="empty-state-desc">Complete the Wallet Optimizer first to load your cards and spending — then come here to see exactly what you're earning (and missing).</div>
          <Link to="/wallet" className="btn btn-primary">Go to Wallet Optimizer →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 6 }}>Earn Analyzer</h1>
      <p style={{ color: 'var(--gray-500)', fontSize: 14, marginBottom: 28 }}>
        See exactly what each dollar earns and where you're leaving money behind.
      </p>

      {/* ── Section A: Card selector ── */}
      <div className="earn-section">
        <div className="earn-section-title">Your Cards</div>
        <div className="earn-section-sub">Select all cards you own. Tap to toggle.</div>

        <div className="card-chips">
          {CARDS.map(card => (
            <button key={card.id} className={`card-chip ${ownedCards.includes(card.id) ? 'owned' : ''}`}
              onClick={() => toggleOwned(card.id)}>
              {ownedCards.includes(card.id) ? '✓ ' : ''}{card.name}
            </button>
          ))}
        </div>

        {rotatingOwned.length > 0 && (
          <div className="activation-banners">
            {rotatingOwned.map(card => (
              <ActivationBanner
                key={card.id}
                card={card}
                activationStatus={activationStatus}
                spend={spend}
                redeemStyle={redeemStyle}
                onToggle={() => toggleActivation(card.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Section B: Spend entry table ── */}
      <div className="earn-section">
        <div className="earn-section-title">Spending by Category</div>
        <div className="earn-section-sub">
          Assign each dollar to the card you actually use. Split categories across multiple cards.
        </div>

        {ownedCards.length === 0 ? (
          <div style={{ color: 'var(--gray-400)', fontSize: 14, padding: '12px 0' }}>
            Select your cards above first.
          </div>
        ) : (
          <div className="category-sections">
            {CATEGORIES.map(cat => {
              const entries = categoryEntries[cat.id] || [];
              const catSpend = parseFloat(spend[cat.id]) || 0;
              const allocTotal = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
              const style = REDEMPTION_STYLES.find(r => r.id === redeemStyle);

              // Best owned / best market rates for header
              let bestOwnedRate = 0;
              let bestMarketRate = 0;
              let bestOwnedCard = null;
              let bestMarketCard = null;

              for (const cid of ownedCards) {
                const card = CARDS.find(c => c.id === cid);
                if (!card) continue;
                const rate = getEffectiveRate(card, cat.id, activationStatus, catSpend);
                if (rate > bestOwnedRate) { bestOwnedRate = rate; bestOwnedCard = card; }
              }
              for (const card of CARDS) {
                const fakeAct = card.rotating?.isRotating ? { [card.id]: true } : {};
                const rate = getEffectiveRate(card, cat.id, fakeAct, catSpend);
                if (rate > bestMarketRate) { bestMarketRate = rate; bestMarketCard = card; }
              }

              return (
                <div key={cat.id} className="category-section">
                  <div className="category-header">
                    <div className="category-header-name">
                      <span>{CAT_ICONS[cat.id]}</span>
                      <span>{cat.label}</span>
                    </div>
                    <div className="category-total">
                      Budget: {catSpend > 0 ? `$${catSpend}/mo` : 'not set'}
                    </div>
                    <div className="rate-badges">
                      {bestOwnedCard && (
                        <span className={`rate-badge ${bestOwnedRate >= 3 ? 'good' : 'warn'}`}>
                          Best owned: {bestOwnedRate % 1 === 0 ? bestOwnedRate : bestOwnedRate.toFixed(1)}x
                        </span>
                      )}
                      {bestMarketCard && bestMarketRate > bestOwnedRate && (
                        <span className="rate-badge market">
                          Market: {bestMarketRate}x ({bestMarketCard.name.split(' ').slice(-1)[0]})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="category-entries">
                    {entries.map((entry, idx) => {
                      const card = CARDS.find(c => c.id === entry.cardId);
                      const entryAmount = parseFloat(entry.amount) || 0;
                      return (
                        <div key={idx} className="entry-row">
                          <select className="entry-select" value={entry.cardId}
                            onChange={e => updateEntry(cat.id, idx, 'cardId', e.target.value)}>
                            {ownedCards.map(cid => {
                              const c = CARDS.find(x => x.id === cid);
                              if (!c) return null;
                              const r = getEffectiveRate(c, cat.id, activationStatus, entryAmount);
                              return <option key={cid} value={cid}>{c.name} ({r % 1 === 0 ? r : r.toFixed(1)}x)</option>;
                            })}
                          </select>
                          <div className="input-wrap" style={{ width: 110 }}>
                            <span>$</span>
                            <input className="entry-amount" type="number" min="0" placeholder="0"
                              value={entry.amount}
                              onChange={e => updateEntry(cat.id, idx, 'amount', e.target.value)}
                              style={{ paddingLeft: 24 }} />
                          </div>
                          <div className="entry-badge">
                            {card && <RateBadge card={card} category={cat.id} activationStatus={activationStatus} monthlySpend={entryAmount} redeemStyle={redeemStyle} />}
                          </div>
                          <button className="entry-remove" onClick={() => removeEntry(cat.id, idx)} title="Remove">✕</button>
                        </div>
                      );
                    })}

                    {allocTotal > catSpend && catSpend > 0 && (
                      <div className="overage-warn">⚠ Allocated ${allocTotal} exceeds budget ${catSpend}/mo</div>
                    )}

                    <button className="add-entry-btn" onClick={() => addEntry(cat.id)}>
                      + Add Card
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Calculate button ── */}
      {ownedCards.length > 0 && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <button className="btn btn-primary" style={{ fontSize: 16, padding: '14px 36px' }}
            onClick={() => setShowResults(true)}>
            Calculate My Gaps →
          </button>
        </div>
      )}

      {/* ── Section C: Results ── */}
      {showResults && (
        <div className="earn-results">
          {/* Gap cards */}
          <div className="gaps-section">
            <h3>Your Opportunity Gaps</h3>
            <div className="gap-cards">
              {[
                { cls: 'gap0', label: 'Gap 0', title: 'Unactivated Bonuses', val: gap0, unit: '/mo',
                  desc: gap0 > 0 ? `${fmt(gap0 * 12)}/yr from unactivated rotating categories` : 'All rotating bonuses activated ✓' },
                { cls: 'gap1', label: 'Gap 1', title: 'Wrong Card Routing', val: gap1, unit: '/mo',
                  desc: gap1 > 0 ? `${fmt(gap1 * 12)}/yr lost to sub-optimal card assignment` : 'Your routing is already optimal ✓' },
                { cls: 'gap2', label: 'Gap 2', title: 'Better Market Cards', val: gap2, unit: '/mo',
                  desc: gap2 > 0 ? `${fmt(gap2 * 12)}/yr available with better market cards` : "You're maximizing the market ✓" },
              ].map(g => (
                <div key={g.cls} className={`gap-card ${g.cls}`}>
                  <div className="gap-number">{g.label}</div>
                  <div className="gap-title">{g.title}</div>
                  <div className={`gap-value ${g.val === 0 ? 'positive' : ''}`}>
                    {g.val === 0 ? '✓ $0' : `${fmt(g.val)}${g.unit}`}
                  </div>
                  <div className="gap-desc">{g.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Annual picture */}
          <div className="annual-summary" style={{ boxShadow: 'var(--shadow-md)', border: '1.5px solid var(--gray-200)' }}>
            {[
              { label: 'Annual Earnings', val: totalAnnualEarnings, cls: 'positive' },
              { label: 'Annual Fees', val: -totalAnnualFees, cls: totalAnnualFees > 0 ? '' : 'positive' },
              { label: 'Net / Year', val: totalAnnualEarnings - totalAnnualFees, cls: totalAnnualEarnings - totalAnnualFees >= 0 ? 'positive' : 'negative' },
              { label: 'Total Gaps / Year', val: (gap0 + gap1 + gap2) * 12, cls: 'negative' },
            ].map(s => (
              <div key={s.label} className="summary-stat">
                <div className="summary-stat-label">{s.label}</div>
                <div className={`summary-stat-value ${s.cls}`} style={{
                  color: s.cls === 'positive' ? 'var(--teal)' : s.cls === 'negative' ? 'var(--red)' : 'var(--gray-700)'
                }}>
                  {s.val < 0 ? '−' : ''}{fmt(Math.abs(s.val))}
                </div>
              </div>
            ))}
          </div>

          {/* Per-category breakdown */}
          <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid var(--gray-200)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: 24 }}>
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Monthly Spend</th>
                  <th>Annual Earnings</th>
                  <th>Best Owned Rate</th>
                  <th>Best Market Rate</th>
                  <th>Annual Opportunity</th>
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
                        {row.bestOwnedRate % 1 === 0 ? row.bestOwnedRate : row.bestOwnedRate.toFixed(1)}x — {row.bestOwnedCard?.name}
                      </span>
                    </td>
                    <td>
                      <span className="rate-badge market">
                        {row.bestMarketRate}x — {row.bestMarketCard?.name}
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
            <div className="ai-insight-header">
              ✨ AI Analysis
            </div>
            {!aiText && !aiLoading && !aiError && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>
                  Get a personalized insight based on your specific spend profile and gaps.
                </p>
                <button className="btn btn-primary" style={{ fontSize: 14 }} onClick={fetchAI}>
                  Get AI Analysis
                </button>
              </div>
            )}
            {aiLoading && (
              <div className="ai-insight-loading">
                <div className="spinner" /> Analyzing your spend profile…
              </div>
            )}
            {aiError && (
              <div style={{ color: 'var(--red)', fontSize: 13 }}>
                {aiError}
                <button className="btn btn-secondary" style={{ marginLeft: 12, fontSize: 12 }} onClick={fetchAI}>Retry</button>
              </div>
            )}
            {aiText && <div className="ai-insight-body">{aiText}</div>}
          </div>

          {/* Waitlist */}
          <div style={{ marginTop: 28, padding: '20px 24px', background: 'var(--purple-faint)', borderRadius: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--purple)', marginBottom: 6 }}>
              Get notified when Redeem Scanner launches
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>
              Find your best transfer partners and sweet spots based on your actual point balances.
            </div>
            {waitlistDone ? (
              <div style={{ color: 'var(--teal)', fontWeight: 600, fontSize: 14 }}>✓ You're on the list!</div>
            ) : (
              <div className="waitlist-wrap">
                <input className="waitlist-input" type="email" placeholder="your@email.com"
                  value={waitlistEmail} onChange={e => setWaitlistEmail(e.target.value)} />
                <button className="btn btn-primary" style={{ fontSize: 14 }} onClick={() => setWaitlistDone(true)}>
                  Notify me
                </button>
              </div>
            )}
          </div>

          {/* CTA to wallet optimizer */}
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
