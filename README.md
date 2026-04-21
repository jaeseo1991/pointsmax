# PointsMax

A credit card rewards optimizer that helps you earn more points on every purchase.

## What It Does

PointsMax analyzes your monthly spending and credit card wallet to show you:

- **Earn Analyzer** — How much you're earning per category and where you're leaving money on the table
- **Wallet Optimizer** — Which cards you should get based on your actual spending habits
- **Redeem Scanner** — The best way to redeem your points based on your travel/cashback style
- **Transactions** — Connect your bank via Plaid to analyze real spending data automatically

## Tech Stack

- **Frontend:** React + Vite, React Router v6, plain CSS with CSS variables
- **Backend:** Node.js + Express (Plaid integration)
- **AI:** Anthropic Claude API for personalized recommendations
- **Data:** Plaid API for real transaction data

## Features

- Input your cards and monthly spend to instantly see reward gaps
- Detects money lost to unactivated rotating bonus categories (e.g. Chase Freedom Flex, Discover it)
- Recommends the optimal card to use per spending category
- Supports multiple redemption styles: travel portal, transfer partners, or cashback
- Plaid integration to auto-import transactions and map them to your cards

## Getting Started

```bash
# Install dependencies
npm install

# Start the backend server (Plaid integration)
node server/index.js

# Start the frontend
npm run dev
```

Requires a `.env` file with:
```
VITE_ANTHROPIC_API_KEY=your_key
PLAID_CLIENT_ID=your_id
PLAID_SECRET=your_secret
```

## Live Demo

> Add your deployed URL here (e.g. Vercel link)
