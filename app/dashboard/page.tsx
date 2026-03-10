'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { searchStock } from '../../lib/stocks'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [portfolio, setPortfolio] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStock, setSelectedStock] = useState<any>(null)
  const [buyAmount, setBuyAmount] = useState('')
  const [message, setMessage] = useState('')
  const [searchTicker, setSearchTicker] = useState('')
  const [searchResult, setSearchResult] = useState<any>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [darkMode, setDarkMode] = useState(false)

  const t = {
    bg: darkMode ? '#0a0a0f' : '#ffffff',
    card: darkMode ? '#1a1a2e' : '#f5f5f5',
    border: darkMode ? '#2a2a4a' : '#eeeeee',
    text: darkMode ? '#e8e8f0' : '#111111',
    subtext: darkMode ? '#888' : '#666',
    input: darkMode ? '#111128' : '#ffffff',
    inputBorder: darkMode ? '#2a2a4a' : '#cccccc',
    buyCard: darkMode ? '#0d1a2e' : '#f0f8ff',
    buyBorder: darkMode ? '#1a4a8a' : '#4a90e2',
  }

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
      setLoading(false)
    }
    load()
  }, [])

  async function handleSearch() {
    if (!searchTicker.trim()) return
    setSearchLoading(true)
    setSearchError('')
    setSearchResult(null)
    setSelectedStock(null)
    const result = await searchStock(searchTicker.trim().toUpperCase())
    if (result.error) {
      setSearchError(`Could not find "${searchTicker}" — try a valid ticker like AAPL or SHOP`)
    } else {
      setSearchResult(result)
      setSelectedStock(result)
    }
    setSearchLoading(false)
  }

  async function handleBuy() {
    if (!selectedStock || !buyAmount) return
    if (!selectedStock.price || selectedStock.price === 0) return setMessage('Stock price not loaded yet!')
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

    await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)

    setPortfolio({ ...portfolio, cash: newCash })
    setTrades([...trades, { ticker: selectedStock.ticker, shares, price_at_purchase: selectedStock.price }])
    setBuyAmount('')
    setMessage(`✅ Bought ${shares.toFixed(4)} shares of ${selectedStock.ticker}!`)
  }

  async function handleSell(ticker: string) {
    const holding = getHolding(ticker)
    if (!holding) return
    const price = selectedStock?.ticker === ticker ? selectedStock.price : holding.avgPrice
    const value = holding.shares * price
    const newCash = portfolio.cash + value

    await supabase.from('trades').delete().eq('user_id', user.id).eq('ticker', ticker)
    await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)

    setPortfolio({ ...portfolio, cash: newCash })
    setTrades(trades.filter(tr => tr.ticker !== ticker))
    setMessage(`✅ Sold all ${ticker} for $${value.toFixed(2)}!`)
  }

  function getHolding(ticker: string) {
    const tickerTrades = trades.filter(tr => tr.ticker === ticker)
    if (tickerTrades.length === 0) return null
    const shares = tickerTrades.reduce((sum, tr) => sum + tr.shares, 0)
    const avgPrice = tickerTrades.reduce((sum, tr) => sum + tr.price_at_purchase, 0) / tickerTrades.length
    return { shares, avgPrice }
  }

  function getAllHeldTickers() {
    return [...new Set(trades.map(tr => tr.ticker))]
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (!user || loading) return (
    <p style={{ fontFamily: 'monospace', padding: 40 }}>Loading...</p>
  )

  const portfolioValue = trades.reduce((sum, trade) => {
    if (selectedStock?.ticker === trade.ticker) {
      return sum + trade.shares * selectedStock.price
    }
    return sum + trade.shares * trade.price_at_purchase
  }, 0)

  return (
    <div style={{ fontFamily: 'monospace', padding: 40, maxWidth: 1200, margin: '0 auto', background: t.bg, color: t.text, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ color: t.text }}>📈 Stock Simulator</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: t.subtext, fontSize: 13 }}>{user.email}</span>
          <button onClick={() => setDarkMode(!darkMode)}
            style={{ padding: '8px 14px', cursor: 'pointer', background: darkMode ? '#fff' : '#111', color: darkMode ? '#111' : '#fff', border: 'none', borderRadius: 4, fontFamily: 'monospace' }}>
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button onClick={handleLogout}
            style={{ padding: '8px 14px', cursor: 'pointer', background: 'transparent', border: `1px solid ${t.border}`, color: t.text, borderRadius: 4, fontFamily: 'monospace' }}>
            Logout
          </button>
        </div>
      </div>

      {message && (
        <div style={{ background: darkMode ? '#0d2e0d' : '#f0fff0', border: '1px solid #ccc', padding: 12, borderRadius: 6, marginBottom: 16, color: t.text }}>
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
        {[
          { label: '💰 Cash', value: `$${portfolio?.cash?.toFixed(2)}` },
          { label: '📊 Portfolio Value', value: `$${portfolioValue.toFixed(2)}` },
          { label: '💼 Total Value', value: `$${(portfolio?.cash + portfolioValue).toFixed(2)}` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: t.card, padding: 20, borderRadius: 8, border: `1px solid ${t.border}` }}>
            <p style={{ color: t.subtext, marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 24, fontWeight: 'bold', color: t.text }}>{value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>

        {/* Search + Buy */}
        <div>
          <h2 style={{ marginBottom: 16, color: t.text }}>🔍 Find a Stock</h2>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Search ticker e.g. AAPL, SHOP, UBER..."
              value={searchTicker}
              onChange={e => setSearchTicker(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1, padding: 10, borderRadius: 4, border: `1px solid ${t.inputBorder}`, fontFamily: 'monospace', background: t.input, color: t.text }}
            />
            <button onClick={handleSearch}
              style={{ padding: '10px 20px', background: '#4a90e2', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}>
              {searchLoading ? '...' : 'Search'}
            </button>
          </div>

          {searchError && (
            <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{searchError}</p>
          )}

          {selectedStock && (
            <div style={{ background: t.buyCard, border: `1px solid ${t.buyBorder}`, padding: 20, borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ color: t.text, margin: 0 }}>{selectedStock.ticker}</h3>
                  {getHolding(selectedStock.ticker) && (
                    <p style={{ fontSize: 12, color: '#4a90e2', marginTop: 4 }}>
                      You own {getHolding(selectedStock.ticker)?.shares.toFixed(4)} shares
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 28, fontWeight: 'bold', color: t.text, margin: 0 }}>${selectedStock.price?.toFixed(2)}</p>
                </div>
              </div>

              <input
                type="number"
                placeholder="Amount in $ (e.g. 500)"
                value={buyAmount}
                onChange={e => setBuyAmount(e.target.value)}
                style={{ width: '100%', padding: 10, marginBottom: 8, borderRadius: 4, border: `1px solid ${t.inputBorder}`, fontFamily: 'monospace', background: t.input, color: t.text, boxSizing: 'border-box' as const }}
              />
              {buyAmount && parseFloat(buyAmount) > 0 && (
                <p style={{ fontSize: 12, color: t.subtext, marginBottom: 12 }}>
                  ≈ {(parseFloat(buyAmount) / selectedStock.price).toFixed(4)} shares
                </p>
              )}
              <button onClick={handleBuy}
                style={{ width: '100%', padding: 12, background: '#22c55e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold' }}>
                Buy {selectedStock.ticker}
              </button>
              {getHolding(selectedStock.ticker) && (
                <button onClick={() => handleSell(selectedStock.ticker)}
                  style={{ width: '100%', padding: 12, background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 14, marginTop: 8 }}>
                  Sell All {selectedStock.ticker}
                </button>
              )}
            </div>
          )}

          {!selectedStock && !searchError && (
            <div style={{ color: t.subtext, fontSize: 13, marginTop: 8 }}>
              <p>Try searching: AAPL, TSLA, NVDA, MSFT, SHOP, UBER, SPOT, AMD, SPY</p>
            </div>
          )}
        </div>

        {/* Holdings */}
        <div>
          <h2 style={{ marginBottom: 16, color: t.text }}>💼 My Holdings</h2>
          {getAllHeldTickers().length === 0 ? (
            <p style={{ color: t.subtext }}>No holdings yet — search a stock to buy!</p>
          ) : (
            getAllHeldTickers().map(ticker => {
              const holding = getHolding(ticker)
              if (!holding) return null
              const currentPrice = selectedStock?.ticker === ticker ? selectedStock.price : holding.avgPrice
              const currentValue = holding.shares * currentPrice
              const costBasis = holding.shares * holding.avgPrice
              const gain = currentValue - costBasis
              const isLive = selectedStock?.ticker === ticker
              return (
                <div key={ticker} style={{ background: t.card, border: `1px solid ${t.border}`, padding: 16, borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={{ fontWeight: 'bold', fontSize: 16, color: t.text }}>{ticker}</p>
                        {!isLive && <span style={{ fontSize: 10, color: t.subtext, border: `1px solid ${t.border}`, padding: '2px 6px', borderRadius: 3 }}>search to refresh</span>}
                      </div>
                      <p style={{ fontSize: 12, color: t.subtext }}>
                        {holding.shares.toFixed(4)} shares @ avg ${holding.avgPrice.toFixed(2)}
                      </p>
                      <p style={{ fontSize: 12, color: t.subtext }}>Cost basis: ${costBasis.toFixed(2)}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontWeight: 'bold', color: t.text }}>
                        {isLive ? `$${currentValue.toFixed(2)}` : '—'}
                      </p>
                      {isLive && (
                        <p style={{ color: gain >= 0 ? '#22c55e' : '#ef4444', fontSize: 13 }}>
                          {gain >= 0 ? '+' : ''}${gain.toFixed(2)} ({((gain / costBasis) * 100).toFixed(2)}%)
                        </p>
                      )}
                      <button onClick={() => handleSell(ticker)}
                        style={{ marginTop: 8, padding: '4px 12px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 }}>
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