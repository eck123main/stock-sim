// Fills for resting orders whose price was reached while nobody was looking.
//
// Pending orders are only checked when the user refreshes prices, against
// the last trade at that moment. A limit buy at $95 on a stock that dipped
// to $93 yesterday and closed at $97 would never fill, although a real
// resting order would have. This module replays completed daily OHLC bars
// since the order was placed, using the usual bar-based fill model:
//
//   LIMIT_BUY   fills on the first bar whose low trades THROUGH the limit
//               (low < limit; a mere touch may not reach your place in the
//               queue). Price: the open if the bar opened below the limit
//               (gap; resting orders fill in the opening auction), else the
//               limit.
//   LIMIT_SELL  mirror image: high > limit; price max(open, limit).
//   STOP_LOSS   triggers when low <= stop, then fills like a market order:
//               at the open if the bar gapped below the stop, else at the
//               stop.
//
// Only sessions that started after the order was placed are used (for the
// placement day itself we can't tell whether the high/low came before or
// after the order), and only sessions that have closed. Without intraday
// data the order of events inside one bar is unknown; see sortForReplay.
//
// References: https://nautilustrader.io/docs/latest/concepts/backtesting/bar-execution/
//             https://forum.ninjatrader.com/forum/ninjatrader-8/strategy-development/1321733-fill-price-on-limit-order-after-gap

import type { Bar } from './benchmark.ts'
import type { PendingOrder } from './portfolio.ts'
import { toNum } from './portfolio.ts'
import { nyDateTime, sessionCloseMinutes } from './market.ts'

export interface BarFill {
  /** Raw fill price before slippage/commission (the planner applies costs). */
  price: number
  /** Trading date of the bar that filled the order. */
  date: string
}

/** The first completed bar after placement that fills `order`, or null. */
export function barTriggeredFill(
  order: PendingOrder & { created_at?: string },
  bars: Bar[],
  now: Date = new Date(),
): BarFill | null {
  const target = toNum(order.target_price)
  if (!(target > 0) || !order.created_at) return null
  const placedDay = nyDateTime(new Date(order.created_at)).ymd
  const { ymd: today, minutes } = nyDateTime(now)
  const todayClosed = minutes >= sessionCloseMinutes(today)

  const sorted = [...bars].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const bar of sorted) {
    if (bar.date <= placedDay) continue
    if (bar.date > today || (bar.date === today && !todayClosed)) break
    const { open, high, low } = bar
    if (open === undefined || high === undefined || low === undefined) continue
    switch (order.order_type) {
      case 'LIMIT_BUY':
        if (low < target) return { price: Math.min(open, target), date: bar.date }
        break
      case 'LIMIT_SELL':
        if (high > target) return { price: Math.max(open, target), date: bar.date }
        break
      case 'STOP_LOSS':
        if (low <= target) return { price: Math.min(open, target), date: bar.date }
        break
    }
  }
  return null
}

/**
 * Order the replay so fills happen in time order: bar-triggered fills by
 * bar date first, then orders that only trigger at the current price. On the
 * same bar, stops go before limit sells (with OHLC data we can't know which
 * level was hit first, so assume the worse outcome), then oldest first.
 */
export function sortForReplay<T extends PendingOrder & { created_at?: string }>(
  orders: T[],
  fills: Record<string, BarFill>,
): T[] {
  const rank = (o: T) => (o.order_type === 'STOP_LOSS' ? 0 : 1)
  return [...orders].sort((a, b) => {
    const da = fills[a.id]?.date ?? '9999-12-31'
    const db = fills[b.id]?.date ?? '9999-12-31'
    if (da !== db) return da < db ? -1 : 1
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  })
}
