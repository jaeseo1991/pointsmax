import { useState } from 'react';

export default function RedeemScanner() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  return (
    <div className="page-container">
      <div className="coming-soon">
        <div style={{ fontSize: 56, marginBottom: 16 }}>🗺️</div>
        <h2>Redeem Scanner</h2>
        <p>
          Enter your points balances and travel goal to find your best
          redemption — sweet spots, transfer partners, and exact booking
          paths ranked by value per point.
        </p>
        {done ? (
          <div style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 16 }}>✓ You're on the list!</div>
        ) : (
          <div className="waitlist-wrap" style={{ justifyContent: 'center', maxWidth: 380, margin: '0 auto' }}>
            <input
              className="waitlist-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <button className="btn btn-primary" onClick={() => email && setDone(true)}>
              Notify me
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
