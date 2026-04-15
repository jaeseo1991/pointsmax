import { useState } from 'react';
import { CARDS, CATEGORIES, STATEMENT_CREDITS, REDEMPTION_STYLES } from '../../data/cards';
import { calculateEffectiveFee, getEffectiveRate, fmt } from '../../utils/calculations';
import { formatRawBonus } from './walletUtils';

export default function TierCard({ tier, initialCredits, isCurrent, isBest, isOutOfReach, tooManyApps, isExpanded, onToggleExpand, tierCardRef, ownedCards, heldCards, activationStatus, spend, redeemStyle, baseline, newCardIds, totalMonthlySpend }) {
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
      const cardBaseline = Math.min(...Object.values(card.rates));
      if (cardBaseline > bestBaseline) bestBaseline = cardBaseline;
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
