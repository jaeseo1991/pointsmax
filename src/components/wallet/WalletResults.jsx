import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CARDS, CATEGORIES, STATEMENT_CREDITS, REDEMPTION_STYLES } from '../../data/cards';
import { calculateWalletEarnings, calculateEffectiveFee, fmt } from '../../utils/calculations';
import { REDEEM_ICONS } from './walletUtils';
import RecommendationBanner from './RecommendationBanner';
import TierCard from './TierCard';

// Chase UR unlockers — adding CSR/CSP auto-includes CFU in custom builder
const CHASE_UR_UNLOCKERS_UI = new Set(['csr', 'csp']);

// Extra gain over best single-card option that a multi-card combo must produce
// per dollar of effective new annual fees introduced. At 1.0, the extra gain
// must fully cover the new effective fees (on top of them already being netted).
const MULTI_CARD_FEE_RATIO = 1.0;

// ─── Module-level helpers ─────────────────────────────────────────────────────

function getCombinations(arr, k) {
  if (k === 1) return arr.map(x => [x]);
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of getCombinations(arr.slice(i + 1), k - 1)) {
      result.push([arr[i], ...rest]);
    }
  }
  return result;
}

const shortName = name =>
  name.replace('Chase ', '').replace('American Express ', 'Amex ').replace('Capital One ', '');

// For owned cards: use user's selectedCredits. For new cards: auto-apply easy credits.
function creditsForCards(cardList, ownedCards, selectedCredits) {
  const merged = { ...selectedCredits };
  for (const id of cardList) {
    if (ownedCards.includes(id)) continue;
    const available = STATEMENT_CREDITS[id];
    if (available?.length) merged[id] = available.filter(c => c.autoApply).map(c => c.id);
  }
  return merged;
}

function computeWelcomeBonus(newCardIds, heldCards, spend, activationStatus, redeemStyle) {
  let wb = 0;
  for (const cardId of newCardIds) {
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
  return wb;
}

// ─── CustomComboBuilder ───────────────────────────────────────────────────────

function CustomComboBuilder({ spend, selectedCredits, redeemStyle, heldCards, activationStatus, currentTier }) {
  const [customCards, setCustomCards] = useState([]);
  const [autoAdded, setAutoAdded] = useState(new Set());

  const toggle = id => {
    setCustomCards(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id];

      if (!prev.includes(id) && CHASE_UR_UNLOCKERS_UI.has(id)) {
        if (!next.includes('cfu')) {
          setAutoAdded(a => new Set([...a, 'cfu']));
          return [...next, 'cfu'];
        }
      }

      if (prev.includes(id) && CHASE_UR_UNLOCKERS_UI.has(id)) {
        const remainingUnlockers = next.filter(c => CHASE_UR_UNLOCKERS_UI.has(c));
        if (remainingUnlockers.length === 0) {
          setAutoAdded(a => { const n = new Set(a); n.delete('cfu'); return n; });
          return next.filter(c => c !== 'cfu' || !autoAdded.has('cfu'));
        }
      }

      if (!prev.includes('cfu') && id === 'cfu') {
        setAutoAdded(a => { const n = new Set(a); n.delete('cfu'); return n; });
      }

      return next;
    });
  };

  const earnings    = customCards.length > 0 ? calculateWalletEarnings(customCards, spend, activationStatus, redeemStyle) : 0;
  const effectiveFee = customCards.reduce((s, id) => s + calculateEffectiveFee(id, selectedCredits), 0);
  const netPerYear  = earnings - effectiveFee;

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

// ─── WalletResults ────────────────────────────────────────────────────────────

