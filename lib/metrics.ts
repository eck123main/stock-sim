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

/** Return on cost for open positions: unrealised P&L / cost basis. */
export function unrealizedReturn(marketValue: number, costBasis: number): number | null {
  if (costBasis <= 0) return null
  return (marketValue - costBasis) / costBasis
}
