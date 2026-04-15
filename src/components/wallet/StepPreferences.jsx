import { useState, useEffect } from 'react';
import { CARDS, STATEMENT_CREDITS, REDEMPTION_STYLES } from '../../data/cards';
import { REDEEM_ICONS } from './walletUtils';

// Cards that earn transferable points (not cashback).
// Chase UR cards (CFU, CF) are excluded — they need CSR/CSP to transfer,
// and those are listed directly here.
const TRANSFER_ELIGIBLE_IDS = new Set(['csr', 'csp', 'amex_gold', 'amex_plat', 'cdc', 'co_venture']);

export default function StepPreferences({ local, setLocal, onNext, onBack }) {
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

  const mainStyles = REDEMPTION_STYLES.filter(s => s.id === 'cashout' || s.id === 'portal');
  const advStyles  = REDEMPTION_STYLES.filter(s => s.id === 'transfer' || s.id === 'expert');

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
