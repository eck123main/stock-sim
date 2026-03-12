'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { searchStock } from '../../lib/stocks'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [portfolio, setPortfolio] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStock, setSelectedStock] = useState<any>(null)
  const [livePrices, setLivePrices] = useState<Record<string, number>>({})
  const [buyAmount, setBuyAmount] = useState('')
  const [message, setMessage] = useState('')
  const [searchTicker, setSearchTicker] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [darkMode, setDarkMode] = useState(false)
  const [tab, setTab] = useState<'market' | 'advisor'>('market')
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', text: string }[]>([
    { role: 'assistant', text: "Hi! I'm your AI stock advisor. Ask me anything about your portfolio, stocks to consider, or investing concepts. Remember — this is a simulator for learning!" }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const t = {
    bg: darkMode ? '#0a0a0f' : '#f8f9fa',
    card: darkMode ? '#1a1a2e' : '#ffffff',
    border: darkMode ? '#2a2a4a' : '#e0e0e0',
    text: darkMode ? '#e8e8f0' : '#111111',
    subtext: darkMode ? '#888' : '#666',
    input: darkMode ? '#111128' : '#ffffff',
    inputBorder: darkMode ? '#2a2a4a' : '#cccccc',
    buyCard: darkMode ? '#0d1a2e' : '#f0f8ff',
    buyBorder: darkMode ? '#1a4a8a' : '#4a90e2',
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      setUser(user)

      const { data: portfolio } = await supabase
        .from('portfolios').select('*').eq('id', user.id).single()
      setPortfolio(portfolio)

      const { data: tradesData } = await supabase
        .from('trades').select('*').eq('user_id', user.id)
      const loadedTrades = tradesData || []
      setTrades(loadedTrades)
      setLoading(false)

      const heldTickers = [...new Set(loadedTrades.map((t: any) => t.ticker))]
      const prices: Record<string, number> = {}
      for (const ticker of heldTickers) {
        const result = await searchStock(ticker as string)
        if (!result.error && result.price) prices[ticker as string] = result.price
        await new Promise(r => setTimeout(r, 500))
      }
      setLivePrices(prices)
    }
    load()
  }, [])

  async function handleSearch() {
    if (!searchTicker.trim()) return
    setSearchLoading(true)
    setSearchError('')
    setSelectedStock(null)
    const result = await searchStock(searchTicker.trim().toUpperCase())
    if (result.error) {
      setSearchError(`Could not find "${searchTicker}" — try a valid ticker like AAPL or SHOP`)
    } else {
      setSelectedStock(result)
      setLivePrices(prev => ({ ...prev, [result.ticker]: result.price }))
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
      user_id: user.id, ticker: selectedStock.ticker,
      company_name: selectedStock.ticker, shares,
      price_at_purchase: selectedStock.price,
    })
    await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)

    setPortfolio({ ...portfolio, cash: newCash })
    setTrades(prev => [...prev, { ticker: selectedStock.ticker, shares, price_at_purchase: selectedStock.price }])
    setBuyAmount('')
    setMessage(`✅ Bought ${shares.toFixed(4)} shares of ${selectedStock.ticker}!`)
  }

  async function handleSell(ticker: string) {
    const holding = getHolding(ticker)
    if (!holding) return
    const price = livePrices[ticker] || holding.avgPrice
    const value = holding.shares * price
    const newCash = portfolio.cash + value

    await supabase.from('trades').delete().eq('user_id', user.id).eq('ticker', ticker)
    await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)

    setPortfolio({ ...portfolio, cash: newCash })
    setTrades(prev => prev.filter(tr => tr.ticker !== ticker))
    if (selectedStock?.ticker === ticker) setSelectedStock(null)
    setMessage(`✅ Sold all ${ticker} for $${value.toFixed(2)}!`)
  }

  async function handleChat() {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setChatLoading(true)

    const holdings = getAllHeldTickers().map(ticker => {
      const holding = getHolding(ticker)!
      const currentPrice = livePrices[ticker] || null
      const gain = currentPrice ? (holding.shares * currentPrice) - (holding.shares * holding.avgPrice) : null
      return { ticker, shares: holding.shares, avgPrice: holding.avgPrice, currentPrice, gain }
    })

    const portfolioContext = {
      cash: portfolio.cash,
      totalValue: portfolio.cash + getAllHeldTickers().reduce((sum, ticker) => {
        const holding = getHolding(ticker)!
        return sum + holding.shares * (livePrices[ticker] || holding.avgPrice)
      }, 0),
      holdings,
    }

    try {
      const res = await fetch('/api/advisor', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: userMsg, portfolio: portfolioContext }),
})
const data = await res.json()
console.log('ADVISOR RESPONSE:', data)
setChatMessages(prev => [...prev, { role: 'assistant', text: data.reply || 'Sorry, something went wrong.' }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Failed to connect to advisor. Try again!' }])
    }
    setChatLoading(false)
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
    <div style={{ background: t.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontFamily: 'monospace', color: t.text }}>Loading...</p>
    </div>
  )

  const portfolioValue = getAllHeldTickers().reduce((sum, ticker) => {
    const holding = getHolding(ticker)
    if (!holding) return sum
    return sum + holding.shares * (livePrices[ticker] || holding.avgPrice)
  }, 0)

  const POPULAR = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'NFLX', 'SHOP', 'UBER', 'AMD', 'COIN', 'SPY', 'QQQ']

  return (
    <div style={{ background: t.bg, minHeight: '100vh', color: t.text }}>
      <div style={{ fontFamily: 'monospace', padding: '32px 48px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <h1 style={{ margin: 0 }}>📈 Stock Simulator</h1>
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
          <div style={{ background: darkMode ? '#0d2e0d' : '#f0fff0', border: '1px solid #ccc', padding: 12, borderRadius: 6, marginBottom: 16 }}>
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
              <p style={{ color: t.subtext, margin: '0 0 4px 0' }}>{label}</p>
              <p style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: `2px solid ${t.border}` }}>
          {(['market', 'advisor'] as const).map(tabName => (
            <button key={tabName} onClick={() => setTab(tabName)}
              style={{
                padding: '10px 24px', cursor: 'pointer', background: 'transparent',
                border: 'none', borderBottom: tab === tabName ? '2px solid #4a90e2' : '2px solid transparent',
                marginBottom: -2, color: tab === tabName ? '#4a90e2' : t.subtext,
                fontFamily: 'monospace', fontSize: 14, fontWeight: tab === tabName ? 'bold' : 'normal'
              }}>
              {tabName === 'market' ? '📊 Market' : '🤖 AI Advisor'}
            </button>
          ))}
        </div>

        {tab === 'market' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>

            {/* Search + Buy */}
            <div>
              <h2 style={{ marginBottom: 16 }}>🔍 Find a Stock</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="text" placeholder="Search ticker e.g. AAPL, SHOP, UBER..."
                  value={searchTicker} onChange={e => setSearchTicker(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  style={{ flex: 1, padding: 10, borderRadius: 4, border: `1px solid ${t.inputBorder}`, fontFamily: 'monospace', background: t.input, color: t.text }} />
                <button onClick={handleSearch}
                  style={{ padding: '10px 20px', background: '#4a90e2', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {searchLoading ? '...' : 'Search'}
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {POPULAR.map(ticker => (
                  <button key={ticker} onClick={async () => {
                    setSearchTicker(ticker)
                    setSearchLoading(true)
                    setSearchError('')
                    setSelectedStock(null)
                    const result = await searchStock(ticker)
                    if (!result.error) {
                      setSelectedStock(result)
                      setLivePrices(prev => ({ ...prev, [result.ticker]: result.price }))
                    }
                    setSearchLoading(false)
                  }} style={{ padding: '4px 10px', background: t.card, border: `1px solid ${t.border}`, borderRadius: 20, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12, color: t.text }}>
                    {ticker}
                  </button>
                ))}
              </div>

              {searchError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{searchError}</p>}

              {selectedStock && (
                <div style={{ background: t.buyCard, border: `1px solid ${t.buyBorder}`, padding: 20, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{selectedStock.ticker}</h3>
                      {getHolding(selectedStock.ticker) && (
                        <p style={{ fontSize: 12, color: '#4a90e2', margin: '4px 0 0 0' }}>
                          You own {getHolding(selectedStock.ticker)?.shares.toFixed(4)} shares
                        </p>
                      )}
                    </div>
                    <p style={{ fontSize: 28, fontWeight: 'bold', margin: 0 }}>${selectedStock.price?.toFixed(2)}</p>
                  </div>
                  <input type="number" placeholder="Amount in $ (e.g. 500)" value={buyAmount}
                    onChange={e => setBuyAmount(e.target.value)}
                    style={{ width: '100%', padding: 10, marginBottom: 8, borderRadius: 4, border: `1px solid ${t.inputBorder}`, fontFamily: 'monospace', background: t.input, color: t.text, boxSizing: 'border-box' as const }} />
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
            </div>

            {/* Holdings */}
            <div>
              <h2 style={{ marginBottom: 16 }}>💼 My Holdings</h2>
              {getAllHeldTickers().length === 0 ? (
                <p style={{ color: t.subtext }}>No holdings yet — search a stock to buy!</p>
              ) : getAllHeldTickers().map(ticker => {
                const holding = getHolding(ticker)
                if (!holding) return null
                const livePrice = livePrices[ticker]
                const currentValue = holding.shares * (livePrice || holding.avgPrice)
                const costBasis = holding.shares * holding.avgPrice
                const gain = livePrice ? currentValue - costBasis : null
                return (
                  <div key={ticker} style={{ background: t.card, border: `1px solid ${t.border}`, padding: 16, borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ fontWeight: 'bold', fontSize: 16, margin: 0 }}>{ticker}</p>
                          {livePrice ? <span style={{ fontSize: 10, color: '#22c55e' }}>● live</span>
                            : <span style={{ fontSize: 10, color: t.subtext }}>loading...</span>}
                        </div>
                        <p style={{ fontSize: 12, color: t.subtext, margin: '4px 0 0 0' }}>{holding.shares.toFixed(4)} shares @ avg ${holding.avgPrice.toFixed(2)}</p>
                        <p style={{ fontSize: 12, color: t.subtext, margin: '2px 0 0 0' }}>Cost basis: ${costBasis.toFixed(2)}</p>
                        {livePrice && <p style={{ fontSize: 12, color: t.subtext, margin: '2px 0 0 0' }}>Current price: ${livePrice.toFixed(2)}</p>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 'bold', margin: 0 }}>${currentValue.toFixed(2)}</p>
                        {gain !== null && (
                          <p style={{ color: gain >= 0 ? '#22c55e' : '#ef4444', fontSize: 13, margin: '2px 0 0 0' }}>
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
              })}
            </div>
          </div>
        )}

        {tab === 'advisor' && (
          <div style={{ maxWidth: 700 }}>
            <h2 style={{ marginBottom: 4 }}>🤖 AI Stock Advisor</h2>
            <p style={{ color: t.subtext, fontSize: 12, marginBottom: 16 }}>Powered by Claude · For educational purposes only, not real financial advice</p>

            {/* Chat messages */}
            <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: 16, height: 400, overflowY: 'auto', marginBottom: 12 }}>
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ marginBottom: 16, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%', padding: '10px 14px', borderRadius: 8,
                    background: msg.role === 'user' ? '#4a90e2' : t.bg,
                    color: msg.role === 'user' ? 'white' : t.text,
                    border: msg.role === 'assistant' ? `1px solid ${t.border}` : 'none',
                    fontSize: 13, lineHeight: 1.5
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '10px 14px', borderRadius: 8, background: t.bg, border: `1px solid ${t.border}`, color: t.subtext, fontSize: 13 }}>
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Suggested questions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {['How is my portfolio doing?', 'What should I buy next?', 'Explain diversification', 'Am I taking too much risk?'].map(q => (
                <button key={q} onClick={() => setChatInput(q)}
                  style={{ padding: '4px 10px', background: t.card, border: `1px solid ${t.border}`, borderRadius: 20, cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, color: t.subtext }}>
                  {q}
                </button>
              ))}
            </div>

            {/* Input */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="Ask about your portfolio or stocks..."
                value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChat()}
                style={{ flex: 1, padding: 10, borderRadius: 4, border: `1px solid ${t.inputBorder}`, fontFamily: 'monospace', background: t.input, color: t.text }} />
              <button onClick={handleChat} disabled={chatLoading}
                style={{ padding: '10px 20px', background: chatLoading ? t.border : '#4a90e2', color: 'white', border: 'none', borderRadius: 4, cursor: chatLoading ? 'default' : 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}>
                Send
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}