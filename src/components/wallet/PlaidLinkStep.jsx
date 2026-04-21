import { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { analyzeTransactions, projectSpend } from '../../utils/plaidCategories';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Ordered most-specific first so "Sapphire Preferred" doesn't match "Sapphire Reserve"
const CARD_NAME_PATTERNS = [
  { id: 'csr',           keywords: ['sapphire reserve'] },
  { id: 'csp',           keywords: ['sapphire preferred'] },
  { id: 'cfu',           keywords: ['freedom unlimited'] },
  { id: 'cff',           keywords: ['freedom flex'] },
  { id: 'cf',            keywords: ['freedom'] },
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

function matchAccountToCard(name = '', officialName = '') {
  const haystack = `${name} ${officialName}`.toLowerCase();
  for (const { id, keywords } of CARD_NAME_PATTERNS) {
    if (keywords.some(kw => haystack.includes(kw))) return id;
  }
  return null;
}

function PlaidLinkButton({ onSuccess, label }) {
  const [linkToken, setLinkToken] = useState(null);
  const [tokenError, setTokenError] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/create_link_token`, { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d.error) setTokenError(d.error);
        else setLinkToken(d.link_token);
      })
      .catch(() => setTokenError('server_unavailable'));
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess: async (publicToken) => {
      await fetch(`${API}/api/exchange_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token: publicToken }),
      });
      onSuccess();
    },
  });

  if (tokenError) return null; // server not running — hide button, only show skip

  return (
    <button
      className="btn btn-primary"
      onClick={() => open()}
      disabled={!ready}
      style={{ opacity: ready ? 1 : 0.5, fontSize: 15, padding: '12px 28px' }}
    >
      {ready ? (label || '🔗 Connect bank account') : 'Loading…'}
    </button>
  );
}

export default function PlaidLinkStep({ onLinked, onSkip }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [connectedCount, setConnectedCount] = useState(0); // 0 = not connected

  // Check if Plaid is already connected on mount
  useEffect(() => {
    fetch(`${API}/api/status`)
      .then(r => r.json())
      .then(d => { if (d.connected) setConnectedCount(d.count || 1); })
      .catch(() => {});
  }, []);

  const fetchAndAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 3);
      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);

      // Fetch transactions and accounts in parallel
      const [txnRes, acctRes] = await Promise.all([
        fetch(`${API}/api/transactions?start_date=${startDate}&end_date=${endDate}`),
        fetch(`${API}/api/accounts`),
      ]);
      const txnData = await txnRes.json();
      const acctData = await acctRes.json();
      if (txnData.error) throw new Error(txnData.error);

      // Spend from transactions
      const analysis = analyzeTransactions(txnData.transactions);
      const { monthlyAvg } = projectSpend(analysis.byCategory, 3);
      const spend = {};
      for (const cat of ['dining', 'groceries', 'flights', 'travel', 'gas', 'shopping', 'subscriptions', 'entertainment', 'other']) {
        const val = Math.round(monthlyAvg[cat] || 0);
        spend[cat] = val > 0 ? String(val) : '';
      }

      // Detect owned cards from credit accounts
      const creditAccounts = (acctData.accounts || []).filter(a => a.type === 'credit');
      const detectedCards = creditAccounts
        .map(a => matchAccountToCard(a.name, a.official_name))
        .filter(Boolean)
        .filter((id, i, arr) => arr.indexOf(id) === i); // dedupe

      onLinked(spend, detectedCards);
    } catch (e) {
      setError('Could not analyze transactions. You can still enter spend manually.');
      setAnalyzing(false);
    }
  }, [onLinked]);

  const handleSuccess = useCallback(() => {
    setConnectedCount(c => c + 1);
    fetchAndAnalyze();
  }, [fetchAndAnalyze]);

  if (analyzing) {
    return (
      <div className="page-container narrow">
        <div className="step-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🔄</div>
          <h2 className="step-heading">Analyzing your transactions…</h2>
          <p className="step-subheading">We're reading 3 months of spending to pre-fill your profile.</p>
        </div>
      </div>
    );
  }

  // Already connected — show count, option to add more, or proceed
  if (connectedCount > 0) {
    return (
      <div className="page-container narrow">
        <div className="step-card" style={{ textAlign: 'center', padding: '40px 32px' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🏦</div>
          <h2 className="step-heading" style={{ marginBottom: 8 }}>
            {connectedCount === 1 ? '1 bank connected' : `${connectedCount} banks connected`}
          </h2>
          <p className="step-subheading" style={{ maxWidth: 400, margin: '0 auto 8px' }}>
            {connectedCount === 1
              ? 'Spend across multiple banks? Add another account for a complete picture.'
              : `Great — we'll merge transactions from all ${connectedCount} accounts for the most accurate spend breakdown.`}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 24 }}>
            <button
              className="btn btn-primary"
              onClick={fetchAndAnalyze}
              style={{ fontSize: 15, padding: '12px 28px' }}
            >
              Use my transaction data →
            </button>
            <PlaidLinkButton onSuccess={handleSuccess} label="+ Connect another bank" />
            {error && (
              <p style={{ fontSize: 13, color: 'var(--color-gap0)', margin: 0 }}>{error}</p>
            )}
            <button
              onClick={onSkip}
              style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline', marginTop: 4 }}
            >
              Skip, I'll enter manually →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container narrow">
      <div className="step-card" style={{ textAlign: 'center', padding: '40px 32px' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🏦</div>
        <h2 className="step-heading" style={{ marginBottom: 8 }}>Auto-fill from your banks</h2>
        <p className="step-subheading" style={{ maxWidth: 400, margin: '0 auto 28px' }}>
          Connect one or more bank accounts to automatically calculate your monthly spend by category. Add all the banks you use — we'll merge them.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <PlaidLinkButton onSuccess={handleSuccess} />
          {error && (
            <p style={{ fontSize: 13, color: 'var(--color-gap0)', margin: 0 }}>{error}</p>
          )}
          <button
            onClick={onSkip}
            style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline', marginTop: 4 }}
          >
            Skip, I'll enter manually →
          </button>
        </div>

        <div style={{ marginTop: 32, padding: '14px 20px', background: 'var(--gray-50)', borderRadius: 10, textAlign: 'left', maxWidth: 400, margin: '32px auto 0' }}>
          <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: 0, lineHeight: 1.6 }}>
            🔒 <strong>Secure read-only access.</strong> We only read transaction categories and amounts — never account numbers or credentials. Powered by Plaid.
          </p>
        </div>
      </div>
    </div>
  );
}
