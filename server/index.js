import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } from 'plaid';

const app = express();
app.use(cors());
app.use(express.json());

// ── Plaid client ──────────────────────────────────────────────────────────────
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.VITE_PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.VITE_PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.VITE_PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);

// In-memory store for sandbox (single-user dev use)
let accessTokens = [];

// ── Routes ────────────────────────────────────────────────────────────────────

// 1. Create a Link token — frontend uses this to open the Plaid modal
app.post('/api/create_link_token', async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'pointsmax-dev-user' },
      client_name: 'PointsMax',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('create_link_token error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error_message || err.message });
  }
});

// 2. Exchange public_token → access_token (accumulate, don't overwrite)
app.post('/api/exchange_token', async (req, res) => {
  try {
    const { public_token } = req.body;
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const token = response.data.access_token;
    if (!accessTokens.includes(token)) accessTokens.push(token);
    res.json({ success: true, connected: accessTokens.length });
  } catch (err) {
    console.error('exchange_token error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error_message || err.message });
  }
});

// 3. Fetch transactions for a date range (merged across all connected accounts)
app.get('/api/transactions', async (req, res) => {
  if (accessTokens.length === 0) return res.status(400).json({ error: 'Not connected. Complete Plaid Link first.' });

  // Default: last 12 months
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);

  const startDate = (req.query.start_date || start.toISOString().slice(0, 10));
  const endDate   = (req.query.end_date   || end.toISOString().slice(0, 10));

  try {
    // Fetch from all connected tokens in parallel, then merge
    const allAdded = await Promise.all(accessTokens.map(async (token) => {
      let cursor = null;
      let added = [];
      let hasMore = true;
      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: token,
          cursor: cursor || undefined,
          count: 500,
        });
        added = added.concat(response.data.added);
        cursor = response.data.next_cursor;
        hasMore = response.data.has_more;
      }
      return added;
    }));

    const merged = allAdded.flat();

    // Filter to date range and exclude pending
    const filtered = merged.filter(t => {
      if (t.pending) return false;
      return t.date >= startDate && t.date <= endDate;
    });

    res.json({ transactions: filtered, total: filtered.length, sources: accessTokens.length });
  } catch (err) {
    console.error('transactions error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error_message || err.message });
  }
});

// 4. Fetch accounts (merged across all connected tokens)
app.get('/api/accounts', async (req, res) => {
  if (accessTokens.length === 0) return res.status(400).json({ error: 'Not connected.' });
  try {
    const allAccounts = await Promise.all(
      accessTokens.map(token => plaidClient.accountsGet({ access_token: token }).then(r => r.data.accounts))
    );
    res.json({ accounts: allAccounts.flat() });
  } catch (err) {
    console.error('accounts error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error_message || err.message });
  }
});

// 5. Connection status
app.get('/api/status', (req, res) => {
  res.json({ connected: accessTokens.length > 0, count: accessTokens.length });
});

// 6. Disconnect (clear all access tokens)
app.post('/api/disconnect', (req, res) => {
  accessTokens = [];
  res.json({ success: true });
});

// 7. Anthropic proxy — keeps API key off the client
app.post('/api/analyze', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.json({ text: data.content?.[0]?.text || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`PointsMax API server running on http://localhost:${PORT}`));