export default function WalletResults({ local, onRestart, onGoToStep, plaidSource }) {
  const { spend, ownedCards, selectedCredits, redeemStyle, heldCards, activationStatus, cards24months, amexCount } = local;
  const [expandedTier, setExpandedTier] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const tierSectionRef = useRef(null);

  const totalMonthlySpend = Object.values(spend).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  // ── 1. Build baseline ──────────────────────────────────────────────────────
  // If user owns cards: their current wallet.
  // If not: dynamically find the best 1–3 card combo from $0-fee cards.
  let baselineCards = ownedCards;
  if (ownedCards.length === 0) {
    const freeIds = CARDS.filter(c => c.annualFee === 0).map(c => c.id);
    let bestNet = -Infinity;
    for (let size = 1; size <= 3; size++) {
      for (const combo of getCombinations(freeIds, size)) {
        const net = calculateWalletEarnings(combo, spend, {}, redeemStyle);
        if (net > bestNet) { bestNet = net; baselineCards = combo; }
      }
    }
  }

  const baselineCredits = creditsForCards(baselineCards, ownedCards, selectedCredits);
  const baselineEarnings = calculateWalletEarnings(baselineCards, spend, activationStatus, redeemStyle);
  const baselineEffectiveFee = baselineCards.reduce((s, id) => s + calculateEffectiveFee(id, baselineCredits), 0);
  const baselineTotalFee = baselineCards.reduce((s, id) => (CARDS.find(c => c.id === id)?.annualFee || 0) + s, 0);
  const baselineNetPerYear = baselineEarnings - baselineEffectiveFee;

  const baseline = {
    id: ownedCards.length > 0 ? 'current' : 'free',
    name: ownedCards.length > 0 ? 'Your Current Wallet' : 'Best Free Setup',
    description: ownedCards.length > 0 ? 'Your cards, best routing applied' : 'Best $0-fee cards for your spend',
    cards: baselineCards,
    earnings: baselineEarnings,
    totalFee: baselineTotalFee,
    effectiveFee: baselineEffectiveFee,
    netPerYear: baselineNetPerYear,
    welcomeBonus: 0,
    year1: baselineNetPerYear,
    newCards: [],
  };

  // ── 2. Generate all +1 and +2 card candidates ──────────────────────────────
  const over524 = cards24months >= 5;
  const amexFull = amexCount >= 5;

  const available = CARDS.filter(card => {
    if (ownedCards.includes(card.id)) return false;
    if (heldCards.includes(card.id)) return false;
    if (card.issuer === 'Chase' && over524) return false;
    if (card.issuer === 'Amex' && amexFull) return false;
    return true;
  });

  const buildCandidate = (newCardIds) => {
    const cards = [...ownedCards, ...newCardIds];
    const credits = creditsForCards(cards, ownedCards, selectedCredits);
    const earnings = calculateWalletEarnings(cards, spend, activationStatus, redeemStyle);
    const effectiveFee = cards.reduce((s, id) => s + calculateEffectiveFee(id, credits), 0);
    const totalFee = cards.reduce((s, id) => (CARDS.find(c => c.id === id)?.annualFee || 0) + s, 0);
    const netPerYear = earnings - effectiveFee;
    const gain = netPerYear - baselineNetPerYear;
    // Effective fees of the new cards only (used for multi-card threshold)
    const newEffectiveFee = newCardIds.reduce((s, id) => s + calculateEffectiveFee(id, credits), 0);
    const wb = computeWelcomeBonus(newCardIds, heldCards, spend, activationStatus, redeemStyle);
    const label = newCardIds.map(id => shortName(CARDS.find(c => c.id === id)?.name || id)).join(' + ');
    return {
      cards, newCards: newCardIds,
      earnings, totalFee, effectiveFee, netPerYear,
      welcomeBonus: wb, year1: netPerYear + wb,
      gain, newEffectiveFee,
      description: `Add ${label}`,
    };
  };

  const candidates = [];
  for (const card of available) {
    candidates.push(buildCandidate([card.id]));
  }
  for (let i = 0; i < available.length; i++) {
    for (let j = i + 1; j < available.length; j++) {
      candidates.push(buildCandidate([available[i].id, available[j].id]));
    }
  }

  // ── 3. Filter and rank ─────────────────────────────────────────────────────
  const withGain = candidates.filter(c => c.gain > 0);
  const bestSingleGain = Math.max(0, ...withGain.filter(c => c.newCards.length === 1).map(c => c.gain));

  const valid = withGain.filter(c => {
    if (c.newCards.length <= 1) return true;
    // Multi-card: extra gain over best single-card option must exceed
    // new effective fees × MULTI_CARD_FEE_RATIO
    const extraGain = c.gain - bestSingleGain;
    return extraGain > c.newEffectiveFee * MULTI_CARD_FEE_RATIO;
  });

  valid.sort((a, b) => b.gain - a.gain);

  // Pick top 2 with diversity — no shared new cards between options
  const displayOptions = [];
  for (const c of valid) {
    if (displayOptions.length >= 2) break;
    const usedCards = displayOptions.flatMap(o => o.newCards);
    if (c.newCards.some(id => usedCards.includes(id))) continue;
    displayOptions.push(c);
  }

  // ── 4. Assemble displayTiers ───────────────────────────────────────────────
  const displayTiers = [
    baseline,
    ...displayOptions.map((opt, i) => ({
      ...opt,
      id: `option_${i + 1}`,
      name: `Option ${i + 1}`,
    })),
  ];

  const bestTierId = displayOptions.length > 0 ? 'option_1' : null;
  const noBetterOption = displayOptions.length === 0;

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

      {/* 1. Recommendation banner */}
      <RecommendationBanner
        tiers={displayTiers}
        ownedCards={ownedCards}
        heldCards={heldCards}
        totalMonthlySpend={totalMonthlySpend}
        spend={spend}
        redeemStyle={redeemStyle}
        noBetterOption={noBetterOption}
        onViewDetails={() => {
          tierSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setExpandedTier(bestTierId);
        }}
      />

      {/* 2. Tier cards */}
      <div className="results-section" ref={tierSectionRef}>
        <h3 className="results-section-title">Wallet Options</h3>
        <div className="wallet-tiers">
          {displayTiers.map(tier => {
            const isCurrent = tier.id === 'current' || tier.id === 'free';
            const isBest = tier.id === bestTierId;
            const isExpanded = expandedTier === tier.id;
            const initialCredits = creditsForCards(tier.cards, ownedCards, selectedCredits);

            return (
              <TierCard
                key={tier.id}
                tier={tier}
                initialCredits={initialCredits}
                isCurrent={isCurrent}
                isBest={isBest}
                isOutOfReach={false}
                tooManyApps={false}
                isExpanded={isExpanded}
                onToggleExpand={() => setExpandedTier(isExpanded ? null : tier.id)}
                tierCardRef={null}
                ownedCards={ownedCards}
                heldCards={heldCards}
                activationStatus={activationStatus}
                spend={spend}
                redeemStyle={redeemStyle}
                baseline={baseline}
                newCardIds={tier.newCards || []}
                totalMonthlySpend={totalMonthlySpend}
              />
            );
          })}
        </div>
      </div>

      {/* 3. Custom combo builder */}
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
            currentTier={baseline}
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
