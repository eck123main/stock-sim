// Batched last-price fetching from Twelve Data's /price endpoint.
//
// /price accepts comma-separated symbols. With several symbols the response
// is keyed by symbol ({ AAPL: { price }, MSFT: { price } }); with ONE symbol
// it is flat ({ price }). A request-level failure (bad key, rate limit) is
// { status: 'error', code, message }. Each symbol costs one API credit, and
// the free plan allows 8 credits per minute, so symbols are sent in chunks.

export interface PriceResult {
  prices: Record<string, number>
  failed: string[]
  /** Request-level error message (e.g. rate limit), if any. */
  error?: string
}

function parsePrice(q: unknown): number | null {
  if (!q || typeof q !== 'object') return null
  const o = q as { status?: string; price?: unknown }
  if (o.status === 'error') return null
  const p = parseFloat(String(o.price))
  return Number.isFinite(p) && p > 0 ? p : null
}

/** Parse a /price response for the given (upper-cased) tickers. */
export function parsePriceResponse(tickers: string[], data: unknown): PriceResult {
  const out: PriceResult = { prices: {}, failed: [] }
  const d = (data ?? {}) as Record<string, unknown>
  if (d.status === 'error') {
    out.failed = [...tickers]
    out.error = typeof d.message === 'string' ? d.message : 'price request failed'
    return out
  }
  for (const t of tickers) {
    const p = tickers.length === 1 && 'price' in d ? parsePrice(d) : parsePrice(d[t])
    if (p === null) out.failed.push(t)
    else out.prices[t] = p
  }
  return out
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

/**
 * Fetch last prices for many tickers in batched requests. `fetchJson` is
 * injectable for tests. Chunks after the first wait `delayMs` to stay within
 * the per-minute credit limit.
 */
export async function fetchPrices(
  tickers: string[],
  apiKey: string | undefined,
  opts: { chunkSize?: number; delayMs?: number; fetchJson?: (url: string) => Promise<unknown> } = {},
): Promise<PriceResult> {
  const {
    chunkSize = 8,
    delayMs = 0,
    fetchJson = async (url: string) => (await fetch(url)).json(),
  } = opts
  const uniq = [...new Set(tickers.map(t => t.trim().toUpperCase()).filter(Boolean))]
  const result: PriceResult = { prices: {}, failed: [] }
  const chunks = chunk(uniq, chunkSize)
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0 && delayMs > 0) await new Promise(r => setTimeout(r, delayMs))
    const syms = chunks[i]
    let parsed: PriceResult
    try {
      const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(syms.join(','))}&apikey=${apiKey ?? ''}`
      parsed = parsePriceResponse(syms, await fetchJson(url))
    } catch {
      parsed = { prices: {}, failed: [...syms], error: 'network error' }
    }
    Object.assign(result.prices, parsed.prices)
    result.failed.push(...parsed.failed)
    if (parsed.error && !result.error) result.error = parsed.error
  }
  return result
}
