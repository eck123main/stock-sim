// Pure portfolio / order-execution logic, kept free of React and Supabase so
// it can be unit tested. The dashboard calls these and then persists results.
import { buyFill, sellFill, ZERO_COSTS, type ExecutionCosts } from './costs.ts'

export interface Lot {
  ticker: string
  shares: number | string
  price_at_purchase: number | string
}

export interface Holding {
  shares: number
  avgPrice: number
  costBasis: number
}

export type OrderType = 'LIMIT_BUY' | 'LIMIT_SELL' | 'STOP_LOSS'

export interface PendingOrder {
  id: string
  ticker: string
  order_type: OrderType
  shares: number | string | null
  target_price: number | string
  amount: number | string | null
}

export type Execution =
  | {
      kind: 'BUY'; order: PendingOrder; ticker: string; price: number; shares: number; cost: number
      commission: number; costPerShare: number
    }
  | {
      kind: 'SELL'; order: PendingOrder; ticker: string; price: number; shares: number
      proceeds: number; profitLoss: number; remainingShares: number; avgPrice: number; commission: number
    }

export interface OrderPlan {
  executions: Execution[]
  /** Orders that can never fill any more (e.g. a sell for a position that is gone). */
  cancellations: { order: PendingOrder; reason: string }[]
  /** Orders that triggered but could not fill now (e.g. not enough cash); they stay pending. */
  skipped: { order: PendingOrder; reason: string }[]
  cash: number
}

const EPS = 1e-9

/** Supabase numeric columns may arrive as strings; normalise to numbers. */
export function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

/**
 * Aggregate purchase lots into a position. The average price is the
 * share-weighted cost basis (total cost / total shares), not the plain mean
 * of purchase prices.
 */
export function computeHolding(lots: Lot[], ticker: string): Holding | null {
  let shares = 0
  let cost = 0
  for (const lot of lots) {
    if (lot.ticker !== ticker) continue
    const s = toNum(lot.shares)
    shares += s
    cost += s * toNum(lot.price_at_purchase)
  }
  if (shares <= EPS) return null
  return { shares, avgPrice: cost / shares, costBasis: cost }
}

export function heldTickers(lots: Lot[]): string[] {
  return [...new Set(lots.map(l => l.ticker))]
}

export function isTriggered(order: PendingOrder, price: number): boolean {
  const target = toNum(order.target_price)
  switch (order.order_type) {
    case 'LIMIT_BUY': return price <= target
    case 'LIMIT_SELL': return price >= target
    case 'STOP_LOSS': return price <= target
    default: return false
  }
}

/**
 * Reject orders a broker would refuse at entry. A sell stop at or above the
 * current price would trigger immediately, so brokers reject it (use a
 * market or limit sell instead). Marketable limit orders are allowed; they
 * simply fill on the next price check.
 */
export function orderPlacementError(type: OrderType, target: number, currentPrice: number | null | undefined): string | null {
  if (!(target > 0)) return 'Please enter a valid price'
  if (type === 'STOP_LOSS' && currentPrice && target >= currentPrice) {
    return `Stop price must be below the current price ($${currentPrice.toFixed(2)}), otherwise it would trigger immediately`
  }
  return null
}

/**
 * Decide which pending orders fill at the given prices. State (cash and
 * positions) is threaded through sequentially so that several fills in one
 * pass don't all start from the same stale cash balance, a buy can't spend
 * cash that an earlier buy already used, and a sell can't sell more shares
 * than are still held.
 *
 * Fill prices: when triggered, an order fills at the observed market price,
 * like a marketable order. That price is never worse than the limit for
 * limit orders. For a stop it may be below the stop price if the price gapped
 * through it, which is how real stop-market orders behave.
 */
export function planOrderExecutions(
  orders: PendingOrder[],
  prices: Record<string, number>,
  cash: number,
  lots: Lot[],
  costs: ExecutionCosts = ZERO_COSTS,
): OrderPlan {
  const positions = new Map<string, { shares: number; avgPrice: number }>()
  for (const t of heldTickers(lots)) {
    const h = computeHolding(lots, t)
    if (h) positions.set(t, { shares: h.shares, avgPrice: h.avgPrice })
  }

  const plan: OrderPlan = { executions: [], cancellations: [], skipped: [], cash }

  for (const order of orders) {
    const price = prices[order.ticker]
    if (!price || price <= 0) continue
    if (!isTriggered(order, price)) continue

    if (order.order_type === 'LIMIT_BUY') {
      const amount = toNum(order.amount)
      if (amount <= 0) {
        plan.cancellations.push({ order, reason: 'invalid amount' })
        continue
      }
      if (amount > plan.cash + EPS) {
        plan.skipped.push({ order, reason: 'insufficient cash' })
        continue
      }
      const fill = buyFill(amount, price, costs, toNum(order.target_price))
      if (!fill) {
        plan.cancellations.push({ order, reason: 'amount does not cover commission' })
        continue
      }
      const shares = fill.shares
      plan.cash -= amount
      const pos = positions.get(order.ticker)
      if (pos) {
        const total = pos.shares + shares
        pos.avgPrice = (pos.shares * pos.avgPrice + amount) / total
        pos.shares = total
      } else {
        positions.set(order.ticker, { shares, avgPrice: fill.costPerShare })
      }
      plan.executions.push({
        kind: 'BUY', order, ticker: order.ticker, price: fill.fillPrice, shares, cost: amount,
        commission: fill.commission, costPerShare: fill.costPerShare,
      })
    } else {
      const pos = positions.get(order.ticker)
      if (!pos || pos.shares <= EPS) {
        plan.cancellations.push({ order, reason: 'no shares held' })
        continue
      }
      const requested = toNum(order.shares)
      const shares = requested > 0 ? Math.min(requested, pos.shares) : pos.shares
      const limit = order.order_type === 'LIMIT_SELL' ? toNum(order.target_price) : undefined
      const fill = sellFill(shares, price, pos.avgPrice, costs, limit)
      const { proceeds, profitLoss, commission } = fill
      pos.shares -= shares
      const remainingShares = pos.shares <= EPS ? 0 : pos.shares
      if (remainingShares === 0) positions.delete(order.ticker)
      plan.cash += proceeds
      plan.executions.push({
        kind: 'SELL', order, ticker: order.ticker, price: fill.fillPrice, shares,
        proceeds, profitLoss, remainingShares, avgPrice: pos.avgPrice, commission,
      })
    }
  }

  return plan
}

/**
 * Lots to keep after selling `sharesSold` of a position. Average-cost
 * accounting collapses the remaining shares into a single lot at the
 * unchanged average price, so the cost basis of what's left is preserved.
 */
export function lotsAfterSell(lots: Lot[], ticker: string, sharesSold: number): Lot[] {
  const holding = computeHolding(lots, ticker)
  const others = lots.filter(l => l.ticker !== ticker)
  if (!holding) return others
  const remaining = holding.shares - sharesSold
  if (remaining <= EPS) return others
  return [...others, { ticker, shares: remaining, price_at_purchase: holding.avgPrice }]
}
