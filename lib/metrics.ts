// Performance metrics computed from trade history and portfolio snapshots.

export interface HistoryEntry {
  action: string
  profit_loss: number | string | null
  total_value?: number | string | null
}

export interface Snapshot {
  created_at: string
  portfolio_value: number | string
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export interface TradeStats {
  closedTrades: number
  wins: number
  losses: number
  breakeven: number
  /** wins / closed trades; null if no closed trades */
  winRate: number | null
  realizedPnL: number
  grossProfit: number
  grossLoss: number
  /** gross profit / |gross loss|; Infinity if no losses, null if no trades */
  profitFactor: number | null
  avgWin: number | null
  avgLoss: number | null
  /** average P&L per closed trade */
  expectancy: number | null
  largestWin: number | null
  largestLoss: number | null
}

/**
 * Statistics over closed (SELL) trades. Only SELL rows carry realised P&L;
 * BUY rows have profit_loss = null and are ignored. Values are normalised
 * to numbers because Supabase numeric columns may be returned as strings,
 * and adding strings with `+` concatenates them.
 */
export function computeTradeStats(history: HistoryEntry[]): TradeStats {
  const pnls = history
    .filter(h => h.action === 'SELL')
    .map(h => num(h.profit_loss))
    .filter((v): v is number => v !== null)

  const winsArr = pnls.filter(p => p > 0)
  const lossArr = pnls.filter(p => p < 0)
  const grossProfit = winsArr.reduce((a, b) => a + b, 0)
  const grossLoss = lossArr.reduce((a, b) => a + b, 0)
  const realizedPnL = grossProfit + grossLoss
  const n = pnls.length

  return {
    closedTrades: n,
    wins: winsArr.length,
    losses: lossArr.length,
    breakeven: n - winsArr.length - lossArr.length,
    winRate: n ? winsArr.length / n : null,
    realizedPnL,
    grossProfit,
    grossLoss,
    profitFactor: n === 0 ? null : grossLoss === 0 ? (grossProfit > 0 ? Infinity : null) : grossProfit / Math.abs(grossLoss),
    avgWin: winsArr.length ? grossProfit / winsArr.length : null,
    avgLoss: lossArr.length ? grossLoss / lossArr.length : null,
    expectancy: n ? realizedPnL / n : null,
    largestWin: winsArr.length ? Math.max(...winsArr) : null,
    largestLoss: lossArr.length ? Math.min(...lossArr) : null,
  }
}

export interface DrawdownStats {
  /** Largest peak-to-trough decline as a positive fraction (0.25 = -25%). */
  maxDrawdown: number
  peakValue: number | null
  troughValue: number | null
  /** Current decline from the running peak, as a positive fraction. */
  currentDrawdown: number
}

/**
 * Max drawdown from portfolio value snapshots, sorted by time.
 * Note: snapshots do not record deposits, so a deposit looks like a gain.
 * Drawdown is still meaningful because deposits only raise values.
 */
export function computeDrawdown(snapshots: Snapshot[]): DrawdownStats {
  const values = [...snapshots]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(s => num(s.portfolio_value))
    .filter((v): v is number => v !== null && v > 0)

  let peak = -Infinity
  let maxDd = 0
  let ddPeak: number | null = null
  let ddTrough: number | null = null
  for (const v of values) {
    if (v > peak) peak = v
    const dd = (peak - v) / peak
    if (dd > maxDd) {
      maxDd = dd
      ddPeak = peak
      ddTrough = v
    }
  }
  const last = values.length ? values[values.length - 1] : null
  return {
    maxDrawdown: maxDd,
    peakValue: ddPeak,
    troughValue: ddTrough,
    currentDrawdown: last !== null && peak > 0 ? (peak - last) / peak : 0,
  }
}

export interface CashFlow {
  created_at: string
  /** Positive for deposits, negative for withdrawals. */
  amount: number | string
}

export interface ReturnStats {
  /** Cumulative time-weighted return (0.1 = +10%); null if < 2 snapshots. */
  twr: number | null
  /** Annualised TWR; null if the history spans less than 30 days. */
  annualizedReturn: number | null
  /** Ending value - starting value - net deposits over the snapshot window. */
  investmentGain: number | null
  netDeposits: number
  /** Max drawdown of the time-weighted growth index (immune to deposits/withdrawals). */
  maxDrawdown: number
  /** Number of daily returns used for the risk ratios. */
  days: number
  /** Annualised standard deviation of daily returns. */
  volatility: number | null
  /** Annualised Sharpe ratio (daily excess mean / stdev * sqrt(252)). */
  sharpe: number | null
  /** Annualised Sortino ratio (downside deviation vs. the risk-free rate). */
  sortino: number | null
}

const TRADING_DAYS = 252
const DAY_MS = 86_400_000

/**
 * Time-weighted return and risk ratios from portfolio snapshots and
 * external cash flows (deposits/withdrawals).
 *
 * A raw "value now / value then" return counts deposits as profit. TWR
 * instead splits the history at every snapshot, removes any cash flow that
 * happened inside a sub-period, and chain-links the sub-period returns:
 *   r_i = (V_i - CF_i) / V_{i-1} - 1,   TWR = prod(1 + r_i) - 1
 * A flow is assigned to the first snapshot taken at or after it (the
 * dashboard snapshots right after each deposit, so this is exact).
 *
 * Sub-period returns are compounded into one return per calendar day (UTC)
 * before computing volatility/Sharpe/Sortino, since snapshots are taken at
 * irregular times (on every trade). Ratios need at least `minDays` daily
 * returns, otherwise they are null: a handful of points gives meaningless
 * numbers. `riskFreeRate` is annual.
 */
export function computeReturnStats(
  snapshots: Snapshot[],
  flows: CashFlow[] = [],
  opts: { riskFreeRate?: number; minDays?: number } = {},
): ReturnStats {
  const { riskFreeRate = 0, minDays = 10 } = opts
  const snaps = [...snapshots]
    .map(s => ({ t: new Date(s.created_at).getTime(), v: num(s.portfolio_value) }))
    .filter((s): s is { t: number; v: number } => Number.isFinite(s.t) && s.v !== null && s.v > 0)
    .sort((a, b) => a.t - b.t)
  const cfs = flows
    .map(f => ({ t: new Date(f.created_at).getTime(), a: num(f.amount) ?? 0 }))
    .filter(f => Number.isFinite(f.t) && f.a !== 0)
    .sort((a, b) => a.t - b.t)

  const empty: ReturnStats = {
    twr: null, annualizedReturn: null, investmentGain: null, netDeposits: 0, maxDrawdown: 0,
    days: 0, volatility: null, sharpe: null, sortino: null,
  }
  if (snaps.length < 2) return empty

  // Flows strictly after the first snapshot and at/before the last one.
  let fi = 0
  while (fi < cfs.length && cfs[fi].t <= snaps[0].t) fi++

  let growth = 1
  let peak = 1
  let maxDrawdown = 0
  let netDeposits = 0
  const daily = new Map<string, number>() // UTC day -> growth factor
  for (let i = 1; i < snaps.length; i++) {
    let cf = 0
    while (fi < cfs.length && cfs[fi].t <= snaps[i].t) cf += cfs[fi++].a
    netDeposits += cf
    const r = (snaps[i].v - cf) / snaps[i - 1].v
    if (!Number.isFinite(r) || r <= 0) continue
    growth *= r
    if (growth > peak) peak = growth
    maxDrawdown = Math.max(maxDrawdown, (peak - growth) / peak)
    const day = new Date(snaps[i].t).toISOString().slice(0, 10)
    daily.set(day, (daily.get(day) ?? 1) * r)
  }

  const first = snaps[0]
  const last = snaps[snaps.length - 1]
  const twr = growth - 1
  const years = (last.t - first.t) / (365.25 * DAY_MS)
  const annualizedReturn = years >= 30 / 365.25 ? Math.pow(growth, 1 / years) - 1 : null

  const rets = [...daily.values()].map(g => g - 1)
  const n = rets.length
  let volatility: number | null = null
  let sharpe: number | null = null
  let sortino: number | null = null
  if (n >= minDays) {
    const rf = Math.pow(1 + riskFreeRate, 1 / TRADING_DAYS) - 1
    const excess = rets.map(r => r - rf)
    const mean = excess.reduce((a, b) => a + b, 0) / n
    const rawMean = rets.reduce((a, b) => a + b, 0) / n
    const variance = rets.reduce((a, r) => a + (r - rawMean) ** 2, 0) / (n - 1)
    const sd = Math.sqrt(variance)
    const downside = Math.sqrt(excess.reduce((a, r) => a + Math.min(r, 0) ** 2, 0) / n)
    volatility = sd * Math.sqrt(TRADING_DAYS)
    sharpe = sd > 0 ? (mean / sd) * Math.sqrt(TRADING_DAYS) : null
    sortino = downside > 0 ? (mean / downside) * Math.sqrt(TRADING_DAYS) : null
  }

  return {
    twr,
    annualizedReturn,
    investmentGain: last.v - first.v - netDeposits,
    netDeposits,
    maxDrawdown,
    days: n,
    volatility,
    sharpe,
    sortino,
  }
}

/** Return on cost for open positions: unrealised P&L / cost basis. */
export function unrealizedReturn(marketValue: number, costBasis: number): number | null {
  if (costBasis <= 0) return null
  return (marketValue - costBasis) / costBasis
}
