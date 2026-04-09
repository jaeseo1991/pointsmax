import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CARDS, CATEGORIES, STATEMENT_CREDITS, REDEMPTION_STYLES, WALLET_TIERS } from '../data/cards';
import {
  calculateWalletEarnings,
  calculateEffectiveFee,
  calculateBreakeven,
  generateCumulativeData,
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
};
const REDEEM_ICONS = { cashout:'💵', portal:'🖥️', transfer:'🤝', expert:'🧠' };
const STEPS = ['Spending', 'Cards', 'Eligibility', 'Credits', 'Redemption'];

// ─── Step 1: Spend ────────────────────────────────────────────────────────────
function StepSpend({ local, setLocal, onNext }) {
  const spend = local.spend;
  const total = Object.values(spend).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  return (
    <>
      <h2 className="step-heading">Monthly Spending</h2>
      <p className="step-subheading">Enter your average monthly spend per category.</p>
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
      <div className="card-grid">
        {CARDS.map(card => (
          <button key={card.id} className={`card-option ${owned.includes(card.id) ? 'selected' : ''}`} onClick={() => toggle(card.id)}>
            <div className="card-check" />
            <div className="card-info">
              <div className="card-name">{card.name}</div>
              <div className="card-issuer">{card.issuer}</div>
              <div className="card-fee">{card.annualFee === 0 ? 'No annual fee' : `$${card.annualFee}/yr`}</div>
              <div className="card-rates">
                {(TOP_RATES[card.id] || []).map(r => (
                  <span key={r} className={`rate-chip ${/[4-9]x|10x/.test(r) ? 'highlight' : ''}`}>{r}</span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
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

  const isSelected = (cardId, creditId) => (selectedCredits[cardId] || []).includes(creditId);

  const totalCreditValue = Object.entries(selectedCredits).reduce((sum, [cardId, ids]) => {
    const credits = STATEMENT_CREDITS[cardId] || [];
    return sum + credits.filter(c => ids.includes(c.id)).reduce((s, c) => s + c.value, 0);
  }, 0);

  return (
    <>
      <h2 className="step-heading">Statement Credits</h2>
      <p className="step-subheading">Check credits you actually use — they reduce your effective annual fee.</p>
      {relevantCards.length === 0 ? (
        <div className="eligibility-note" style={{ marginBottom: 24 }}>None of your selected cards have statement credits. Click Next to continue.</div>
      ) : (
        relevantCards.map(card => (
          <div className="credits-section" key={card.id}>
            <div className="credits-card-header">
              <span className="credits-card-name">{card.name}</span>
              <span className="credits-fee-badge">${card.annualFee}/yr fee</span>
            </div>
            <div className="credits-list">
              {(STATEMENT_CREDITS[card.id] || []).map(credit => (
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
        ))
      )}
      {totalCreditValue > 0 && (
        <div className="credits-total">
          <span className="label">Total credits selected</span>
          <span className="value">−${totalCreditValue}/yr</span>
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

// ─── 5-Year SVG Chart ─────────────────────────────────────────────────────────
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
                      return card ? (
                        <span key={cid} className="wallet-card-pill">
                          {card.name.replace('Chase ', 'C. ').replace('Amex ', 'A. ')}
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
                  return card?.welcomeBonus?.spend > 0;
                }) && (
                  <div className="bonus-feasibility">
                    <div className="bonus-feasibility-title">Welcome Bonus Feasibility</div>
                    {tier.cards.map(cid => {
                      const card = CARDS.find(c => c.id === cid);
                      if (!card?.welcomeBonus) return null;
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

                      return (
                        <div key={cid} className="bonus-row">
                          <div className="bonus-row-top">
                            <span className="bonus-card-name">{card.name}</span>
                            <span className="bonus-amount">{bonusDisplay} bonus</span>
                            <span className={`bonus-badge ${f.tier}`}>{badgeLabels[f.tier]}</span>
                          </div>
                          {f.tier !== 'held' && f.tier !== 'match' && (
                            <div className="bonus-progress-wrap">
                              <div className="bonus-progress-bar">
                                <div className={`bonus-progress-fill ${f.tier}`} style={{ width: `${f.pct}%` }} />
                              </div>
                              <span className="bonus-progress-label">
                                {f.tier === 'easy'
                                  ? `Hits ${fmt(f.required)} in ~${Math.ceil(f.monthsNeeded)} mo ✓`
                                  : `Need ${fmt(f.required)} in ${f.window} mo — you spend ${fmt(totalMonthlySpend)}/mo`}
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
                      <div className="tier-chart-title">5-Year Cumulative Value vs. Free Wallet</div>
                      <FiveYearChart
                        freeData={chartData.free}
                        tierData={chartData.tier}
                        breakeven={chartData.breakeven}
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
function isComplete(s) {
  return Object.values(s.spend).some(v => parseFloat(v) > 0)
    && s.ownedCards.length > 0
    && !!s.redeemStyle;
}

export default function WalletOptimizer() {
  const { state, dispatch } = useApp();

  const [local, setLocal] = useState({
    spend: { ...state.spend },
    ownedCards: [...state.ownedCards],
    cards24months: state.cards24months,
    amexCount: state.amexCount,
    heldCards: [...state.heldCards],
    selectedCredits: { ...state.selectedCredits },
    redeemStyle: state.redeemStyle,
    categoryEntries: { ...state.categoryEntries },
    activationStatus: { ...state.activationStatus },
  });

  // Auto-show results if context already has completed data
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(() => isComplete(state));

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
          <div key={label} className={`progress-step ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`}>
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
