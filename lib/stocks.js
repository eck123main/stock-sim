const API_KEY = process.env.NEXT_PUBLIC_FINNHUB_KEY

export async function getStockPrice(ticker) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${API_KEY}`
    )
    const data = await res.json()

    if (!data || !data.c) {
      return { ticker, price: null, change: 0, changePct: '0%', error: true }
    }

    return {
      ticker,
      price: data.c,
      change: data.d,
      changePct: data.dp?.toFixed(2) + '%',
    }
  } catch (e) {
    return { ticker, price: null, change: 0, changePct: '0%', error: true }
  }
}

export async function getMultipleStocks(tickers) {
  const results = await Promise.all(tickers.map(t => getStockPrice(t)))
  return results
}

export const DEFAULT_STOCKS = [
  'AAPL', 'TSLA', 'NVDA', 'AMZN', 'GOOGL',
  'MSFT', 'META', 'NFLX', 'AMD', 'COIN'
]