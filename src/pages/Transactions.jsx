import { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { analyzeTransactions, projectSpend } from '../utils/plaidCategories';
import { fmt } from '../utils/calculations';

const API = 'http://localhost:3001';
const CAT_ICONS = { dining: '🍽️', groceries: '🛒', travel: '✈️', gas: '⛽', shopping: '🛍️', subscriptions: '📱', entertainment: '🎬', other: '💳' };
const CAT_ORDER = ['dining', 'groceries', 'travel', 'gas', 'shopping', 'subscriptions', 'entertainment', 'other'];

// ── Plaid Link wrapper ────────────────────────────────────────────────────────
function PlaidConnectButton({ onSuccess, disabled }) {
  const [linkToken, setLinkToken] = useState(null);
  const [tokenError, setTokenError] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/create_link_token`, { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d.error) setTokenError(d.error);
        else setLinkToken(d.link_token);
      })
      .catch(() => setTokenError('Could not reach API server. Is it running on port 3001?'));
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken) => {
      await fetch(`${API}/api/exchange_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token: publicToken }),
      });
      onSuccess();
    },
  });

  if (tokenError) return (
    <div className="plaid-error">
      <strong>Cannot reach API server</strong>
      <p>{tokenError}</p>
      <code>npm run dev:server</code>
    </div>
  );

  return (
    <button
      className="btn btn-primary"
      onClick={() => open()}
      disabled={!ready || disabled}
      style={{ opacity: ready ? 1 : 0.5 }}
    >
      {ready ? 'Connect with Plaid →' : 'Loading…'}
    </button>
  );
}

