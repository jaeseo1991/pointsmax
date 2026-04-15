import { CARDS, CATEGORIES, REDEMPTION_STYLES } from '../../data/cards';
import { getEffectiveRate, fmt } from '../../utils/calculations';
import { newAppsNeeded, MAX_NEW_APPS, formatRawBonus } from './walletUtils';

export default function RecommendationBanner({ tiers, displayTierIds, ownedCards, heldCards = [], totalMonthlySpend, spend, redeemStyle, onViewDetails }) {
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
