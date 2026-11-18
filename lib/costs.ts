// Transaction-cost model: bid/ask half-spread slippage plus commission.
//
// The quote feed only gives a last-trade price. A real marketable order buys
// at the ask and sells at the bid, i.e. roughly half the spread away from the
// mid/last price. Ignoring that makes every round trip free and overstates
// returns, especially for frequent traders. Typical half-spreads for liquid
// US large caps are a few basis points; small caps are wider.

export interface ExecutionCosts {
  /** Price concession per fill in basis points (buy higher, sell lower). */
  slippageBps: number
  /** Flat commission per order, in dollars. */
  commissionPerOrder: number
  /** Commission as basis points of traded notional. */
  commissionBps: number
}

export const ZERO_COSTS: ExecutionCosts = { slippageBps: 0, commissionPerOrder: 0, commissionBps: 0 }

/** Default for the app: commission-free broker, ~2 bps half-spread. */
export const DEFAULT_COSTS: ExecutionCosts = { slippageBps: 2, commissionPerOrder: 0, commissionBps: 0 }

export type Side = 'BUY' | 'SELL'

/** Price after slippage: buys pay more, sells receive less. */
export function slippedPrice(side: Side, price: number, costs: ExecutionCosts = DEFAULT_COSTS): number {
  const f = costs.slippageBps / 10_000
  return side === 'BUY' ? price * (1 + f) : price * (1 - f)
}

export function commissionFor(notional: number, costs: ExecutionCosts = DEFAULT_COSTS): number {
  if (notional <= 0) return 0
  return costs.commissionPerOrder + notional * costs.commissionBps / 10_000
}

export interface BuyFill {
  fillPrice: number
  shares: number
  commission: number
  /** Total cash leaving the account (= the dollar amount requested). */
  cashSpent: number
  /** Effective cost per share including commission (use as cost basis). */
  costPerShare: number
}

/**
 * Spend `dollars` in total (commission included) buying at `price`.
 * `limit` caps the fill price for limit orders: a limit buy never pays more
 * than its limit, even after slippage. Returns null if the amount doesn't
 * even cover the commission.
 */
export function buyFill(dollars: number, price: number, costs: ExecutionCosts = DEFAULT_COSTS, limit?: number): BuyFill | null {
  if (!(dollars > 0) || !(price > 0)) return null
  let fillPrice = slippedPrice('BUY', price, costs)
  if (limit !== undefined && limit > 0) fillPrice = Math.min(fillPrice, Math.max(price, limit))
  // dollars = notional + fixed + notional*bps  =>  notional = (dollars - fixed) / (1 + bps)
  const notional = (dollars - costs.commissionPerOrder) / (1 + costs.commissionBps / 10_000)
  if (notional <= 0) return null
  const shares = notional / fillPrice
  return {
    fillPrice,
    shares,
    commission: dollars - notional,
    cashSpent: dollars,
    costPerShare: dollars / shares,
  }
}

export interface SellFill {
  fillPrice: number
  /** Net cash received after commission. */
  proceeds: number
  commission: number
  /** Net proceeds minus cost basis of the shares sold. */
  profitLoss: number
}

/**
 * Sell `shares` at `price` with average cost `avgPrice`. `limit` floors the
 * fill price for limit sells (never below the limit). Stops pass no limit:
 * they fill like a market order and may slip below the stop.
 */
export function sellFill(shares: number, price: number, avgPrice: number, costs: ExecutionCosts = DEFAULT_COSTS, limit?: number): SellFill {
  let fillPrice = slippedPrice('SELL', price, costs)
  if (limit !== undefined && limit > 0) fillPrice = Math.max(fillPrice, Math.min(price, limit))
  const gross = shares * fillPrice
  const commission = Math.min(commissionFor(gross, costs), gross)
  const proceeds = gross - commission
  return { fillPrice, proceeds, commission, profitLoss: proceeds - shares * avgPrice }
}
