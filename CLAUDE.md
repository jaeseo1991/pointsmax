# PointsMax — Project Brief

## What it is
A credit card rewards optimizer. Users input their cards and monthly spend; the app tells them what they're earning, what they're missing, and what wallet would maximize their rewards.

## Tech stack
- Vite + React (JSX, no TypeScript)
- React Router v6 (`BrowserRouter`)
- Global state: `AppContext` (`useReducer`) — no Redux, no Zustand
- Styles: single `src/styles/global.css` with CSS variables — no CSS modules, no Tailwind
- Backend: Express at `http://localhost:3001` (Plaid integration)
- AI: Anthropic API called directly from browser (`VITE_ANTHROPIC_API_KEY`)

## Routes
| Path | Page | File |
|------|------|------|
| `/` | Landing | `src/pages/Landing.jsx` |
| `/earn` | Earn Analyzer | `src/pages/EarnAnalyzer.jsx` |
| `/wallet` | Wallet Optimizer | `src/pages/WalletOptimizer.jsx` |
| `/redeem` | Redeem Scanner | `src/pages/RedeemScanner.jsx` |
| `/transactions` | Transactions | `src/pages/Transactions.jsx` |

## AppContext state shape
```js
{
  spend: { dining, groceries, travel, gas, shopping, subscriptions, entertainment, other }, // strings
  ownedCards: [],           // array of card IDs (strings)
  cards24months: 0,
  amexCount: 0,
  heldCards: [],
  selectedCredits: {},      // { cardId: [creditId, ...] }
  redeemStyle: 'portal',    // 'portal' | 'transfer' | 'cashback'
  categoryEntries: {},      // { category: [{ cardId, amount }, ...] }
  activationStatus: {},     // { cardId: boolean }
}
```
Actions: `SET_SPEND`, `SET_OWNED_CARDS`, `SET_ELIGIBILITY`, `SET_CREDITS`, `SET_REDEEM_STYLE`, `SET_CATEGORY_ENTRIES`, `TOGGLE_ACTIVATION`, `SET_ACTIVATION`, `RESET`

## Key data — `src/data/cards.js`
- `CARDS` — array of card objects. Each has: `id`, `name`, `issuer`, `annualFee`, `rewards` (object of category → multiplier), `rotating` (optional, for quarterly bonus cards)
- `CATEGORIES` — array of `{ id, label }`. IDs: `dining`, `groceries`, `travel`, `gas`, `shopping`, `subscriptions`, `entertainment`, `other`
- `REDEMPTION_STYLES` — array of `{ id, label, valuations }` where valuations is `{ issuer: centsPerPoint }`

## Key utilities — `src/utils/calculations.js`
- `getEffectiveRate(card, categoryId, activationStatus, spendAmount)` → multiplier
- `calculateGap0(categoryEntries, activationStatus, redeemStyle)` → monthly $ lost to unactivated rotating bonuses
- `calculateGap1(categoryEntries, ownedCards, activationStatus, redeemStyle)` → monthly $ lost to suboptimal card routing
- `fmt(dollars)` → formatted string like "$12.40"

## Key utilities — `src/utils/plaidCategories.js`
- `analyzeTransactionsByCard(transactions, accountMapping)` → `{ byCardCategory }`
- `analyzeTransactions(transactions)` → `{ byCategory }`
- `projectSpend(byCategory, months)` → `{ monthlyAvg }`

## Component structure
```
src/
  App.jsx                        # Router + AppProvider wrapper
  components/
    NavBar.jsx
    earn/
      AccountMatcher.jsx         # Plaid account → card ID mapping UI
      ActivationBanner.jsx       # Quarterly bonus activation toggle
      CategoryRows.jsx           # EntryBadge + EditableCategoryRow + CategoryRow
  context/
    AppContext.jsx
  data/
    cards.js
  pages/
    EarnAnalyzer.jsx             # /earn — spend analysis + gap breakdown
    WalletOptimizer.jsx          # /wallet — card recommendation wizard (LARGE: ~1800 lines, split when touching)
    Transactions.jsx             # /transactions — Plaid transaction viewer
    Landing.jsx
    RedeemScanner.jsx
  styles/
    global.css                   # All styles — CSS variables at :root
  utils/
    calculations.js
    plaidCategories.js
```

## Plaid integration
- Backend server: `http://localhost:3001`
- Key endpoints: `GET /api/status`, `GET /api/accounts`, `GET /api/transactions?start_date=&end_date=`
- Account→card mapping persisted in `localStorage` under key `pointsmax_account_map`

## Conventions
- CSS class names use kebab-case, prefixed by feature (e.g. `earn-section`, `gap-card`, `wallet-step`)
- No inline styles for layout — use CSS classes. Inline styles only for one-off values (colors, margins)
- Card name display shortening: `.replace('Chase ', '').replace('American Express ', 'Amex ').replace('Capital One ', '')`
- `fmt()` for all dollar display — never raw `.toFixed(2)`
- Components defined above the main page export, not in separate files unless they exceed ~150 lines

## Session tips
- Use `/compact` when the conversation gets long — it summarizes history and frees context
- Work one feature/page at a time per session
- `WalletOptimizer.jsx` needs to be split into sub-components — do this in a dedicated session
