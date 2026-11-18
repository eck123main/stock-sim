# Overnight Report

## Round 1 — 2026-11-18 (branch `claude/overnight-20261118-1054`)

### What the project is
A Next.js 16 + Supabase paper-trading app. Users buy/sell US stocks with
virtual cash at prices from the Twelve Data `/price` endpoint. It supports
limit buy, limit sell and stop-loss orders, price alerts, a watchlist,
portfolio snapshots, analytics charts and an LLM "advisor" (Groq / Llama, not
Claude as the README says). Nearly all logic was inline in
`app/dashboard/page.tsx` (~2500 lines) with no tests.

### What I changed and why
1. **Technical indicators (`lib/indicators.ts`)**
   - The MACD signal line was an EMA over the *filtered* MACD array, so
     `signal[i]` was about 25 bars out of step with `macd[i]`, and crossover
     signals were wrong. It is now aligned.
   - The RSI loop used `changes[i]` where it should have used
     `changes[i-1]` (off by one). That also made the last RSI value `NaN`.
     Flat prices gave `NaN` too. Fixed, and the zero-gain and zero-loss
     cases are now handled explicitly.
   - `components/StockDetailChart.tsx` imported `../../lib/indicators`, which
     points outside the repo. Fixed the path.
2. **New pure modules** that hold the logic so it can be tested:
   - `lib/portfolio.ts`
     - `computeHolding` uses a **share-weighted average cost**. The
       dashboard used the plain mean of lot prices: buying $1000 at $100 and
       then $100 at $200 showed an average of $150 instead of $104.76, so
       every P&L figure on scaled-in positions was wrong.
     - `planOrderExecutions` carries cash and positions through each pass
       in order. Previously:
       - each fill started from the same stale `portfolio.cash`, so cash
         was overwritten;
       - limit buys could spend cash that was no longer there;
       - a stop-loss and a limit-sell on one position could both fire and
         "sell" shares that were already gone, creating free cash.
       Sell orders for a position that no longer exists are now cancelled.
     - `lotsAfterSell` supports partial sells at average cost. Previously a
       sell order deleted *all* lots for the ticker, even ones bought after
       the order was placed.
   - `lib/metrics.ts`: `computeTradeStats` gives win rate, profit factor,
     expectancy, average win/loss and largest win/loss. `computeDrawdown`
     gives max and current drawdown. Both convert numeric strings to numbers.
   - `lib/market.ts`: NYSE regular-session detection (America/New_York
     time, weekends, 2026–2027 holidays).
3. **Dashboard fixes (`app/dashboard/page.tsx`)**
   - Pending orders were checked against the *old* `livePrices` state
     right after `setLivePrices` (a stale closure). They are now checked
     against the freshly fetched prices.
   - Tickers with pending limit buys are now priced on refresh. Before, a
     limit buy for a stock you didn't own could never execute.
   - A failed price fetch no longer wipes known prices, and the user is told
     which tickers failed.
   - A market sell fetches a fresh quote. Before, if no price was cached it
     silently sold at average cost, recording a fake breakeven trade.
   - Portfolio snapshots now record the post-trade state. They used to read
     the pre-trade React state.
   - Realised P&L summed `profit_loss` with `+`, which concatenates strings
     if Supabase returns numerics as strings. All money arithmetic now
     converts to numbers first.
   - Negative P&L values showed without a minus sign (sign only shown by
     colour). They now show a minus sign.
   - Performance Statistics shows the new metrics, including max drawdown.
   - Market buys and sells outside regular hours now carry a note saying
     they filled at the last traded price.
4. **Security**
   - `/api/check-alerts` uses the service-role key but trusted `userId` from
     the request body, so anyone could trigger or deactivate any user's
     alerts and create notifications for them. It now requires a Supabase
     bearer token and takes the user from it.
   - `/api/advisor` let anyone spend the Groq key. It now requires a valid
     session token and caps message length at 2000 characters.
   - The dashboard sends the session token to both routes.
5. **Tests and CI**
   - `npm test` runs Node's built-in test runner on `tests/*.test.ts`.
     Node 24 strips TypeScript types natively, so there are no new
     dependencies.
   - There are 22 tests across indicators, portfolio/order logic, metrics
     and market hours, and all pass.
   - I added `allowImportingTsExtensions` to `tsconfig.json`; it is valid
     with `noEmit`.
   - CI no longer swallows test failures (`npm test || echo` became
     `npm test`).

### Research
- Paper-trading fill realism: a stop should trigger, then fill like a
  market order, at a worse price if the price gapped through it. Limit
  orders must fill at or better than the limit. Simple simulators often fill
  a limit as soon as the price touches it.
  - https://tapeboard.com/manual/simulator
  - https://blog.traderspost.io/article/paper-trading-vs-live-results
  - https://forum.alpaca.markets/t/why-did-my-stop-limit-sell-order-sell-at-a-price-below-my-stop-limit/5407
  - https://docs.polysimulator.com/trading/execution-internals

  The new order planner follows this: a triggered order fills at the
  observed market price, which is never worse than a limit and can be below
  a stop.
- MACD definition (signal = 9-period EMA of the MACD line, aligned bar for
  bar):
  - https://ta-lib.org/functions/macd
  - https://tradingview.com/support/solutions/43000502344-macd-moving-average-convergence-divergence
- NYSE hours and holidays: https://www.nyse.com/markets/hours-calendars.
  The holiday list was written from memory; check it against that page.

### What I could NOT run or test
- **`tsc`, `npm run lint` and `npm run build` were all blocked** by the
  session's permission settings. I checked the types by reading the code;
  only the pure modules are covered by tests. **Run `npm run lint` and
  `npm run build` before merging.**
- I couldn't test against a real Supabase or Twelve Data instance, so none
  of the dashboard flows were exercised end-to-end.
- **Deploy note:** the two API routes now reject requests without
  `Authorization: Bearer <access_token>`. The dashboard sends it, but any
  other caller (e.g. a cron job hitting `/api/check-alerts`) must be updated.

### Ideas for next time
- Make trades atomic. Each trade currently does several separate Supabase
  writes (trades, trade_history, portfolios) from the browser, so a failure
  midway corrupts state, and clients can write any cash value. Moving
  execution into a Postgres function (RPC) with row locks and RLS would fix
  both.
- Add a cash-flow ledger, starting with deposits. Snapshots can't tell a
  deposit from a gain, so a proper time-weighted return, Sharpe/Sortino and
  benchmark comparison (vs SPY) aren't possible yet.
- Add optional commission and slippage (e.g. bps of notional), and model
  the bid/ask spread.
- Queue market orders placed outside regular hours for the next open,
  instead of only warning.
- Support partial manual sells in the UI (the order engine already
  supports them).
- Batch price fetches: `getMultipleStocks` exists but the dashboard fetches
  one ticker at a time with 500 ms sleeps, and `checkPriceAlerts` fetches
  the same tickers again.
- `reconstructPriceTimeline` builds indicators from the user's own trade
  prices, which isn't a real price series. Use Twelve Data `/time_series`.
- Split `app/dashboard/page.tsx` into components.
