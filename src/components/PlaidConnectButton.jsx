import { useState, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function PlaidConnectButton({ onSuccess, label = 'Connect with Plaid →', compact = false }) {
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
      className={compact ? 'btn btn-secondary plaid-btn-compact' : 'btn btn-primary'}
      onClick={() => open()}
      disabled={!ready}
      style={{ opacity: ready ? 1 : 0.5 }}
    >
      {ready ? label : 'Loading…'}
    </button>
  );
}
