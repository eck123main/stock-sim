# Stock Simulator

A full-featured, educational stock trading simulator built with Next.js, React, Supabase, and Recharts. This project provides a realistic environment for learning about stock trading, portfolio management, and financial analytics—without risking real money.

---

## Features

### 1. Real-Time Stock Trading Simulation

- **Buy/Sell Stocks:** Simulate buying and selling US equities using real-time price data (via Twelve Data API).
- **Limit Orders & Stop Loss:** Place advanced order types to automate your trading strategies.
- **Price Alerts:** Set custom price alerts and receive notifications when targets are hit.

### 2. Portfolio Management

- **Cash & Holdings:** Track your available cash, portfolio value, and individual stock holdings.
- **Trade History:** View a detailed log of all your trades, grouped by time period.
- **Watchlist:** Add stocks to your personal watchlist for quick access.

### 3. Analytics & Visualization

- **Performance Charts:** Visualize your portfolio value over time and see gains/losses by stock.
- **Portfolio Composition:** Pie chart breakdown of your holdings and cash.
- **Technical Indicators:** The backend includes calculation logic for SMA, RSI, MACD, and Bollinger Bands (extendable for future analytics).

### 4. AI Stock Advisor

- **Conversational AI:** Ask questions about your portfolio, market trends, or investing concepts. Powered by Anthropic Claude/OpenAI (configurable).
- **Educational Focus:** All advice is for learning purposes only.

### 5. User Experience

- **Modern UI:** Clean, responsive design with light/dark mode.
- **Notifications:** Get notified about price alerts, order executions, and more.
- **Deposit Funds:** Add virtual cash to your account to keep learning and experimenting.

---

## Core Concepts & Architecture

### Stock Market Simulation

- **Order Matching:** Simulates real-world order types (market, limit, stop-loss) and their execution logic.
- **Price Feeds:** Uses the Twelve Data API for up-to-date stock prices.
- **Portfolio Snapshots:** Tracks your portfolio value over time for analytics and backtesting.

### Financial Analytics

- **Technical Indicators:**
  - **SMA (Simple Moving Average):** Smooths price data to identify trends.
  - **RSI (Relative Strength Index):** Measures momentum and overbought/oversold conditions.
  - **MACD (Moving Average Convergence Divergence):** Detects trend changes and momentum.
  - **Bollinger Bands:** Visualizes price volatility.
- **Performance Metrics:** Calculates realized/unrealized P&L, win rate, and more.

### Backend & Data

- **Supabase:**
  - Auth: User authentication and session management.
  - Database: Stores portfolios, trades, orders, alerts, and notifications.
- **API Routes:**
  - Custom Next.js API endpoints for advisor chat, alert checking, and more.

### Frontend

- **Next.js App Router:** Modern, file-based routing and server-side rendering.
- **React State Management:** Uses hooks for local and global state.
- **Recharts:** For all charting and data visualization needs.

---

## Installation & Setup

### 1. Prerequisites

- **Node.js** (v18+ recommended)
- **npm** (v9+) or **yarn** or **pnpm**
- **Supabase Account:** [Sign up](https://supabase.com/) and create a new project.
- **Twelve Data API Key:** [Get a free API key](https://twelvedata.com/).

### 2. Clone the Repository

```bash
git clone https://github.com/yourusername/stock-simulator.git
cd stock-simulator
```

### 3. Install Dependencies

```bash
npm install
# or
yarn install
```

### 4. Configure Environment Variables

Create a `.env.local` file in the root directory with the following:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_TWELVE_DATA_KEY=your-twelvedata-api-key
```

### 5. Run the Development Server

```bash
npm run dev
# or
yarn dev
```

Visit [http://localhost:3000](http://localhost:3000) to use the app.

---

## Project Structure

- `app/` — Next.js app directory (pages, layouts, API routes)
- `components/` — Reusable React components (charts, UI)
- `lib/` — Utility libraries (indicators, stocks API, Supabase client)
- `public/` — Static assets
- `package.json` — Project metadata and scripts

---

## Extending & Customizing

- **Add More Indicators:** Extend `lib/indicators.ts` for new analytics.
- **Integrate More Data Sources:** Swap out or add APIs in `lib/stocks.js`.
- **UI Customization:** Tweak styles in `app/` and `components/` for your brand.
- **AI Advisor:** Configure or swap the AI provider in the advisor API route.

---

## License

This project is for educational and demonstration purposes only. No real trading or financial advice is provided.

---
