import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } from 'plaid';

const app = express();
const allowedOrigins = [
  /^http:\/\/localhost:\d+$/,
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];
app.use(cors({ origin: allowedOrigins }));
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`PointsMax API server running on http://localhost:${PORT}`));
