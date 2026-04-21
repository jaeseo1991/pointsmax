import { useState } from 'react';
import { CARDS } from '../../data/cards';

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

export function autoMatch(name = '', officialName = '') {
  const h = `${name} ${officialName}`.toLowerCase();
  for (const { id, keywords } of CARD_NAME_PATTERNS) {
    if (keywords.some(kw => h.includes(kw))) return id;
  }
  return null;
}

export default function AccountMatcher({ accounts, initialMapping, onSave }) {
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
