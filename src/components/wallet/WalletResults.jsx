import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CARDS, CATEGORIES, WALLET_TIERS, STATEMENT_CREDITS, REDEMPTION_STYLES } from '../../data/cards';
import { calculateWalletEarnings, calculateEffectiveFee, fmt } from '../../utils/calculations';
import { newAppsNeeded, MAX_NEW_APPS, REDEEM_ICONS } from './walletUtils';
import RecommendationBanner from './RecommendationBanner';
import TierCard from './TierCard';

// Chase UR unlockers — adding CSR/CSP auto-includes CFU in custom builder
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

export default function WalletResults({ local, onRestart, onGoToStep, plaidSource }) {
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
