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

## Round 2 — 2026-11-18 (same branch)

The tree was clean at the start, with no unfinished work. Seven commits,
one per change. Tests went from 22 to 44 (new files `costs`, `returns` and
`quotes`, plus additions to the `market` and `portfolio` tests), and all
pass.

### What I changed and why
1. **Bug: charts and metrics stopped updating after 100 snapshots**
   (`f85e9ae`). Snapshots were loaded with ascending order and
   `.limit(100)`, which returns the *oldest* 100 rows. Once a user had more
   than 100, the portfolio chart and drawdown froze in the past. The app now
   fetches the newest `SNAPSHOT_LIMIT` (500) rows and reverses them into
   time order.
2. **Bug: market buys filled at a stale price** (same commit).
   `handleBuy` used the price from when the stock was *searched*, which
   could be hours old. It now fetches a fresh quote, as sells already did
   after round 1.
3. **Transaction costs (`lib/costs.ts`)** (`7924675`). Every fill used to
   be at the raw last price, so round trips were free. The new model:
   - Half-spread slippage: buys fill at quote × (1 + bps), sells at
     quote × (1 − bps). The default is 2 bps with zero commission, roughly a
     commission-free broker trading liquid large caps. Flat and bps
     commissions are supported.
   - Limit orders never fill worse than their limit, even after slippage.
     Stops fill like market orders and can slip below the stop.
   - Cost basis includes the costs, and realised P&L is net of them.
   - It is used by market buys and sells and by `planOrderExecutions`. The
     planner's new `costs` parameter defaults to zero, so earlier tests are
     unchanged.
4. **Returns no longer count deposits as profit (`computeReturnStats`
   in `lib/metrics.ts`)** (`c1f8da4`).
   - Time-weighted return, chain-linked across snapshots:
     r_i = (V_i − CF_i)/V_{i−1} − 1.
   - Annualised return, shown once there are 30+ days of history.
   - Annualised volatility, Sharpe and Sortino, from returns compounded to
     one per day. They need 10+ days, otherwise they show "—".
   - Max drawdown is now measured on the TWR growth index, so a withdrawal
     doesn't look like a loss.
   - Deposits are now saved as `action: 'DEPOSIT'` rows in `trade_history`,
     with a snapshot taken right after. The dashboard keeps these rows out
     of the trade list and trade statistics. The deposit handler also now
     checks the `portfolios` update for errors.
5. **Partial manual sells** (`6e9e1fc`). There is a "shares to sell" input
   next to "Sell All". The remaining shares are kept as one lot at the
   unchanged average cost, using round 1's `lotsAfterSell`.
6. **Batched price fetching (`lib/quotes.ts`)** (`7c9abfd`).
   - A refresh used to make one request per ticker with 500 ms sleeps,
     then the alert check fetched every alert ticker again. Now held,
     pending-order and alert tickers go out in one `/price` request per 8
     symbols, and the alert check reuses those prices.
   - **Bug fixed in `getMultipleStocks`**: for a single symbol Twelve Data
     returns a flat `{price}`, not `{AAPL: {price}}`, so `getStockPrice`
     always reported an error.
7. **NYSE early closes** (`6894f36`). 2026-11-27, 2026-12-24 and
   2027-11-26 now close at 13:00 ET, with extended hours ending at 17:00.
   I re-derived round 1's holiday list (Good Friday from the Easter date,
   weekend observance rules) and it is correct.
8. **Order entry validation** (`d299589`). A stop-loss at or above the
   current price is now rejected; it used to trigger on the next refresh.
   Brokers reject these too.

### Research
- Time-weighted return: split the period at each cash flow and
  geometrically link the sub-period returns.
  - https://www.bankrate.com/investing/what-is-time-weighted-return-how-to-calculate/
  - https://www.moonfare.com/glossary/time-weighted-return-twr
  - https://www.fundmanagersoftware.com/help/yields_twr.html
  - https://metricgate.com/docs/time-weighted-return/
- Slippage and commission modelling: half-spread fills, bps slippage of
  about 1–5 bps for liquid large caps, and per-share or bps commissions.
  - https://rustybt.readthedocs.io/en/latest/api/order-management/transaction-costs/slippage-models/
  - https://qf-lib.readthedocs.io/en/latest/tutorials/customize_your_backtest.html
  - https://www.mql5.com/en/blogs/post/775565 (fixed spreads understate
    costs at the open, the close and around news)

### What I could NOT run or test
- **`tsc`, lint and build were blocked again** by the session's
  permission settings, and so were `sed` and heredocs. The dashboard edits
  were checked only by reading the code. **Run `npm run lint && npm run
  build` before merging.**
- **Database schema risk:** there is no schema in the repo. If
  `trade_history.action` has a CHECK constraint or an enum allowing only
  `BUY`/`SELL`, the `DEPOSIT` insert will fail. The deposit itself still
  succeeds, the error is logged to the console, and TWR then treats the
  deposit as a gain, as before. If so, widen the constraint, or add a
  `cash_flows` table and change `applyHistory`/`handleDeposit`.
- I couldn't test against a real Supabase or Twelve Data instance. Batch
  parsing follows Twelve Data's documented response shapes, but I didn't
  try it against the live API.
- Deposits made before this change have no cash-flow rows, so the TWR of
  existing accounts still counts those deposits as gains.

### Ideas for next time
- Atomic trades via a Postgres RPC with RLS (still the biggest integrity
  gap, carried over from round 1).
- A benchmark comparison, e.g. TWR vs SPY over the same window, using
  Twelve Data `/time_series` daily closes. That would also give beta and
  alpha.
- Snapshots only happen on trades and deposits, so daily risk metrics are
  sparse for inactive users. A daily snapshot (cron or on login) would
  make Sharpe and volatility meaningful.
- Let users set the cost settings, or make slippage depend on the stock
  (wider for small caps and low-priced stocks).
- Queue market orders placed outside regular hours for the next open.
- Holidays and early closes are hard-coded through 2027; extend the list
  or compute it.
