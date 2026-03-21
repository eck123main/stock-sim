'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { searchStock } from '../../lib/stocks'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [portfolio, setPortfolio] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [tradeHistory, setTradeHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStock, setSelectedStock] = useState<any>(null)
  const [livePrices, setLivePrices] = useState<Record<string, number>>({})
  const [buyAmount, setBuyAmount] = useState('')
  const [message, setMessage] = useState('')
  const [searchTicker, setSearchTicker] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [darkMode, setDarkMode] = useState(false)
  const [tab, setTab] = useState<'market' | 'history' | 'advisor'>('market')
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', text: string }[]>([
    { role: 'assistant', text: "Hi! I'm your AI stock advisor. Ask me anything about your portfolio, stocks to consider, or investing concepts. Remember — this is a simulator for learning!" }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const t = {
    bg: darkMode ? '#0f0f1e' : 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)',
    card: darkMode ? 'linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)' : '#ffffff',
    border: darkMode ? '#2a2a4a' : '#e0e7ed',
    text: darkMode ? '#e8e8f0' : '#1a202c',
    subtext: darkMode ? '#9ca3af' : '#64748b',
    input: darkMode ? '#1a1a2e' : '#ffffff',
    inputBorder: darkMode ? '#374151' : '#cbd5e1',
    buyCard: darkMode ? 'linear-gradient(145deg, #1e3a5f 0%, #0f2847 100%)' : 'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%)',
    buyBorder: darkMode ? '#3b82f6' : '#60a5fa',
    accent: '#667eea',
    accentGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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

      const { data: historyData } = await supabase
        .from('trade_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setTradeHistory(historyData || [])

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

    // Log to history
    const historyEntry = {
      user_id: user.id,
      ticker: selectedStock.ticker,
      action: 'BUY',
      shares,
      price: selectedStock.price,
      total_value: dollars,
      profit_loss: null,
    }
    await supabase.from('trade_history').insert(historyEntry)

    await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)

    setPortfolio({ ...portfolio, cash: newCash })
    setTrades(prev => [...prev, { ticker: selectedStock.ticker, shares, price_at_purchase: selectedStock.price }])
    setTradeHistory(prev => [{ ...historyEntry, created_at: new Date().toISOString() }, ...prev])
    setBuyAmount('')
    setMessage(`✅ Bought ${shares.toFixed(4)} shares of ${selectedStock.ticker}!`)
  }

  async function handleSell(ticker: string) {
    const holding = getHolding(ticker)
    if (!holding) return
    const price = livePrices[ticker] || holding.avgPrice
    const value = holding.shares * price
    const profitLoss = value - (holding.shares * holding.avgPrice)
    const newCash = portfolio.cash + value

    await supabase.from('trades').delete().eq('user_id', user.id).eq('ticker', ticker)

    // Log to history
    const historyEntry = {
      user_id: user.id,
      ticker,
      action: 'SELL',
      shares: holding.shares,
      price,
      total_value: value,
      profit_loss: profitLoss,
    }
    await supabase.from('trade_history').insert(historyEntry)

    await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)

    setPortfolio({ ...portfolio, cash: newCash })
    setTrades(prev => prev.filter(tr => tr.ticker !== ticker))
    setTradeHistory(prev => [{ ...historyEntry, created_at: new Date().toISOString() }, ...prev])
    if (selectedStock?.ticker === ticker) setSelectedStock(null)
    setMessage(`✅ Sold all ${ticker} for $${value.toFixed(2)}! P&L: ${profitLoss >= 0 ? '+' : ''}$${profitLoss.toFixed(2)}`)
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
    <div style={{ background: darkMode ? '#0f0f1e' : '#f5f7fa', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>📈</div>
        <p style={{ fontFamily: 'monospace', color: darkMode ? '#9ca3af' : '#64748b', fontSize: 18 }}>Loading your portfolio...</p>
      </div>
    </div>
  )

  const portfolioValue = getAllHeldTickers().reduce((sum, ticker) => {
    const holding = getHolding(ticker)
    if (!holding) return sum
    return sum + holding.shares * (livePrices[ticker] || holding.avgPrice)
  }, 0)

  const totalPnl = getAllHeldTickers().reduce((sum, ticker) => {
    const holding = getHolding(ticker)
    if (!holding) return sum
    const livePrice = livePrices[ticker]
    if (!livePrice) return sum
    return sum + (holding.shares * livePrice) - (holding.shares * holding.avgPrice)
  }, 0)

  const POPULAR = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'NFLX', 'SHOP', 'UBER', 'AMD', 'COIN', 'SPY', 'QQQ']

  return (
    <div style={{ background: darkMode ? '#0f0f1e' : '#f5f7fa', minHeight: '100vh', color: t.text }}>
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '48px 60px', maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 48,
          padding: '28px 36px',
          background: t.card,
          borderRadius: 20,
          boxShadow: darkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.06)',
          border: `1px solid ${t.border}`
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span>📈</span>
              <span>Stock Simulator</span>
            </h1>
            <p style={{ margin: '6px 0 0 0', color: t.subtext, fontSize: 16 }}>{user.email}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => setDarkMode(!darkMode)}
              style={{
                padding: '12px 22px',
                cursor: 'pointer',
                background: darkMode ? '#fff' : '#1a202c',
                color: darkMode ? '#1a202c' : '#fff',
                border: 'none',
                borderRadius: 12,
                fontFamily: 'inherit',
                fontSize: 15,
                fontWeight: 500,
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
              }}>
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button onClick={handleLogout}
              style={{
                padding: '12px 22px',
                cursor: 'pointer',
                background: 'transparent',
                border: `2px solid ${t.border}`,
                color: t.text,
                borderRadius: 12,
                fontFamily: 'inherit',
                fontSize: 15,
                fontWeight: 500,
                transition: 'all 0.2s'
              }}>
              Logout
            </button>
          </div>
        </div>

        {message && (
          <div style={{
            background: darkMode ? 'rgba(16, 185, 129, 0.1)' : '#ecfdf5',
            border: `2px solid ${darkMode ? '#10b981' : '#6ee7b7'}`,
            padding: '16px 24px',
            borderRadius: 14,
            marginBottom: 28,
            fontSize: 16,
            color: darkMode ? '#6ee7b7' : '#047857',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.1)'
          }}>
            {message}
          </div>
        )}

        <button onClick={async () => {
          const newCash = portfolio.cash + 10000
          await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)
          setPortfolio({ ...portfolio, cash: newCash })
          setMessage('💸 Added $10,000!')
        }} style={{
          marginBottom: 40,
          padding: '14px 28px',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: 'white',
          border: 'none',
          borderRadius: 12,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 16,
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
          transition: 'all 0.2s'
        }}>
          💸 Add $10,000
        </button>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, marginBottom: 48 }}>
          <div style={{
            background: t.card,
            padding: 28,
            borderRadius: 18,
            border: `1px solid ${t.border}`,
            boxShadow: darkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.06)',
            transition: 'transform 0.2s',
          }}>
            <p style={{ color: t.subtext, margin: '0 0 10px 0', fontSize: 15, fontWeight: 500 }}>💰 Cash Available</p>
            <p style={{ fontSize: 32, fontWeight: 700, margin: 0, color: t.text }}>${portfolio?.cash?.toFixed(2)}</p>
          </div>
          <div style={{
            background: t.card,
            padding: 28,
            borderRadius: 18,
            border: `1px solid ${t.border}`,
            boxShadow: darkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.06)',
            transition: 'transform 0.2s',
          }}>
            <p style={{ color: t.subtext, margin: '0 0 10px 0', fontSize: 15, fontWeight: 500 }}>📊 Portfolio Value</p>
            <p style={{ fontSize: 32, fontWeight: 700, margin: 0, color: t.text }}>${portfolioValue.toFixed(2)}</p>
          </div>
          <div style={{
            background: t.card,
            padding: 28,
            borderRadius: 18,
            border: `1px solid ${t.border}`,
            boxShadow: darkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.06)',
            transition: 'transform 0.2s',
          }}>
            <p style={{ color: t.subtext, margin: '0 0 10px 0', fontSize: 15, fontWeight: 500 }}>💼 Total Value</p>
            <p style={{ fontSize: 32, fontWeight: 700, margin: 0, color: t.text }}>${(portfolio?.cash + portfolioValue).toFixed(2)}</p>
          </div>
          <div style={{
            background: totalPnl >= 0
              ? (darkMode ? 'linear-gradient(145deg, #065f46 0%, #064e3b 100%)' : 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)')
              : (darkMode ? 'linear-gradient(145deg, #991b1b 0%, #7f1d1d 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'),
            padding: 28,
            borderRadius: 18,
            border: `2px solid ${totalPnl >= 0 ? (darkMode ? '#10b981' : '#6ee7b7') : (darkMode ? '#ef4444' : '#fca5a5')}`,
            boxShadow: darkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.12)',
            transition: 'transform 0.2s',
          }}>
            <p style={{ color: totalPnl >= 0 ? (darkMode ? '#d1fae5' : '#065f46') : (darkMode ? '#fecaca' : '#991b1b'), margin: '0 0 10px 0', fontSize: 15, fontWeight: 600 }}>
              📈 Total P&L
            </p>
            <p style={{
              fontSize: 32,
              fontWeight: 700,
              margin: 0,
              color: totalPnl >= 0 ? (darkMode ? '#6ee7b7' : '#059669') : (darkMode ? '#fca5a5' : '#dc2626')
            }}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          marginBottom: 36,
          background: t.card,
          padding: 8,
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          gap: 8,
          boxShadow: darkMode ? '0 2px 12px rgba(0, 0, 0, 0.3)' : '0 1px 4px rgba(0, 0, 0, 0.04)'
        }}>
          {(['market', 'history', 'advisor'] as const).map(tabName => (
            <button key={tabName} onClick={() => setTab(tabName)}
              style={{
                flex: 1,
                padding: '14px 24px',
                cursor: 'pointer',
                background: tab === tabName ? t.accentGradient : 'transparent',
                border: 'none',
                borderRadius: 10,
                color: tab === tabName ? '#ffffff' : t.subtext,
                fontFamily: 'inherit',
                fontSize: 16,
                fontWeight: tab === tabName ? 600 : 500,
                transition: 'all 0.2s',
                boxShadow: tab === tabName ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none'
              }}>
              {tabName === 'market' ? '📊 Market' : tabName === 'history' ? '📋 History' : '🤖 AI Advisor'}
            </button>
          ))}
        </div>

        {tab === 'market' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36 }}>
            <div>
              <h2 style={{ marginBottom: 24, fontSize: 24, fontWeight: 700 }}>🔍 Find a Stock</h2>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <input type="text" placeholder="Search ticker (e.g., AAPL, SHOP)..."
                  value={searchTicker} onChange={e => setSearchTicker(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  style={{
                    flex: 1,
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: `2px solid ${t.inputBorder}`,
                    fontFamily: 'inherit',
                    background: t.input,
                    color: t.text,
                    fontSize: 16,
                    transition: 'all 0.2s'
                  }} />
                <button onClick={handleSearch}
                  style={{
                    padding: '14px 28px',
                    background: t.accentGradient,
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    fontSize: 16,
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                    transition: 'all 0.2s'
                  }}>
                  {searchLoading ? '...' : 'Search'}
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
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
                  }} style={{
                    padding: '8px 16px',
                    background: t.card,
                    border: `2px solid ${t.border}`,
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: 500,
                    color: t.text,
                    transition: 'all 0.2s',
                    boxShadow: darkMode ? '0 1px 4px rgba(0, 0, 0, 0.2)' : 'none'
                  }}>
                    {ticker}
                  </button>
                ))}
              </div>

              {searchError && (
                <div style={{
                  color: '#ef4444',
                  fontSize: 15,
                  marginBottom: 20,
                  padding: '12px 16px',
                  background: darkMode ? 'rgba(239, 68, 68, 0.1)' : '#fee',
                  border: `1px solid ${darkMode ? '#dc2626' : '#fcc'}`,
                  borderRadius: 10
                }}>
                  {searchError}
                </div>
              )}

              {selectedStock && (
                <div style={{
                  background: t.buyCard,
                  border: `2px solid ${t.buyBorder}`,
                  padding: 28,
                  borderRadius: 18,
                  boxShadow: darkMode ? '0 8px 24px rgba(0, 0, 0, 0.4)' : '0 4px 16px rgba(59, 130, 246, 0.15)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{selectedStock.ticker}</h3>
                      {getHolding(selectedStock.ticker) && (
                        <p style={{ fontSize: 15, color: darkMode ? '#60a5fa' : '#3b82f6', margin: '8px 0 0 0', fontWeight: 500 }}>
                          You own {getHolding(selectedStock.ticker)?.shares.toFixed(4)} shares
                        </p>
                      )}
                    </div>
                    <p style={{ fontSize: 36, fontWeight: 700, margin: 0, color: darkMode ? '#60a5fa' : '#3b82f6' }}>
                      ${selectedStock.price?.toFixed(2)}
                    </p>
                  </div>
                  <input type="number" placeholder="Amount in $ (e.g., 500)" value={buyAmount}
                    onChange={e => setBuyAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      marginBottom: 12,
                      borderRadius: 12,
                      border: `2px solid ${t.inputBorder}`,
                      fontFamily: 'inherit',
                      background: t.input,
                      color: t.text,
                      boxSizing: 'border-box' as const,
                      fontSize: 16
                    }} />
                  {buyAmount && parseFloat(buyAmount) > 0 && (
                    <p style={{ fontSize: 15, color: t.subtext, marginBottom: 16, fontWeight: 500 }}>
                      ≈ {(parseFloat(buyAmount) / selectedStock.price).toFixed(4)} shares
                    </p>
                  )}
                  <button onClick={handleBuy}
                    style={{
                      width: '100%',
                      padding: '16px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 16,
                      fontWeight: 600,
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                      transition: 'all 0.2s'
                    }}>
                    Buy {selectedStock.ticker}
                  </button>
                  {getHolding(selectedStock.ticker) && (
                    <button onClick={() => handleSell(selectedStock.ticker)}
                      style={{
                        width: '100%',
                        padding: '16px',
                        background: 'transparent',
                        color: '#ef4444',
                        border: '2px solid #ef4444',
                        borderRadius: 12,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 16,
                        fontWeight: 600,
                        marginTop: 12,
                        transition: 'all 0.2s'
                      }}>
                      Sell All {selectedStock.ticker}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <h2 style={{ marginBottom: 24, fontSize: 24, fontWeight: 700 }}>💼 My Holdings</h2>
              {getAllHeldTickers().length === 0 ? (
                <div style={{
                  padding: 48,
                  textAlign: 'center',
                  background: t.card,
                  borderRadius: 18,
                  border: `2px dashed ${t.border}`,
                  color: t.subtext
                }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
                  <p style={{ margin: 0, fontSize: 17, fontWeight: 500 }}>No holdings yet</p>
                  <p style={{ margin: '6px 0 0 0', fontSize: 15 }}>Search a stock to start!</p>
                </div>
              ) : getAllHeldTickers().map(ticker => {
                const holding = getHolding(ticker)
                if (!holding) return null
                const livePrice = livePrices[ticker]
                const currentValue = holding.shares * (livePrice || holding.avgPrice)
                const costBasis = holding.shares * holding.avgPrice
                const gain = livePrice ? currentValue - costBasis : null
                const gainPercent = gain ? (gain / costBasis) * 100 : 0
                return (
                  <div key={ticker} style={{
                    background: t.card,
                    border: `1px solid ${t.border}`,
                    padding: 24,
                    borderRadius: 18,
                    marginBottom: 16,
                    boxShadow: darkMode ? '0 2px 12px rgba(0, 0, 0, 0.3)' : '0 1px 6px rgba(0, 0, 0, 0.04)',
                    transition: 'all 0.2s'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                          <p style={{ fontWeight: 700, fontSize: 20, margin: 0 }}>{ticker}</p>
                          {livePrice ? (
                            <span style={{
                              fontSize: 12,
                              color: '#10b981',
                              background: darkMode ? 'rgba(16, 185, 129, 0.1)' : '#d1fae5',
                              padding: '3px 10px',
                              borderRadius: 12,
                              fontWeight: 600
                            }}>● LIVE</span>
                          ) : (
                            <span style={{
                              fontSize: 12,
                              color: t.subtext,
                              background: darkMode ? 'rgba(156, 163, 175, 0.1)' : '#f1f5f9',
                              padding: '3px 10px',
                              borderRadius: 12
                            }}>loading...</span>
                          )}
                        </div>
                        <p style={{ fontSize: 14, color: t.subtext, margin: '0 0 5px 0' }}>
                          {holding.shares.toFixed(4)} shares @ avg ${holding.avgPrice.toFixed(2)}
                        </p>
                        <p style={{ fontSize: 14, color: t.subtext, margin: '0 0 5px 0' }}>
                          Cost: ${costBasis.toFixed(2)}
                        </p>
                        {livePrice && (
                          <p style={{ fontSize: 14, color: t.subtext, margin: 0 }}>
                            Current: ${livePrice.toFixed(2)}
                          </p>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 700, margin: '0 0 10px 0', fontSize: 22 }}>${currentValue.toFixed(2)}</p>
                        {gain !== null && (
                          <div style={{
                            padding: '8px 14px',
                            borderRadius: 10,
                            background: gain >= 0
                              ? (darkMode ? 'rgba(16, 185, 129, 0.15)' : '#d1fae5')
                              : (darkMode ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2'),
                            marginBottom: 12
                          }}>
                            <p style={{
                              color: gain >= 0 ? '#10b981' : '#ef4444',
                              fontSize: 16,
                              margin: 0,
                              fontWeight: 700
                            }}>
                              {gain >= 0 ? '+' : ''}${gain.toFixed(2)}
                            </p>
                            <p style={{
                              color: gain >= 0 ? '#10b981' : '#ef4444',
                              fontSize: 13,
                              margin: '3px 0 0 0',
                              fontWeight: 600
                            }}>
                              {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%
                            </p>
                          </div>
                        )}
                        <button onClick={() => handleSell(ticker)}
                          style={{
                            padding: '10px 18px',
                            background: 'transparent',
                            color: '#ef4444',
                            border: '2px solid #ef4444',
                            borderRadius: 10,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 14,
                            fontWeight: 600,
                            transition: 'all 0.2s'
                          }}>
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

        {tab === 'history' && (
          <div>
            <h2 style={{ marginBottom: 28, fontSize: 24, fontWeight: 700 }}>📋 Trade History</h2>
            {tradeHistory.length === 0 ? (
              <div style={{
                padding: 72,
                textAlign: 'center',
                background: t.card,
                borderRadius: 18,
                border: `2px dashed ${t.border}`,
                color: t.subtext
              }}>
                <div style={{ fontSize: 64, marginBottom: 20 }}>📋</div>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>No trades yet</p>
                <p style={{ margin: '8px 0 0 0', fontSize: 16 }}>Buy or sell a stock to see your history!</p>
              </div>
            ) : (
              <div>
                {/* Summary stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, marginBottom: 36 }}>
                  <div style={{
                    background: t.card,
                    padding: 24,
                    borderRadius: 18,
                    border: `1px solid ${t.border}`,
                    boxShadow: darkMode ? '0 2px 12px rgba(0, 0, 0, 0.3)' : '0 1px 6px rgba(0, 0, 0, 0.04)'
                  }}>
                    <p style={{ color: t.subtext, margin: '0 0 10px 0', fontSize: 14, fontWeight: 500 }}>Total Trades</p>
                    <p style={{ fontSize: 32, fontWeight: 700, margin: 0, color: t.text }}>{tradeHistory.length}</p>
                  </div>
                  <div style={{
                    background: t.card,
                    padding: 24,
                    borderRadius: 18,
                    border: `1px solid ${t.border}`,
                    boxShadow: darkMode ? '0 2px 12px rgba(0, 0, 0, 0.3)' : '0 1px 6px rgba(0, 0, 0, 0.04)'
                  }}>
                    <p style={{ color: t.subtext, margin: '0 0 10px 0', fontSize: 14, fontWeight: 500 }}>Realised P&L</p>
                    {(() => {
                      const realised = tradeHistory
                        .filter(h => h.action === 'SELL' && h.profit_loss !== null)
                        .reduce((sum, h) => sum + h.profit_loss, 0)
                      return <p style={{
                        fontSize: 32,
                        fontWeight: 700,
                        margin: 0,
                        color: realised >= 0 ? '#10b981' : '#ef4444'
                      }}>
                        {realised >= 0 ? '+' : ''}${realised.toFixed(2)}
                      </p>
                    })()}
                  </div>
                  <div style={{
                    background: t.card,
                    padding: 24,
                    borderRadius: 18,
                    border: `1px solid ${t.border}`,
                    boxShadow: darkMode ? '0 2px 12px rgba(0, 0, 0, 0.3)' : '0 1px 6px rgba(0, 0, 0, 0.04)'
                  }}>
                    <p style={{ color: t.subtext, margin: '0 0 10px 0', fontSize: 14, fontWeight: 500 }}>Winning Trades</p>
                    {(() => {
                      const sells = tradeHistory.filter(h => h.action === 'SELL' && h.profit_loss !== null)
                      const wins = sells.filter(h => h.profit_loss > 0).length
                      return <p style={{ fontSize: 32, fontWeight: 700, margin: 0, color: t.text }}>
                        {wins}/{sells.length}
                      </p>
                    })()}
                  </div>
                </div>

                {/* Trade log */}
                <div style={{
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  borderRadius: 18,
                  overflow: 'hidden',
                  boxShadow: darkMode ? '0 2px 12px rgba(0, 0, 0, 0.3)' : '0 1px 6px rgba(0, 0, 0, 0.04)'
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 110px 110px 120px 120px',
                    padding: '16px 24px',
                    background: darkMode ? 'rgba(0, 0, 0, 0.2)' : '#f8fafc',
                    color: t.subtext,
                    fontSize: 14,
                    fontWeight: 600,
                    borderBottom: `1px solid ${t.border}`
                  }}>
                    <span>Date</span>
                    <span>Ticker</span>
                    <span>Action</span>
                    <span>Shares</span>
                    <span>Price</span>
                    <span style={{ textAlign: 'right' }}>P&L</span>
                  </div>
                  {tradeHistory.map((h, i) => (
                    <div key={i} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 90px 110px 110px 120px 120px',
                      padding: '16px 24px',
                      borderBottom: i < tradeHistory.length - 1 ? `1px solid ${t.border}` : 'none',
                      fontSize: 14,
                      transition: 'background 0.2s'
                    }}>
                      <span style={{ color: t.subtext }}>
                        {new Date(h.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ fontWeight: 700 }}>{h.ticker}</span>
                      <span style={{
                        color: h.action === 'BUY' ? '#10b981' : '#ef4444',
                        fontWeight: 700,
                        background: h.action === 'BUY'
                          ? (darkMode ? 'rgba(16, 185, 129, 0.1)' : '#d1fae5')
                          : (darkMode ? 'rgba(239, 68, 68, 0.1)' : '#fee2e2'),
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 13,
                        display: 'inline-block'
                      }}>
                        {h.action}
                      </span>
                      <span>{parseFloat(h.shares).toFixed(4)}</span>
                      <span>${parseFloat(h.price).toFixed(2)}</span>
                      <span style={{
                        textAlign: 'right',
                        color: h.profit_loss === null ? t.subtext : h.profit_loss >= 0 ? '#10b981' : '#ef4444',
                        fontWeight: 700
                      }}>
                        {h.profit_loss === null ? '—' : `${h.profit_loss >= 0 ? '+' : ''}$${parseFloat(h.profit_loss).toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'advisor' && (
          <div style={{ maxWidth: 900 }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ marginBottom: 10, fontSize: 24, fontWeight: 700 }}>🤖 AI Stock Advisor</h2>
              <p style={{ color: t.subtext, fontSize: 15, margin: 0 }}>Powered by Claude · For educational purposes only, not real financial advice</p>
            </div>

            <div style={{
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: 18,
              padding: 24,
              height: 500,
              overflowY: 'auto',
              marginBottom: 20,
              boxShadow: darkMode ? '0 2px 12px rgba(0, 0, 0, 0.3)' : '0 1px 6px rgba(0, 0, 0, 0.04)'
            }}>
              {chatMessages.map((msg, i) => (
                <div key={i} style={{
                  marginBottom: 18,
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}>
                  <div style={{
                    maxWidth: '80%',
                    padding: '14px 18px',
                    borderRadius: 14,
                    background: msg.role === 'user'
                      ? t.accentGradient
                      : (darkMode ? '#1a1a2e' : '#f8fafc'),
                    color: msg.role === 'user' ? 'white' : t.text,
                    border: msg.role === 'assistant' ? `1px solid ${t.border}` : 'none',
                    fontSize: 15,
                    lineHeight: 1.6,
                    boxShadow: msg.role === 'user'
                      ? '0 2px 8px rgba(102, 126, 234, 0.3)'
                      : (darkMode ? '0 1px 4px rgba(0, 0, 0, 0.2)' : 'none')
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{
                    padding: '14px 18px',
                    borderRadius: 14,
                    background: darkMode ? '#1a1a2e' : '#f8fafc',
                    border: `1px solid ${t.border}`,
                    color: t.subtext,
                    fontSize: 15
                  }}>
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              {['How is my portfolio doing?', 'What should I buy next?', 'Explain diversification', 'Am I taking too much risk?'].map(q => (
                <button key={q} onClick={() => setChatInput(q)}
                  style={{
                    padding: '10px 16px',
                    background: t.card,
                    border: `1px solid ${t.border}`,
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    color: t.subtext,
                    transition: 'all 0.2s',
                    fontWeight: 500
                  }}>
                  {q}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <input type="text" placeholder="Ask about your portfolio or stocks..."
                value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChat()}
                style={{
                  flex: 1,
                  padding: '14px 18px',
                  borderRadius: 12,
                  border: `2px solid ${t.inputBorder}`,
                  fontFamily: 'inherit',
                  background: t.input,
                  color: t.text,
                  fontSize: 16,
                  transition: 'all 0.2s'
                }} />
              <button onClick={handleChat} disabled={chatLoading}
                style={{
                  padding: '14px 28px',
                  background: chatLoading ? t.border : t.accentGradient,
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  cursor: chatLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: 16,
                  boxShadow: chatLoading ? 'none' : '0 4px 12px rgba(102, 126, 234, 0.3)',
                  transition: 'all 0.2s'
                }}>
                Send
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}