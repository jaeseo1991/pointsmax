import { useState } from 'react';
import { CARDS } from '../../data/cards';

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

// Ordered most-specific first so "Sapphire Preferred" doesn't match "Sapphire Reserve"
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

export default function StepCards({ local, setLocal, onNext, onBack, plaidDetectedCards = [] }) {
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
