'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getMultipleStocks, DEFAULT_STOCKS } from '../../lib/stocks'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [portfolio, setPortfolio] = useState<any>(null)
  const [stocks, setStocks] = useState<any[]>([])
  const [trades, setTrades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStock, setSelectedStock] = useState<any>(null)
  const [buyAmount, setBuyAmount] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      setUser(user)

      const { data: portfolio } = await supabase
        .from('portfolios')
        .select('*')
        .eq('id', user.id)
        .single()
      setPortfolio(portfolio)

      const { data: trades } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
      setTrades(trades || [])

      const stockData = await getMultipleStocks(DEFAULT_STOCKS)
      setStocks(stockData)
      setLoading(false)
    }
    load()
  }, [])

  async function handleBuy() {
    if (!selectedStock || !buyAmount) return
    const dollars = parseFloat(buyAmount)
    if (isNaN(dollars) || dollars <= 0) return setMessage('Enter a valid amount')
    if (dollars > portfolio.cash) return setMessage('Not enough cash!')

    const shares = dollars / selectedStock.price
    const newCash = portfolio.cash - dollars

    await supabase.from('trades').insert({
      user_id: user.id,
      ticker: selectedStock.ticker,
      company_name: selectedStock.ticker,
      shares,
      price_at_purchase: selectedStock.price,
    })

    await supabase.from('portfolios')
      .update({ cash: newCash })
      .eq('id', user.id)

    setPortfolio({ ...portfolio, cash: newCash })
    setTrades([...trades, { ticker: selectedStock.ticker, shares, price_at_purchase: selectedStock.price }])
    setBuyAmount('')
    setMessage(`✅ Bought ${shares.toFixed(4)} shares of ${selectedStock.ticker}!`)
  }

  async function handleSell(ticker: string) {
    const holding = getHolding(ticker)
    if (!holding) return
    const stock = stocks.find(s => s.ticker === ticker)
    if (!stock) return

    const value = holding.shares * stock.price
    const newCash = portfolio.cash + value

    await supabase.from('trades')
      .delete()
      .eq('user_id', user.id)
      .eq('ticker', ticker)

    await supabase.from('portfolios')
      .update({ cash: newCash })
      .eq('id', user.id)

    setPortfolio({ ...portfolio, cash: newCash })
    setTrades(trades.filter(t => t.ticker !== ticker))
    setMessage(`✅ Sold all ${ticker} for $${value.toFixed(2)}!`)
  }

  function getHolding(ticker: string) {
    const tickerTrades = trades.filter(t => t.ticker === ticker)
    if (tickerTrades.length === 0) return null
    const shares = tickerTrades.reduce((sum, t) => sum + t.shares, 0)
    const avgPrice = tickerTrades.reduce((sum, t) => sum + t.price_at_purchase, 0) / tickerTrades.length
    return { shares, avgPrice }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (!user || loading) return <p style={{ fontFamily: 'monospace', padding: 40 }}>Loading stocks... (this takes ~5s)</p>

  const portfolioValue = trades.reduce((sum, trade) => {
    const stock = stocks.find(s => s.ticker === trade.ticker)
    return sum + (stock ? trade.shares * stock.price : 0)
  }, 0)

  return (
    <div style={{ fontFamily: 'monospace', padding: 40, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1>📈 Stock Simulator</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#666' }}>{user.email}</span>
          <button onClick={handleLogout} style={{ padding: '8px 16px', cursor: 'pointer' }}>Logout</button>
        </div>
      </div>

      {message && (
        <div style={{ background: '#f0fff0', border: '1px solid #ccc', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {message}
        </div>
      )}
      <button onClick={async () => {
        const newCash = portfolio.cash + 10000
        await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)
        setPortfolio({ ...portfolio, cash: newCash })
        setMessage('💸 Added $10,000!')
      }} style={{ marginBottom: 24, padding: '10px 20px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace', fontSize: 14 }}>
        💸 Give me $10,000
      </button>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        <div style={{ background: '#f5f5f5', padding: 20, borderRadius: 8 }}>
          <p style={{ color: '#666', marginBottom: 4 }}>💰 Cash</p>
          <p style={{ fontSize: 24, fontWeight: 'bold' }}>${portfolio?.cash?.toFixed(2)}</p>
        </div>
        <div style={{ background: '#f5f5f5', padding: 20, borderRadius: 8 }}>
          <p style={{ color: '#666', marginBottom: 4 }}>📊 Portfolio Value</p>
          <p style={{ fontSize: 24, fontWeight: 'bold' }}>${portfolioValue.toFixed(2)}</p>
        </div>
        <div style={{ background: '#f5f5f5', padding: 20, borderRadius: 8 }}>
          <p style={{ color: '#666', marginBottom: 4 }}>💼 Total Value</p>
          <p style={{ fontSize: 24, fontWeight: 'bold' }}>${(portfolio?.cash + portfolioValue).toFixed(2)}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* Market */}
        <div>
          <h2 style={{ marginBottom: 16 }}>📊 Market</h2>
          {stocks.map(stock => (
            <div key={stock.ticker}
              onClick={() => setSelectedStock(stock)}
              style={{
                background: selectedStock?.ticker === stock.ticker ? '#e8f4ff' : '#f9f9f9',
                border: `1px solid ${selectedStock?.ticker === stock.ticker ? '#4a90e2' : '#eee'}`,
                padding: 16, borderRadius: 8, marginBottom: 8, cursor: 'pointer'
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontWeight: 'bold', fontSize: 18 }}>{stock.ticker}</p>
                  {getHolding(stock.ticker) && (
                    <p style={{ fontSize: 12, color: '#4a90e2' }}>
                      You own {getHolding(stock.ticker)?.shares.toFixed(4)} shares
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 'bold', fontSize: 18 }}>${stock.price?.toFixed(2)}</p>
                  <p style={{ color: stock.change >= 0 ? 'green' : 'red', fontSize: 13 }}>
                    {stock.change >= 0 ? '+' : ''}{stock.change?.toFixed(2)} ({stock.changePct})
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Buy Panel */}
          {selectedStock && (
            <div style={{ background: '#f0f8ff', border: '1px solid #4a90e2', padding: 20, borderRadius: 8, marginTop: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Buy {selectedStock.ticker} @ ${selectedStock.price?.toFixed(2)}</h3>
              <input
                type="number"
                placeholder="Amount in $ (e.g. 500)"
                value={buyAmount}
                onChange={e => setBuyAmount(e.target.value)}
                style={{ width: '100%', padding: 10, marginBottom: 8, borderRadius: 4, border: '1px solid #ccc', fontFamily: 'monospace' }}
              />
              {buyAmount && (
                <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                  ≈ {(parseFloat(buyAmount) / selectedStock.price).toFixed(4)} shares
                </p>
              )}
              <button onClick={handleBuy}
                style={{ width: '100%', padding: 12, background: '#4a90e2', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 14 }}>
                Buy {selectedStock.ticker}
              </button>
              {getHolding(selectedStock.ticker) && (
                <button onClick={() => handleSell(selectedStock.ticker)}
                  style={{ width: '100%', padding: 12, background: 'white', color: 'red', border: '1px solid red', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 14, marginTop: 8 }}>
                  Sell All {selectedStock.ticker}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Holdings */}
        <div>
          <h2 style={{ marginBottom: 16 }}>💼 My Holdings</h2>
          {DEFAULT_STOCKS.filter(t => getHolding(t)).length === 0 ? (
            <p style={{ color: '#999' }}>No holdings yet — click a stock to buy!</p>
          ) : (
            DEFAULT_STOCKS.filter(t => getHolding(t)).map(ticker => {
              const holding = getHolding(ticker)!
              const stock = stocks.find(s => s.ticker === ticker)
              const currentValue = holding.shares * (stock?.price || 0)
              const costBasis = holding.shares * holding.avgPrice
              const gain = currentValue - costBasis
              return (
                <div key={ticker} style={{ background: '#f9f9f9', border: '1px solid #eee', padding: 16, borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontWeight: 'bold', fontSize: 16 }}>{ticker}</p>
                      <p style={{ fontSize: 12, color: '#666' }}>
                        {holding.shares.toFixed(4)} shares @ avg ${holding.avgPrice.toFixed(2)}
                      </p>
                      <p style={{ fontSize: 12, color: '#666' }}>
                        Cost basis: ${(holding.shares * holding.avgPrice).toFixed(2)}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontWeight: 'bold' }}>Current: ${currentValue.toFixed(2)}</p>
                      <p style={{ color: gain >= 0 ? 'green' : 'red', fontSize: 13 }}>
                        {gain >= 0 ? '+' : ''}${gain.toFixed(2)} ({((gain / costBasis) * 100).toFixed(2)}%)
                      </p>
                      <button onClick={() => handleSell(ticker)}
                        style={{ marginTop: 8, padding: '4px 12px', background: 'white', color: 'red', border: '1px solid red', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 }}>
                        Sell All
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}