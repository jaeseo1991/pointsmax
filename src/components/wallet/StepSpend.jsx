import { Link } from 'react-router-dom';
import { CATEGORIES } from '../../data/cards';
import { fmt } from '../../utils/calculations';
import { CAT_ICONS } from './walletUtils';

const SPEND_PRESETS = [
  {
    id: 'average',
    label: 'Average American',
    icon: '🇺🇸',
    spend: { dining: 350, groceries: 450, travel: 150, gas: 200, shopping: 250, subscriptions: 50, entertainment: 100, other: 100 },
  },
  {
    id: 'city',
    label: 'City Renter',
    icon: '🏙️',
    spend: { dining: 600, groceries: 300, travel: 300, gas: 30, shopping: 300, subscriptions: 80, entertainment: 200, other: 100 },
  },
  {
    id: 'traveler',
    label: 'Frequent Traveler',
    icon: '✈️',
    spend: { dining: 400, groceries: 200, travel: 800, gas: 100, shopping: 200, subscriptions: 60, entertainment: 100, other: 100 },
  },
  {
    id: 'family',
    label: 'Family',
    icon: '👨‍👩‍👧',
    spend: { dining: 300, groceries: 800, travel: 200, gas: 300, shopping: 400, subscriptions: 100, entertainment: 150, other: 200 },
  },
];

export default function StepSpend({ local, setLocal, onNext, plaidSource, onConnectBank }) {
  const spend = local.spend;
  const total = Object.values(spend).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const applyPreset = (preset) => {
    const s = {};
    for (const cat of Object.keys(spend)) s[cat] = String(preset.spend[cat] || 0);
    setLocal(l => ({ ...l, spend: s }));
  };
  return (
    <>
      <h2 className="step-heading">Monthly Spending</h2>
      <p className="step-subheading">Enter your average monthly spend, or start with a profile.</p>
      {plaidSource && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--color-success-light)', border: '1px solid var(--color-success)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--color-success)' }}>
          <span>✅ <strong>Pre-filled from your bank transactions</strong> — review and adjust as needed.</span>
          <Link to="/transactions" style={{ color: 'var(--color-success)', whiteSpace: 'nowrap', textDecoration: 'underline', fontSize: 12 }}>
            See what we read →
          </Link>
        </div>
      )}
      <div className="spend-presets">
        {SPEND_PRESETS.map(p => (
          <button key={p.id} className="spend-preset-btn" onClick={() => applyPreset(p)}>
            <span className="preset-icon">{p.icon}</span>
            <span className="preset-label">{p.label}</span>
          </button>
        ))}
      </div>
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
      {total === 0 && (
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 12, textAlign: 'center' }}>
          Enter at least one spending category to continue.
        </p>
      )}
      <div className="wizard-nav">
        <button
          onClick={onConnectBank}
          style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          ← Connect bank instead
        </button>
        <button className="btn btn-primary" onClick={onNext} disabled={total === 0}
          style={{ opacity: total === 0 ? 0.4 : 1, cursor: total === 0 ? 'not-allowed' : 'pointer' }}>
          Next: Pick Cards →</button>
      </div>
    </>
  );
}
