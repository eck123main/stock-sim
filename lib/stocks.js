const API_KEY = process.env.NEXT_PUBLIC_TWELVE_DATA_KEY

export async function getMultipleStocks(tickers) {
  try {
    const symbols = tickers.join(',')

    const res = await fetch(
      `https://api.twelvedata.com/price?symbol=${symbols}&apikey=${API_KEY}`
    )
    const data = await res.json()

    return tickers.map(ticker => {
      const quote = data[ticker]
      if (!quote || quote.status === 'error' || !quote.price) {
        return { ticker, price: null, change: 0, changePct: '0%', error: true }
      }
      return {
        ticker,
        price: parseFloat(quote.price),
        change: 0,
        changePct: '0%',
      }
    })
  } catch (e) {
    console.log('Error:', e)
    return tickers.map(t => ({ ticker: t, price: null, change: 0, changePct: '0%', error: true }))
  }
}

export async function getStockPrice(ticker) {
  const results = await getMultipleStocks([ticker])
  return results[0]
}

export const DEFAULT_STOCKS = [
  'AAPL', 'TSLA', 'NVDA', 'AMZN', 'GOOGL',
  'MSFT', 'META', 'NFLX'
]
export async function searchStock(ticker) {
  try {
    const res = await fetch(
      `https://api.twelvedata.com/price?symbol=${ticker}&apikey=${API_KEY}`
    )
    const data = await res.json()
    
    if (!data || data.status === 'error' || !data.price) {
      return { ticker, price: null, error: true, message: data.message || 'Stock not found' }
    }

    return {  
      ticker: ticker.toUpperCase(),
      price: parseFloat(data.price),
      change: 0,
      changePct: '0%',
    }
  } catch (e) {
    return { ticker, price: null, error: true }
  }
}