// ── Date range picker ─────────────────────────────────────────────────────────
function dateNMonthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}
function today() { return new Date().toISOString().slice(0, 10); }

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Transactions() {
  const { dispatch } = useApp();
  const navigate = useNavigate();

  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [startDate, setStartDate] = useState(dateNMonthsAgo(6));
  const [endDate, setEndDate] = useState(today());

  const [analysis, setAnalysis] = useState(null); // { byCategory, byMonth, transactions }
  const [projection, setProjection] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState(new Set(CAT_ORDER));
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'monthly' | 'txns'
  const [txnFilter, setTxnFilter] = useState('');

  // Check connection status on mount
  useEffect(() => {
    fetch(`${API}/api/status`)
      .then(r => r.json())
      .then(d => setConnected(d.connected))
      .catch(() => {});
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/transactions?start_date=${startDate}&end_date=${endDate}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);

      const result = analyzeTransactions(d.transactions);
      const startMs = new Date(startDate).getTime();
      const endMs   = new Date(endDate).getTime();
      const monthsOfData = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24 * 30.44));
      const proj = projectSpend(result.byCategory, monthsOfData);

      setAnalysis(result);
      setProjection(proj);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Auto-fetch when connected
  useEffect(() => {
    if (connected) fetchTransactions();
  }, [connected]); // eslint-disable-line

  const disconnect = async () => {
    await fetch(`${API}/api/disconnect`, { method: 'POST' });
    setConnected(false);
    setAnalysis(null);
    setProjection(null);
  };

  // Push monthly averages into AppContext spend and navigate to wallet
  const applyToWallet = () => {
    if (!projection) return;
    const spend = {};
    for (const cat of CAT_ORDER) {
      const avg = projection.monthlyAvg[cat] || 0;
      // only include selected categories
      spend[cat] = selectedCategories.has(cat) ? String(Math.round(avg)) : '';
    }
    dispatch({ type: 'SET_SPEND', payload: spend });
    navigate('/wallet');
  };

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!connected) {
    return (
      <div className="page-container" style={{ maxWidth: 560 }}>
        <div className="plaid-connect-card">
          <div className="plaid-connect-icon">🏦</div>
          <h2>Connect your accounts</h2>
          <p>
            Import real transaction history to see exactly how you spend — then let PointsMax
            project the rest of your year and find the card combo that fits your actual habits.
          </p>
          <div className="plaid-sandbox-note">
            <strong>Sandbox mode</strong> — use test credentials:<br />
            Username: <code>user_good</code> &nbsp; Password: <code>pass_good</code>
          </div>
          <PlaidConnectButton onSuccess={() => { setConnected(true); }} />
          <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 14 }}>
            Your data never leaves your machine. The API server runs locally at localhost:3001.
          </p>
        </div>
      </div>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  const months = analysis
    ? Object.keys(analysis.byMonth).sort()
    : [];

  const filteredTxns = analysis
    ? analysis.transactions.filter(t =>
        selectedCategories.has(t.ourCategory) &&
        (!txnFilter || t.name?.toLowerCase().includes(txnFilter.toLowerCase()))
      )
    : [];

  const totalSpend = analysis
    ? CAT_ORDER.filter(c => selectedCategories.has(c))
        .reduce((s, c) => s + (analysis.byCategory[c] || 0), 0)
    : 0;

  return (
    <div className="page-container" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div className="plaid-page-header">
        <div>
          <h2 style={{ margin: 0 }}>Transaction History</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--gray-500)', fontSize: 14 }}>
            Imported from Plaid sandbox
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="plaid-connected-badge">● Connected</div>
          <button className="btn btn-outline" style={{ fontSize: 13, padding: '6px 14px' }}
            onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </div>

      {/* Date range + fetch */}
      <div className="plaid-date-bar">
        <label>From
          <input type="date" value={startDate} max={endDate}
            onChange={e => setStartDate(e.target.value)} />
        </label>
        <label>To
          <input type="date" value={endDate} min={startDate} max={today()}
            onChange={e => setEndDate(e.target.value)} />
        </label>
        <button className="btn btn-secondary" onClick={fetchTransactions} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="plaid-error">{error}</div>}

      {analysis && projection && (
        <>
          {/* Summary row */}
          <div className="plaid-summary-row">
            <div className="plaid-summary-stat">
              <div className="plaid-summary-label">Total spend</div>
              <div className="plaid-summary-value">{fmt(totalSpend)}</div>
              <div className="plaid-summary-sub">{startDate} → {endDate}</div>
            </div>
            <div className="plaid-summary-stat">
              <div className="plaid-summary-label">Monthly avg</div>
              <div className="plaid-summary-value">
                {fmt(CAT_ORDER.filter(c => selectedCategories.has(c)).reduce((s, c) => s + (projection.monthlyAvg[c] || 0), 0))}
              </div>
              <div className="plaid-summary-sub">across {months.length} months</div>
            </div>
            <div className="plaid-summary-stat">
              <div className="plaid-summary-label">Projected remaining</div>
              <div className="plaid-summary-value">
                {fmt(CAT_ORDER.filter(c => selectedCategories.has(c)).reduce((s, c) => s + (projection.projectedRemaining[c] || 0), 0))}
              </div>
              <div className="plaid-summary-sub">{projection.monthsRemaining} mo. left in {new Date().getFullYear()}</div>
            </div>
            <div className="plaid-summary-stat">
              <div className="plaid-summary-label">Transactions</div>
              <div className="plaid-summary-value">{analysis.transactions.length}</div>
              <div className="plaid-summary-sub">after filtering</div>
            </div>
          </div>

          {/* Apply to wallet CTA */}
          <div className="plaid-apply-bar">
            <div>
              <strong>Use this data in Wallet Optimizer</strong>
              <p>Applies your monthly averages as spend inputs so you can find the best card combo.</p>
            </div>
            <button className="btn btn-primary" onClick={applyToWallet}>
              Apply to Wallet Optimizer →
            </button>
          </div>

          {/* Category filter chips */}
          <div className="plaid-cat-chips">
            {CAT_ORDER.map(cat => (
              <button
                key={cat}
                className={`plaid-cat-chip ${selectedCategories.has(cat) ? 'active' : ''}`}
                onClick={() => {
                  const next = new Set(selectedCategories);
                  if (next.has(cat)) next.delete(cat);
                  else next.add(cat);
                  setSelectedCategories(next);
                }}
              >
                {CAT_ICONS[cat]} {cat.charAt(0).toUpperCase() + cat.slice(1)}
                <span className="chip-amount">{fmt(analysis.byCategory[cat] || 0)}</span>
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="plaid-tabs">
            {[['summary', 'Category Summary'], ['monthly', 'Month by Month'], ['txns', 'Transactions']].map(([id, label]) => (
              <button key={id}
                className={`plaid-tab ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {/* Tab: Category Summary */}
          {activeTab === 'summary' && (
            <div className="plaid-summary-table">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Total spent</th>
                    <th>Monthly avg</th>
                    <th>Projected annual</th>
                    <th>Remaining this yr</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {CAT_ORDER.filter(c => selectedCategories.has(c) && (analysis.byCategory[c] || 0) > 0).map(cat => {
                    const total = analysis.byCategory[cat] || 0;
                    const maxTotal = Math.max(...CAT_ORDER.map(c => analysis.byCategory[c] || 0));
                    const pct = (total / maxTotal) * 100;
                    return (
                      <tr key={cat}>
                        <td>
                          <span className="plaid-cat-icon">{CAT_ICONS[cat]}</span>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </td>
                        <td>
                          <div className="plaid-spend-cell">
                            <span>{fmt(total)}</span>
                            <div className="plaid-spend-bar">
                              <div className="plaid-spend-fill" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{fmt(projection.monthlyAvg[cat] || 0)}</td>
                        <td>{fmt(projection.projectedAnnual[cat] || 0)}</td>
                        <td style={{ color: 'var(--color-primary)' }}>{fmt(projection.projectedRemaining[cat] || 0)}</td>
                        <td>
                          <Link
                            to="/wallet"
                            onClick={() => {
                              const spend = {};
                              for (const c of CAT_ORDER) {
                                spend[c] = selectedCategories.has(c)
                                  ? String(Math.round(projection.monthlyAvg[c] || 0))
                                  : '';
                              }
                              dispatch({ type: 'SET_SPEND', payload: spend });
                            }}
                            className="plaid-optimize-link"
                          >
                            Optimize →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: Month by Month */}
          {activeTab === 'monthly' && (
            <div className="plaid-monthly-table">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    {CAT_ORDER.filter(c => selectedCategories.has(c)).map(c => (
                      <th key={c}>{CAT_ICONS[c]}</th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map(m => {
                    const row = analysis.byMonth[m] || {};
                    const rowTotal = CAT_ORDER.filter(c => selectedCategories.has(c))
                      .reduce((s, c) => s + (row[c] || 0), 0);
                    return (
                      <tr key={m}>
                        <td style={{ fontWeight: 600, color: 'var(--gray-600)' }}>{m}</td>
                        {CAT_ORDER.filter(c => selectedCategories.has(c)).map(c => (
                          <td key={c} style={{ color: (row[c] || 0) > 0 ? 'var(--gray-700)' : 'var(--gray-300)' }}>
                            {(row[c] || 0) > 0 ? fmt(row[c]) : '—'}
                          </td>
                        ))}
                        <td style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(rowTotal)}</td>
                      </tr>
                    );
                  })}
                  {/* Avg row */}
                  <tr className="plaid-avg-row">
                    <td>Monthly avg</td>
                    {CAT_ORDER.filter(c => selectedCategories.has(c)).map(c => (
                      <td key={c} style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                        {fmt(projection.monthlyAvg[c] || 0)}
                      </td>
                    ))}
                    <td style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                      {fmt(CAT_ORDER.filter(c => selectedCategories.has(c)).reduce((s, c) => s + (projection.monthlyAvg[c] || 0), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: Transactions */}
          {activeTab === 'txns' && (
            <div>
              <div className="plaid-txn-search">
                <input
                  type="text"
                  placeholder="Search transactions…"
                  value={txnFilter}
                  onChange={e => setTxnFilter(e.target.value)}
                />
                <span style={{ color: 'var(--gray-400)', fontSize: 13 }}>
                  {filteredTxns.length} transactions
                </span>
              </div>
              <div className="plaid-txn-list">
                {filteredTxns.slice(0, 200).map((t, i) => (
                  <div key={i} className="plaid-txn-row">
                    <span className="plaid-txn-icon">{CAT_ICONS[t.ourCategory]}</span>
                    <div className="plaid-txn-info">
                      <div className="plaid-txn-name">{t.name}</div>
                      <div className="plaid-txn-meta">
                        {t.date} · {t.ourCategory}
                        {t.personal_finance_category?.primary && (
                          <span className="plaid-txn-plaid-cat">
                            {' '}· {t.personal_finance_category.primary.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="plaid-txn-amount">{fmt(t.amount)}</div>
                  </div>
                ))}
                {filteredTxns.length > 200 && (
                  <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 12, fontSize: 13 }}>
                    Showing first 200 of {filteredTxns.length} transactions
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
