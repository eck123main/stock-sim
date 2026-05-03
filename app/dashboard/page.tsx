'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { searchStock } from '../../lib/stocks'
import PortfolioChart from '../../components/PortfolioChart'
import StockPerformanceChart from '../../components/StockPerformanceChart'
import PortfolioComposition from '../../components/PortfolioComposition'
import StockDetailChart from '../../components/StockDetailChart'

// Helper function to format currency with commas
function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Helper function to group trades by time period
function groupTradesByPeriod(trades: any[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

  const groups = {
    today: [] as any[],
    thisWeek: [] as any[],
    thisMonth: [] as any[],
    earlier: [] as any[]
  }

  trades.forEach(trade => {
    const tradeDate = new Date(trade.created_at)
    if (tradeDate >= today) {
      groups.today.push(trade)
    } else if (tradeDate >= weekAgo) {
      groups.thisWeek.push(trade)
    } else if (tradeDate >= monthAgo) {
      groups.thisMonth.push(trade)
    } else {
      groups.earlier.push(trade)
    }
  })

  return groups
}

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
  const [tab, setTab] = useState<'market' | 'history' | 'advisor' | 'analytics'>('market')
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [refreshingPrices, setRefreshingPrices] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', text: string }[]>([
    { role: 'assistant', text: "Hi! I'm your AI stock advisor. Ask me anything about your portfolio, stocks to consider, or investing concepts. Remember — this is a simulator for learning!" }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [portfolioSnapshots, setPortfolioSnapshots] = useState<any[]>([])
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [pendingOrders, setPendingOrders] = useState<any[]>([])
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [orderType, setOrderType] = useState<'LIMIT_BUY' | 'LIMIT_SELL' | 'STOP_LOSS'>('LIMIT_BUY')
  const [orderPrice, setOrderPrice] = useState('')
  const [orderAmount, setOrderAmount] = useState('')
  const [priceAlerts, setPriceAlerts] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [alertType, setAlertType] = useState<'ABOVE' | 'BELOW'>('ABOVE')
  const [alertPrice, setAlertPrice] = useState('')
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

      // Fetch ALL trade history - no limits
      const { data: historyData, error: historyError } = await supabase
        .from('trade_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10000) // Set a very high limit to ensure we get everything

      if (historyError) {
        console.error('Error fetching trade history:', historyError)
      }
      setTradeHistory(historyData || [])

      // Fetch portfolio snapshots
      const { data: snapshotsData } = await supabase
        .from('portfolio_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(100)
      setPortfolioSnapshots(snapshotsData || [])

      // Fetch user watchlist
      const { data: watchlistData } = await supabase
        .from('user_watchlists')
        .select('ticker')
        .eq('user_id', user.id)
        .order('added_at', { ascending: false })
      setWatchlist(watchlistData?.map(w => w.ticker) || [])

      // Fetch pending orders
      const { data: ordersData } = await supabase
        .from('pending_orders')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
      setPendingOrders(ordersData || [])

      // Fetch price alerts
      const { data: alertsData } = await supabase
        .from('price_alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      setPriceAlerts(alertsData || [])

      // Fetch unread notifications
      const { data: notificationsData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(10)
      setNotifications(notificationsData || [])

      setLoading(false)

      // Load cached prices from localStorage
      const cachedPrices = localStorage.getItem('stock_prices')
      const cachedTimestamp = localStorage.getItem('stock_prices_timestamp')
      if (cachedPrices) {
        setLivePrices(JSON.parse(cachedPrices))
      }
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

  async function savePortfolioSnapshot() {
    if (!user || !portfolio) return

    const holdingsValue = getAllHeldTickers().reduce((sum, ticker) => {
      const holding = getHolding(ticker)
      if (!holding) return sum
      return sum + holding.shares * (livePrices[ticker] || holding.avgPrice)
    }, 0)

    const totalValue = portfolio.cash + holdingsValue

    await supabase.from('portfolio_snapshots').insert({
      user_id: user.id,
      portfolio_value: totalValue,
      cash: portfolio.cash,
      holdings_value: holdingsValue
    })

    // Fetch updated snapshots
    const { data: snapshotsData } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(100)
    setPortfolioSnapshots(snapshotsData || [])
  }

  async function addToWatchlist(ticker: string) {
    if (watchlist.includes(ticker)) {
      setMessage(`${ticker} is already in your watchlist!`)
      return
    }

    const { error } = await supabase.from('user_watchlists').insert({
      user_id: user.id,
      ticker
    })

    if (error) {
      setMessage(`Failed to add ${ticker} to watchlist`)
      return
    }

    setWatchlist(prev => [ticker, ...prev])
    setMessage(`✅ Added ${ticker} to your watchlist!`)
  }

  async function removeFromWatchlist(ticker: string) {
    await supabase
      .from('user_watchlists')
      .delete()
      .eq('user_id', user.id)
      .eq('ticker', ticker)

    setWatchlist(prev => prev.filter(t => t !== ticker))
    setMessage(`Removed ${ticker} from watchlist`)
  }

  async function createOrder() {
    if (!selectedStock || !orderPrice) {
      setMessage('Please enter a target price')
      return
    }

    const targetPrice = parseFloat(orderPrice)
    if (isNaN(targetPrice) || targetPrice <= 0) {
      setMessage('Please enter a valid price')
      return
    }

    // Validation for different order types
    if (orderType === 'LIMIT_BUY') {
      if (!orderAmount) {
        setMessage('Please enter an amount')
        return
      }
      const amount = parseFloat(orderAmount)
      if (isNaN(amount) || amount <= 0) {
        setMessage('Please enter a valid amount')
        return
      }
      if (amount > portfolio.cash) {
        setMessage('Not enough cash!')
        return
      }

      // Create limit buy order
      await supabase.from('pending_orders').insert({
        user_id: user.id,
        ticker: selectedStock.ticker,
        order_type: 'LIMIT_BUY',
        shares: 0, // Will be calculated when executed
        target_price: targetPrice,
        amount: amount
      })

      setMessage(`✅ Limit buy order created: Buy ${selectedStock.ticker} when price ≤ $${formatCurrency(targetPrice)}`)
    } else if (orderType === 'LIMIT_SELL' || orderType === 'STOP_LOSS') {
      const holding = getHolding(selectedStock.ticker)
      if (!holding) {
        setMessage(`You don't own any ${selectedStock.ticker}`)
        return
      }

      await supabase.from('pending_orders').insert({
        user_id: user.id,
        ticker: selectedStock.ticker,
        order_type: orderType,
        shares: holding.shares,
        target_price: targetPrice,
        amount: null
      })

      const orderName = orderType === 'LIMIT_SELL' ? 'Limit sell' : 'Stop-loss'
      const condition = orderType === 'LIMIT_SELL' ? '≥' : '≤'
      setMessage(`✅ ${orderName} order created: Sell ${holding.shares.toFixed(4)} ${selectedStock.ticker} when price ${condition} $${formatCurrency(targetPrice)}`)
    }

    // Refresh pending orders
    const { data: ordersData } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
    setPendingOrders(ordersData || [])

    setShowOrderModal(false)
    setOrderPrice('')
    setOrderAmount('')
  }

  async function cancelOrder(orderId: string) {
    await supabase
      .from('pending_orders')
      .update({ status: 'CANCELLED' })
      .eq('id', orderId)

    setPendingOrders(prev => prev.filter(o => o.id !== orderId))
    setMessage('Order cancelled')
  }

  async function checkAndExecuteOrders() {
    if (pendingOrders.length === 0) return

    for (const order of pendingOrders) {
      const currentPrice = livePrices[order.ticker]
      if (!currentPrice) continue

      let shouldExecute = false

      if (order.order_type === 'LIMIT_BUY' && currentPrice <= order.target_price) {
        shouldExecute = true
      } else if (order.order_type === 'LIMIT_SELL' && currentPrice >= order.target_price) {
        shouldExecute = true
      } else if (order.order_type === 'STOP_LOSS' && currentPrice <= order.target_price) {
        shouldExecute = true
      }

      if (shouldExecute) {
        // Execute the order
        if (order.order_type === 'LIMIT_BUY') {
          const shares = order.amount / currentPrice
          const newCash = portfolio.cash - order.amount

          await supabase.from('trades').insert({
            user_id: user.id,
            ticker: order.ticker,
            company_name: order.ticker,
            shares,
            price_at_purchase: currentPrice
          })

          await supabase.from('trade_history').insert({
            user_id: user.id,
            ticker: order.ticker,
            company_name: order.ticker,
            action: 'BUY',
            shares,
            price: currentPrice,
            total_value: order.amount,
            profit_loss: null
          })

          await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)

          setPortfolio({ ...portfolio, cash: newCash })
          setTrades(prev => [...prev, { ticker: order.ticker, shares, price_at_purchase: currentPrice }])

          setMessage(`🎯 Limit buy executed: Bought ${shares.toFixed(4)} ${order.ticker} at $${formatCurrency(currentPrice)}!`)
        } else {
          // LIMIT_SELL or STOP_LOSS
          const value = order.shares * currentPrice
          const holding = getHolding(order.ticker)
          const profitLoss = holding ? value - (order.shares * holding.avgPrice) : 0
          const newCash = portfolio.cash + value

          await supabase.from('trades').delete().eq('user_id', user.id).eq('ticker', order.ticker)

          await supabase.from('trade_history').insert({
            user_id: user.id,
            ticker: order.ticker,
            action: 'SELL',
            shares: order.shares,
            price: currentPrice,
            total_value: value,
            profit_loss: profitLoss
          })

          await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)

          setPortfolio({ ...portfolio, cash: newCash })
          setTrades(prev => prev.filter(tr => tr.ticker !== order.ticker))

          const orderName = order.order_type === 'STOP_LOSS' ? 'Stop-loss' : 'Limit sell'
          setMessage(`🎯 ${orderName} executed: Sold ${order.shares.toFixed(4)} ${order.ticker} at $${formatCurrency(currentPrice)}!`)
        }

        // Mark order as executed
        await supabase
          .from('pending_orders')
          .update({ status: 'EXECUTED', executed_at: new Date().toISOString() })
          .eq('id', order.id)

        savePortfolioSnapshot()
      }
    }

    // Refresh pending orders
    const { data: ordersData } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
    setPendingOrders(ordersData || [])
  }

  async function createPriceAlert() {
    if (!selectedStock || !alertPrice) {
      setMessage('Please enter a target price')
      return
    }

    const targetPrice = parseFloat(alertPrice)
    if (isNaN(targetPrice) || targetPrice <= 0) {
      setMessage('Please enter a valid price')
      return
    }

    await supabase.from('price_alerts').insert({
      user_id: user.id,
      ticker: selectedStock.ticker,
      target_price: targetPrice,
      alert_type: alertType,
      is_active: true
    })

    // Refresh alerts
    const { data: alertsData } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    setPriceAlerts(alertsData || [])

    setShowAlertModal(false)
    setAlertPrice('')
    setMessage(`✅ Price alert created: Notify when ${selectedStock.ticker} goes ${alertType === 'ABOVE' ? 'above' : 'below'} $${targetPrice.toFixed(2)}`)
  }

  async function deleteAlert(alertId: string) {
    await supabase
      .from('price_alerts')
      .update({ is_active: false })
      .eq('id', alertId)

    setPriceAlerts(prev => prev.filter(a => a.id !== alertId))
    setMessage('Alert deleted')
  }

  async function markNotificationRead(notificationId: string) {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)

    setNotifications(prev => prev.filter(n => n.id !== notificationId))
  }

  async function markAllNotificationsRead() {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    setNotifications([])
  }

  async function checkPriceAlerts() {
    if (!user) return

    // Get prices for all tickers with alerts
    const alertTickers = [...new Set(priceAlerts.map(a => a.ticker))]
    const prices: Record<string, number> = {}

    for (const ticker of alertTickers) {
      const result = await searchStock(ticker)
      if (!result.error && result.price) {
        prices[ticker] = result.price
      }
    }

    // Call API to check and trigger alerts
    await fetch('/api/check-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, currentPrices: prices })
    })

    // Refresh alerts and notifications
    const { data: alertsData } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    setPriceAlerts(alertsData || [])

    const { data: notificationsData } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10)
    setNotifications(notificationsData || [])
  }

  async function handleRefreshPrices() {
    setRefreshingPrices(true)
    setMessage('')

    const heldTickers = [...new Set(trades.map((t: any) => t.ticker))]
    const prices: Record<string, number> = {}

    for (const ticker of heldTickers) {
      const result = await searchStock(ticker as string)
      if (!result.error && result.price) {
        prices[ticker as string] = result.price
      }
      await new Promise(r => setTimeout(r, 500))
    }

    setLivePrices(prices)
    // Save to localStorage with timestamp
    localStorage.setItem('stock_prices', JSON.stringify(prices))
    localStorage.setItem('stock_prices_timestamp', Date.now().toString())
    setRefreshingPrices(false)
    setMessage('✅ Prices refreshed successfully!')

    // Check and execute any pending orders
    await checkAndExecuteOrders()

    // Check price alerts
    await checkPriceAlerts()
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
    setMessage(`✅ Bought ${shares.toFixed(4)} shares of ${selectedStock.ticker} for $${formatCurrency(dollars)}!`)

    // Save portfolio snapshot
    savePortfolioSnapshot()
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
    setMessage(`✅ Sold all ${ticker} for $${formatCurrency(value)}! P&L: ${profitLoss >= 0 ? '+' : ''}$${formatCurrency(Math.abs(profitLoss))}`)

    // Save portfolio snapshot
    savePortfolioSnapshot()
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

  async function handleDeposit(presetAmount?: number) {
    const amount = presetAmount || parseFloat(depositAmount)
    if (isNaN(amount) || amount <= 0) {
      setMessage('Please enter a valid amount')
      return
    }
    if (amount > 1000000) {
      setMessage('Maximum deposit is $1,000,000')
      return
    }
    const newCash = portfolio.cash + amount
    await supabase.from('portfolios').update({ cash: newCash }).eq('id', user.id)
    setPortfolio({ ...portfolio, cash: newCash })
    setShowDepositModal(false)
    setDepositAmount('')
    setMessage(`💰 Deposited $${formatCurrency(amount)}`)
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
    <div style={{ background: darkMode ? '#0a0a15' : '#f8fafc', minHeight: '100vh', color: t.text }}>
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '48px 60px', maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 48,
          padding: '32px 40px',
          background: darkMode ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' : '#ffffff',
          borderRadius: 24,
          boxShadow: darkMode ? '0 8px 32px rgba(0, 0, 0, 0.5)' : '0 4px 20px rgba(0, 0, 0, 0.08)',
          border: `1px solid ${darkMode ? 'rgba(102, 126, 234, 0.2)' : '#e2e8f0'}`,
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = darkMode ? '0 12px 40px rgba(0, 0, 0, 0.6)' : '0 8px 30px rgba(0, 0, 0, 0.12)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = darkMode ? '0 8px 32px rgba(0, 0, 0, 0.5)' : '0 4px 20px rgba(0, 0, 0, 0.08)'
        }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: 36,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              background: darkMode ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              <span style={{ fontSize: 40 }}>📈</span>
              <span>Stock Simulator</span>
            </h1>
            <p style={{ margin: '8px 0 0 0', color: t.subtext, fontSize: 15, fontWeight: 500 }}>{user.email}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setDarkMode(!darkMode)}
              style={{
                padding: '14px 24px',
                cursor: 'pointer',
                background: darkMode ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                fontFamily: 'inherit',
                fontSize: 15,
                fontWeight: 600,
                transition: 'all 0.2s',
                boxShadow: darkMode ? '0 4px 12px rgba(251, 191, 36, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = darkMode ? '0 6px 20px rgba(251, 191, 36, 0.5)' : '0 6px 20px rgba(0, 0, 0, 0.4)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = darkMode ? '0 4px 12px rgba(251, 191, 36, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}>
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button onClick={handleLogout}
              style={{
                padding: '14px 24px',
                cursor: 'pointer',
                background: 'transparent',
                border: `2px solid ${darkMode ? 'rgba(102, 126, 234, 0.4)' : '#cbd5e1'}`,
                color: t.text,
                borderRadius: 14,
                fontFamily: 'inherit',
                fontSize: 15,
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = darkMode ? 'rgba(102, 126, 234, 0.1)' : '#f1f5f9'
                e.currentTarget.style.borderColor = darkMode ? 'rgba(102, 126, 234, 0.6)' : '#94a3b8'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = darkMode ? 'rgba(102, 126, 234, 0.4)' : '#cbd5e1'
                e.currentTarget.style.transform = 'translateY(0)'
              }}>
              Logout
            </button>
          </div>
        </div>

        {message && (
          <div style={{
            background: darkMode ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%)' : 'linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%)',
            border: `2px solid ${darkMode ? '#10b981' : '#6ee7b7'}`,
            padding: '18px 28px',
            borderRadius: 16,
            marginBottom: 32,
            fontSize: 16,
            fontWeight: 600,
            color: darkMode ? '#6ee7b7' : '#047857',
            boxShadow: darkMode ? '0 4px 20px rgba(16, 185, 129, 0.25)' : '0 4px 20px rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'slideDown 0.3s ease-out'
          }}>
            <span style={{ fontSize: 20 }}>✓</span>
            <span>{message}</span>
          </div>
        )}

        {/* Notifications */}
        {notifications.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>🔔</span>
                <span>Notifications</span>
                <span style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 14,
                  fontWeight: 700
                }}>
                  {notifications.length}
                </span>
              </h3>
              <button onClick={markAllNotificationsRead} style={{
                padding: '10px 20px',
                background: 'transparent',
                color: t.subtext,
                border: `2px solid ${darkMode ? 'rgba(102, 126, 234, 0.3)' : '#cbd5e1'}`,
                borderRadius: 12,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = darkMode ? 'rgba(102, 126, 234, 0.1)' : '#f1f5f9'
                e.currentTarget.style.borderColor = darkMode ? 'rgba(102, 126, 234, 0.5)' : '#94a3b8'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = darkMode ? 'rgba(102, 126, 234, 0.3)' : '#cbd5e1'
              }}>
                Mark all as read
              </button>
            </div>
            {notifications.map(notif => (
              <div key={notif.id} style={{
                background: notif.type === 'PRICE_ALERT'
                  ? (darkMode ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.1) 100%)' : 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)')
                  : (darkMode ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.1) 100%)' : 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)'),
                border: `2px solid ${notif.type === 'PRICE_ALERT' ? (darkMode ? 'rgba(251, 191, 36, 0.4)' : '#fbbf24') : (darkMode ? 'rgba(96, 165, 250, 0.4)' : '#60a5fa')}`,
                padding: '18px 24px',
                borderRadius: 16,
                marginBottom: 12,
                fontSize: 15,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: notif.type === 'PRICE_ALERT'
                  ? (darkMode ? '0 4px 16px rgba(245, 158, 11, 0.2)' : '0 4px 16px rgba(245, 158, 11, 0.15)')
                  : (darkMode ? '0 4px 16px rgba(59, 130, 246, 0.2)' : '0 4px 16px rgba(59, 130, 246, 0.15)'),
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateX(8px)'
                e.currentTarget.style.borderWidth = '3px'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateX(0)'
                e.currentTarget.style.borderWidth = '2px'
              }}>
                <div>
                  <p style={{
                    margin: '0 0 6px 0',
                    fontWeight: 700,
                    fontSize: 16,
                    color: notif.type === 'PRICE_ALERT' ? (darkMode ? '#fbbf24' : '#d97706') : (darkMode ? '#60a5fa' : '#2563eb')
                  }}>
                    {notif.title}
                  </p>
                  <p style={{
                    margin: 0,
                    color: t.text,
                    fontWeight: 500
                  }}>
                    {notif.message}
                  </p>
                </div>
                <button onClick={() => markNotificationRead(notif.id)} style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  color: t.subtext,
                  border: `2px solid ${darkMode ? 'rgba(148, 163, 184, 0.3)' : '#cbd5e1'}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = darkMode ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2'
                  e.currentTarget.style.borderColor = '#ef4444'
                  e.currentTarget.style.color = '#ef4444'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = darkMode ? 'rgba(148, 163, 184, 0.3)' : '#cbd5e1'
                  e.currentTarget.style.color = t.subtext
                }}>
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setShowDepositModal(true)} style={{
          marginBottom: 40,
          padding: '16px 32px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: 'none',
          borderRadius: 16,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 17,
          fontWeight: 700,
          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-4px) scale(1.05)'
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(102, 126, 234, 0.5)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.4)'
        }}>
          <span style={{ fontSize: 20 }}>💰</span>
          <span>Deposit Funds</span>
        </button>

        {/* Deposit Modal */}
        {showDepositModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }} onClick={() => setShowDepositModal(false)}>
            <div style={{
              background: darkMode ? '#1a1a2e' : '#ffffff',
              borderRadius: 20,
              padding: '40px',
              maxWidth: 500,
              width: '100%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              border: `1px solid ${t.border}`
            }} onClick={e => e.stopPropagation()}>
              <h2 style={{ margin: '0 0 10px 0', fontSize: 28, fontWeight: 700 }}>💰 Deposit Funds</h2>
              <p style={{ color: t.subtext, margin: '0 0 28px 0', fontSize: 15 }}>Add virtual cash to your trading account</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
                {[1000, 5000, 10000, 50000].map(amount => (
                  <button key={amount} onClick={() => handleDeposit(amount)} style={{
                    padding: '16px',
                    background: t.card,
                    border: `2px solid ${t.border}`,
                    borderRadius: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 18,
                    fontWeight: 600,
                    color: t.text,
                    transition: 'all 0.2s'
                  }}>
                    ${formatCurrency(amount)}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 15, fontWeight: 500, color: t.text }}>Custom Amount</label>
                <input
                  type="number"
                  placeholder="Enter amount"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleDeposit()}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: `2px solid ${t.inputBorder}`,
                    fontFamily: 'inherit',
                    background: t.input,
                    color: t.text,
                    fontSize: 16,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => handleDeposit()} style={{
                  flex: 1,
                  padding: '14px',
                  background: t.accentGradient,
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 16,
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                  transition: 'all 0.2s'
                }}>
                  Deposit
                </button>
                <button onClick={() => {
                  setShowDepositModal(false)
                  setDepositAmount('')
                }} style={{
                  flex: 1,
                  padding: '14px',
                  background: 'transparent',
                  color: t.text,
                  border: `2px solid ${t.border}`,
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 16,
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Order Modal */}
        {showOrderModal && selectedStock && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }} onClick={() => setShowOrderModal(false)}>
            <div style={{
              background: darkMode ? '#1a1a2e' : '#ffffff',
              borderRadius: 20,
              padding: '40px',
              maxWidth: 500,
              width: '100%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              border: `1px solid ${t.border}`
            }} onClick={e => e.stopPropagation()}>
              <h2 style={{ margin: '0 0 10px 0', fontSize: 28, fontWeight: 700 }}>⏱️ Create Limit Order</h2>
              <p style={{ color: t.subtext, margin: '0 0 28px 0', fontSize: 15 }}>
                Set a target price for {selectedStock.ticker} (Current: ${formatCurrency(selectedStock.price || 0)})
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 15, fontWeight: 500, color: t.text }}>Order Type</label>
                <select
                  value={orderType}
                  onChange={e => setOrderType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: `2px solid ${t.inputBorder}`,
                    fontFamily: 'inherit',
                    background: t.input,
                    color: t.text,
                    fontSize: 16,
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="LIMIT_BUY">Limit Buy (Buy when price drops to...)</option>
                  <option value="LIMIT_SELL">Limit Sell (Sell when price rises to...)</option>
                  <option value="STOP_LOSS">Stop Loss (Sell when price drops to...)</option>
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 15, fontWeight: 500, color: t.text }}>Target Price</label>
                <input
                  type="number"
                  placeholder="Enter target price"
                  value={orderPrice}
                  onChange={e => setOrderPrice(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: `2px solid ${t.inputBorder}`,
                    fontFamily: 'inherit',
                    background: t.input,
                    color: t.text,
                    fontSize: 16,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {orderType === 'LIMIT_BUY' && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', marginBottom: 10, fontSize: 15, fontWeight: 500, color: t.text }}>Amount ($)</label>
                  <input
                    type="number"
                    placeholder="How much to invest"
                    value={orderAmount}
                    onChange={e => setOrderAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: 12,
                      border: `2px solid ${t.inputBorder}`,
                      fontFamily: 'inherit',
                      background: t.input,
                      color: t.text,
                      fontSize: 16,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={createOrder} style={{
                  flex: 1,
                  padding: '14px',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 16,
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                  transition: 'all 0.2s'
                }}>
                  Create Order
                </button>
                <button onClick={() => {
                  setShowOrderModal(false)
                  setOrderPrice('')
                  setOrderAmount('')
                }} style={{
                  flex: 1,
                  padding: '14px',
                  background: 'transparent',
                  color: t.text,
                  border: `2px solid ${t.border}`,
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 16,
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Price Alert Modal */}
        {showAlertModal && selectedStock && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }} onClick={() => setShowAlertModal(false)}>
            <div style={{
              background: darkMode ? '#1a1a2e' : '#ffffff',
              borderRadius: 20,
              padding: '40px',
              maxWidth: 500,
              width: '100%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              border: `1px solid ${t.border}`
            }} onClick={e => e.stopPropagation()}>
              <h2 style={{ margin: '0 0 10px 0', fontSize: 28, fontWeight: 700 }}>🔔 Create Price Alert</h2>
              <p style={{ color: t.subtext, margin: '0 0 28px 0', fontSize: 15 }}>
                Get notified when {selectedStock.ticker} reaches your target price (Current: ${formatCurrency(selectedStock.price || 0)})
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 15, fontWeight: 500, color: t.text }}>Alert Type</label>
                <select
                  value={alertType}
                  onChange={e => setAlertType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: `2px solid ${t.inputBorder}`,
                    fontFamily: 'inherit',
                    background: t.input,
                    color: t.text,
                    fontSize: 16,
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="ABOVE">Alert when price goes above target</option>
                  <option value="BELOW">Alert when price goes below target</option>
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 15, fontWeight: 500, color: t.text }}>Target Price</label>
                <input
                  type="number"
                  placeholder="Enter target price"
                  value={alertPrice}
                  onChange={e => setAlertPrice(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: `2px solid ${t.inputBorder}`,
                    fontFamily: 'inherit',
                    background: t.input,
                    color: t.text,
                    fontSize: 16,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={createPriceAlert} style={{
                  flex: 1,
                  padding: '14px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 16,
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                  transition: 'all 0.2s'
                }}>
                  Create Alert
                </button>
                <button onClick={() => {
                  setShowAlertModal(false)
                  setAlertPrice('')
                }} style={{
                  flex: 1,
                  padding: '14px',
                  background: 'transparent',
                  color: t.text,
                  border: `2px solid ${t.border}`,
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 16,
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 48 }}>
          <div style={{
            background: darkMode ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' : '#ffffff',
            padding: 32,
            borderRadius: 20,
            border: `1px solid ${darkMode ? 'rgba(59, 130, 246, 0.2)' : '#e2e8f0'}`,
            boxShadow: darkMode ? '0 8px 32px rgba(0, 0, 0, 0.5)' : '0 4px 20px rgba(0, 0, 0, 0.08)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'
            e.currentTarget.style.boxShadow = darkMode ? '0 12px 48px rgba(59, 130, 246, 0.3)' : '0 12px 40px rgba(59, 130, 246, 0.15)'
            e.currentTarget.style.borderColor = darkMode ? 'rgba(59, 130, 246, 0.5)' : '#3b82f6'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)'
            e.currentTarget.style.boxShadow = darkMode ? '0 8px 32px rgba(0, 0, 0, 0.5)' : '0 4px 20px rgba(0, 0, 0, 0.08)'
            e.currentTarget.style.borderColor = darkMode ? 'rgba(59, 130, 246, 0.2)' : '#e2e8f0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>💰</span>
              <p style={{ color: t.subtext, margin: 0, fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cash Available</p>
            </div>
            <p style={{ fontSize: 36, fontWeight: 800, margin: 0, color: t.text, letterSpacing: '-0.5px' }}>${formatCurrency(portfolio?.cash || 0)}</p>
          </div>
          <div style={{
            background: darkMode ? 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)' : 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
            padding: 32,
            borderRadius: 20,
            border: `1px solid ${darkMode ? 'rgba(167, 139, 250, 0.3)' : 'rgba(255, 255, 255, 0.4)'}`,
            boxShadow: '0 8px 32px rgba(124, 58, 237, 0.4)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'
            e.currentTarget.style.boxShadow = '0 16px 48px rgba(124, 58, 237, 0.5)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)'
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(124, 58, 237, 0.4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>📊</span>
              <p style={{ color: 'rgba(255, 255, 255, 0.9)', margin: 0, fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Portfolio Value</p>
            </div>
            <p style={{ fontSize: 36, fontWeight: 800, margin: 0, color: '#ffffff', letterSpacing: '-0.5px' }}>${formatCurrency(portfolioValue)}</p>
          </div>
          <div style={{
            background: darkMode ? 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)' : 'linear-gradient(135deg, #06b6d4 0%, #67e8f9 100%)',
            padding: 32,
            borderRadius: 20,
            border: `1px solid ${darkMode ? 'rgba(103, 232, 249, 0.3)' : 'rgba(255, 255, 255, 0.4)'}`,
            boxShadow: '0 8px 32px rgba(8, 145, 178, 0.4)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'
            e.currentTarget.style.boxShadow = '0 16px 48px rgba(8, 145, 178, 0.5)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)'
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(8, 145, 178, 0.4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>💼</span>
              <p style={{ color: 'rgba(255, 255, 255, 0.9)', margin: 0, fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Value</p>
            </div>
            <p style={{ fontSize: 36, fontWeight: 800, margin: 0, color: '#ffffff', letterSpacing: '-0.5px' }}>${formatCurrency((portfolio?.cash || 0) + portfolioValue)}</p>
          </div>
          <div style={{
            background: totalPnl >= 0
              ? (darkMode ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)')
              : (darkMode ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' : 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)'),
            padding: 32,
            borderRadius: 20,
            border: `2px solid ${totalPnl >= 0 ? (darkMode ? 'rgba(52, 211, 153, 0.4)' : 'rgba(255, 255, 255, 0.5)') : (darkMode ? 'rgba(248, 113, 113, 0.4)' : 'rgba(255, 255, 255, 0.5)')}`,
            boxShadow: totalPnl >= 0 ? '0 8px 32px rgba(16, 185, 129, 0.4)' : '0 8px 32px rgba(239, 68, 68, 0.4)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'
            e.currentTarget.style.boxShadow = totalPnl >= 0 ? '0 16px 48px rgba(16, 185, 129, 0.5)' : '0 16px 48px rgba(239, 68, 68, 0.5)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)'
            e.currentTarget.style.boxShadow = totalPnl >= 0 ? '0 8px 32px rgba(16, 185, 129, 0.4)' : '0 8px 32px rgba(239, 68, 68, 0.4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>{totalPnl >= 0 ? '📈' : '📉'}</span>
              <p style={{ color: 'rgba(255, 255, 255, 0.9)', margin: 0, fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total P&L</p>
            </div>
            <p style={{
              fontSize: 36,
              fontWeight: 800,
              margin: 0,
              color: '#ffffff',
              letterSpacing: '-0.5px'
            }}>
              {totalPnl >= 0 ? '+' : ''}${formatCurrency(Math.abs(totalPnl))}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          marginBottom: 40,
          background: darkMode ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
          padding: 6,
          borderRadius: 18,
          border: `1px solid ${darkMode ? 'rgba(102, 126, 234, 0.2)' : '#e2e8f0'}`,
          gap: 6,
          boxShadow: darkMode ? '0 4px 24px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.06)',
          backdropFilter: 'blur(10px)'
        }}>
          {(['market', 'history', 'analytics', 'advisor'] as const).map(tabName => (
            <button key={tabName} onClick={() => setTab(tabName)}
              style={{
                flex: 1,
                padding: '16px 28px',
                cursor: 'pointer',
                background: tab === tabName
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : 'transparent',
                border: 'none',
                borderRadius: 14,
                color: tab === tabName ? '#ffffff' : t.subtext,
                fontFamily: 'inherit',
                fontSize: 16,
                fontWeight: tab === tabName ? 700 : 600,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: tab === tabName ? '0 4px 16px rgba(102, 126, 234, 0.4)' : 'none',
                position: 'relative'
              }}
              onMouseEnter={e => {
                if (tab !== tabName) {
                  e.currentTarget.style.background = darkMode ? 'rgba(102, 126, 234, 0.15)' : '#f8fafc'
                  e.currentTarget.style.color = darkMode ? '#a5b4fc' : '#64748b'
                } else {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)'
                }
              }}
              onMouseLeave={e => {
                if (tab !== tabName) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = t.subtext
                } else {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)'
                }
              }}>
              {tabName === 'market' ? '📊 Market' : tabName === 'history' ? '📋 History' : tabName === 'analytics' ? '📈 Analytics' : '🤖 AI Advisor'}
            </button>
          ))}
        </div>

        {tab === 'market' && (
          <div>
            {/* Pending Orders Section */}
            {pendingOrders.length > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                padding: 28,
                borderRadius: 20,
                marginBottom: 32,
                boxShadow: '0 8px 32px rgba(139, 92, 246, 0.4)',
                border: '2px solid rgba(167, 139, 250, 0.3)',
                transition: 'all 0.3s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 12px 48px rgba(139, 92, 246, 0.5)'
                e.currentTarget.style.transform = 'translateY(-4px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(139, 92, 246, 0.4)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}>
                <h3 style={{
                  margin: '0 0 20px 0',
                  fontSize: 22,
                  fontWeight: 800,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <span style={{ fontSize: 28 }}>⏱️</span>
                  <span>Pending Orders</span>
                  <span style={{
                    background: 'rgba(255, 255, 255, 0.25)',
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 16,
                    fontWeight: 700
                  }}>
                    {pendingOrders.length}
                  </span>
                </h3>
                <div style={{ display: 'grid', gap: 14 }}>
                  {pendingOrders.map(order => (
                    <div key={order.id} style={{
                      background: 'rgba(255, 255, 255, 0.18)',
                      backdropFilter: 'blur(12px)',
                      padding: '18px 24px',
                      borderRadius: 14,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '2px solid rgba(255, 255, 255, 0.25)',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'
                      e.currentTarget.style.transform = 'translateX(8px)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)'
                      e.currentTarget.style.transform = 'translateX(0)'
                    }}>
                      <div>
                        <span style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{order.ticker}</span>
                        <span style={{ margin: '0 16px', color: 'rgba(255, 255, 255, 0.85)', fontSize: 16, fontWeight: 600 }}>
                          {order.order_type === 'LIMIT_BUY' ? '📥 Buy' : order.order_type === 'LIMIT_SELL' ? '📤 Sell' : '🛑 Stop-Loss'}
                        </span>
                        <span style={{ color: 'rgba(255, 255, 255, 0.95)', fontSize: 16, fontWeight: 600 }}>
                          {order.order_type === 'LIMIT_BUY' && `when ≤ $${formatCurrency(order.target_price)}`}
                          {order.order_type === 'LIMIT_SELL' && `when ≥ $${formatCurrency(order.target_price)}`}
                          {order.order_type === 'STOP_LOSS' && `when ≤ $${formatCurrency(order.target_price)}`}
                        </span>
                        {order.order_type === 'LIMIT_BUY' && (
                          <span style={{ marginLeft: 12, color: 'rgba(255, 255, 255, 0.7)', fontSize: 14, fontWeight: 600 }}>
                            (${formatCurrency(order.amount)})
                          </span>
                        )}
                      </div>
                      <button onClick={() => cancelOrder(order.id)} style={{
                        padding: '10px 20px',
                        background: 'rgba(239, 68, 68, 0.95)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 10,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 14,
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#dc2626'
                        e.currentTarget.style.transform = 'scale(1.05)'
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.95)'
                        e.currentTarget.style.transform = 'scale(1)'
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)'
                      }}>
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Price Alerts Section */}
            {priceAlerts.length > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
                padding: 28,
                borderRadius: 20,
                marginBottom: 32,
                boxShadow: '0 8px 32px rgba(245, 158, 11, 0.4)',
                border: '2px solid rgba(251, 191, 36, 0.3)',
                transition: 'all 0.3s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 12px 48px rgba(245, 158, 11, 0.5)'
                e.currentTarget.style.transform = 'translateY(-4px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(245, 158, 11, 0.4)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}>
                <h3 style={{
                  margin: '0 0 20px 0',
                  fontSize: 22,
                  fontWeight: 800,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <span style={{ fontSize: 28 }}>🔔</span>
                  <span>Active Price Alerts</span>
                  <span style={{
                    background: 'rgba(255, 255, 255, 0.25)',
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 16,
                    fontWeight: 700
                  }}>
                    {priceAlerts.length}
                  </span>
                </h3>
                <div style={{ display: 'grid', gap: 14 }}>
                  {priceAlerts.map(alert => (
                    <div key={alert.id} style={{
                      background: 'rgba(255, 255, 255, 0.18)',
                      backdropFilter: 'blur(12px)',
                      padding: '18px 24px',
                      borderRadius: 14,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '2px solid rgba(255, 255, 255, 0.25)',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'
                      e.currentTarget.style.transform = 'translateX(8px)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)'
                      e.currentTarget.style.transform = 'translateX(0)'
                    }}>
                      <div>
                        <span style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{alert.ticker}</span>
                        <span style={{ margin: '0 16px', color: 'rgba(255, 255, 255, 0.85)', fontSize: 16, fontWeight: 600 }}>
                          {alert.alert_type === 'ABOVE' ? '📈 Alert Above' : '📉 Alert Below'}
                        </span>
                        <span style={{ color: 'rgba(255, 255, 255, 0.95)', fontSize: 16, fontWeight: 600 }}>
                          ${formatCurrency(parseFloat(alert.target_price))}
                        </span>
                      </div>
                      <button onClick={() => deleteAlert(alert.id)} style={{
                        padding: '10px 20px',
                        background: 'rgba(239, 68, 68, 0.95)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 10,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 14,
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#dc2626'
                        e.currentTarget.style.transform = 'scale(1.05)'
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.95)'
                        e.currentTarget.style.transform = 'scale(1)'
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)'
                      }}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: t.subtext }}>
                  {watchlist.length > 0 ? '⭐ My Watchlist' : '🔥 Popular Stocks'}
                </h3>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
                {(watchlist.length > 0 ? watchlist : POPULAR).map(ticker => (
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
                    background: watchlist.includes(ticker)
                      ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                      : t.card,
                    border: watchlist.includes(ticker) ? 'none' : `2px solid ${t.border}`,
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: 500,
                    color: watchlist.includes(ticker) ? 'white' : t.text,
                    transition: 'all 0.2s',
                    boxShadow: watchlist.includes(ticker)
                      ? '0 2px 8px rgba(245, 158, 11, 0.3)'
                      : (darkMode ? '0 1px 4px rgba(0, 0, 0, 0.2)' : 'none')
                  }}>
                    {watchlist.includes(ticker) ? '⭐ ' : ''}{ticker}
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
                      ${formatCurrency(selectedStock.price || 0)}
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
                  <button onClick={() => watchlist.includes(selectedStock.ticker)
                      ? removeFromWatchlist(selectedStock.ticker)
                      : addToWatchlist(selectedStock.ticker)}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: 'transparent',
                      color: watchlist.includes(selectedStock.ticker) ? '#f59e0b' : t.text,
                      border: `2px solid ${watchlist.includes(selectedStock.ticker) ? '#f59e0b' : t.border}`,
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 15,
                      fontWeight: 600,
                      marginTop: 12,
                      transition: 'all 0.2s'
                    }}>
                    {watchlist.includes(selectedStock.ticker) ? '⭐ Remove from Watchlist' : '☆ Add to Watchlist'}
                  </button>
                  <button onClick={() => setShowOrderModal(true)}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: 'transparent',
                      color: '#8b5cf6',
                      border: '2px solid #8b5cf6',
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 15,
                      fontWeight: 600,
                      marginTop: 12,
                      transition: 'all 0.2s'
                    }}>
                    ⏱️ Create Limit Order
                  </button>
                  <button onClick={() => setShowAlertModal(true)}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: 'transparent',
                      color: '#f59e0b',
                      border: '2px solid #f59e0b',
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 15,
                      fontWeight: 600,
                      marginTop: 12,
                      transition: 'all 0.2s'
                    }}>
                    🔔 Set Price Alert
                  </button>
                </div>
                {tradeHistory.some(t => t.ticker === selectedStock.ticker) && (
                  <StockDetailChart ticker={selectedStock.ticker} trades={tradeHistory} darkMode={darkMode} />
                )}
              )}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>💼 My Holdings</h2>
                {getAllHeldTickers().length > 0 && (
                  <button
                    onClick={handleRefreshPrices}
                    disabled={refreshingPrices}
                    style={{
                      padding: '12px 20px',
                      background: refreshingPrices ? t.inputBorder : t.accentGradient,
                      color: 'white',
                      border: 'none',
                      borderRadius: 10,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: refreshingPrices ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: refreshingPrices ? 'none' : '0 2px 10px rgba(102, 126, 234, 0.3)'
                    }}>
                    {refreshingPrices ? '🔄 Refreshing...' : '🔄 Refresh Prices'}
                  </button>
                )}
              </div>
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
                          {holding.shares.toFixed(4)} shares @ avg ${formatCurrency(holding.avgPrice)}
                        </p>
                        <p style={{ fontSize: 14, color: t.subtext, margin: '0 0 5px 0' }}>
                          Cost: ${formatCurrency(costBasis)}
                        </p>
                        {livePrice && (
                          <p style={{ fontSize: 14, color: t.subtext, margin: 0 }}>
                            Current: ${formatCurrency(livePrice)}
                          </p>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 700, margin: '0 0 10px 0', fontSize: 22 }}>${formatCurrency(currentValue)}</p>
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
                              {gain >= 0 ? '+' : ''}${formatCurrency(Math.abs(gain))}
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
                        {realised >= 0 ? '+' : ''}${formatCurrency(Math.abs(realised))}
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

                {/* Trade log - grouped by time period */}
                {(() => {
                  const grouped = groupTradesByPeriod(tradeHistory)
                  const periods = [
                    { key: 'today', label: 'Today', trades: grouped.today },
                    { key: 'thisWeek', label: 'This Week', trades: grouped.thisWeek },
                    { key: 'thisMonth', label: 'This Month', trades: grouped.thisMonth },
                    { key: 'earlier', label: 'Earlier', trades: grouped.earlier }
                  ]

                  return periods.map(period => {
                    if (period.trades.length === 0) return null
                    return (
                      <div key={period.key} style={{ marginBottom: 32 }}>
                        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: t.text }}>{period.label}</h3>
                        <div style={{
                          background: t.card,
                          border: `1px solid ${t.border}`,
                          borderRadius: 18,
                          overflow: 'hidden',
                          boxShadow: darkMode ? '0 2px 12px rgba(0, 0, 0, 0.3)' : '0 1px 6px rgba(0, 0, 0, 0.04)'
                        }}>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 90px 110px 110px 130px 130px',
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
                          {period.trades.map((h, i) => (
                            <div key={i} style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 90px 110px 110px 130px 130px',
                              padding: '16px 24px',
                              borderBottom: i < period.trades.length - 1 ? `1px solid ${t.border}` : 'none',
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
                              <span>${formatCurrency(parseFloat(h.price))}</span>
                              <span style={{
                                textAlign: 'right',
                                color: h.profit_loss === null ? t.subtext : h.profit_loss >= 0 ? '#10b981' : '#ef4444',
                                fontWeight: 700
                              }}>
                                {h.profit_loss === null ? '—' : `${h.profit_loss >= 0 ? '+' : ''}$${formatCurrency(Math.abs(parseFloat(h.profit_loss)))}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })
                })()}
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

        {tab === 'analytics' && (
          <div>
            <div style={{ marginBottom: 36 }}>
              <h2 style={{ marginBottom: 10, fontSize: 24, fontWeight: 700 }}>📈 Portfolio Analytics</h2>
              <p style={{ color: t.subtext, fontSize: 15, margin: 0 }}>Visualize your performance and holdings</p>
            </div>

            {/* Portfolio Performance Over Time */}
            <div style={{
              background: t.card,
              padding: 32,
              borderRadius: 18,
              border: `1px solid ${t.border}`,
              boxShadow: darkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.06)',
              marginBottom: 28
            }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 600 }}>Portfolio Value Over Time</h3>
              <PortfolioChart
                data={portfolioSnapshots.map(s => ({
                  date: new Date(s.created_at).toLocaleDateString(),
                  value: parseFloat(s.portfolio_value),
                  timestamp: new Date(s.created_at).getTime()
                }))}
                darkMode={darkMode}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 28 }}>
              {/* Stock Performance */}
              <div style={{
                background: t.card,
                padding: 32,
                borderRadius: 18,
                border: `1px solid ${t.border}`,
                boxShadow: darkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.06)'
              }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 600 }}>Gains & Losses by Stock</h3>
                <StockPerformanceChart
                  holdings={getAllHeldTickers().map(ticker => {
                    const holding = getHolding(ticker)!
                    const currentPrice = livePrices[ticker] || holding.avgPrice
                    const gain = (holding.shares * currentPrice) - (holding.shares * holding.avgPrice)
                    return { ticker, gain, shares: holding.shares }
                  })}
                  darkMode={darkMode}
                />
              </div>

              {/* Portfolio Composition */}
              <div style={{
                background: t.card,
                padding: 32,
                borderRadius: 18,
                border: `1px solid ${t.border}`,
                boxShadow: darkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.06)'
              }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 600 }}>Portfolio Composition</h3>
                <PortfolioComposition
                  holdings={getAllHeldTickers().map(ticker => {
                    const holding = getHolding(ticker)!
                    const currentPrice = livePrices[ticker] || holding.avgPrice
                    return { ticker, currentValue: holding.shares * currentPrice }
                  })}
                  cash={portfolio?.cash || 0}
                  darkMode={darkMode}
                />
              </div>
            </div>

            {/* Performance Stats */}
            <div style={{
              background: t.card,
              padding: 32,
              borderRadius: 18,
              border: `1px solid ${t.border}`,
              boxShadow: darkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 2px 12px rgba(0, 0, 0, 0.06)'
            }}>
              <h3 style={{ margin: '0 0 24px 0', fontSize: 20, fontWeight: 600 }}>Performance Statistics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
                <div>
                  <p style={{ color: t.subtext, margin: '0 0 8px 0', fontSize: 14, fontWeight: 500 }}>Total Trades</p>
                  <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{tradeHistory.length}</p>
                </div>
                <div>
                  <p style={{ color: t.subtext, margin: '0 0 8px 0', fontSize: 14, fontWeight: 500 }}>Winning Trades</p>
                  <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#10b981' }}>
                    {tradeHistory.filter(t => t.profit_loss && parseFloat(t.profit_loss) > 0).length}
                  </p>
                </div>
                <div>
                  <p style={{ color: t.subtext, margin: '0 0 8px 0', fontSize: 14, fontWeight: 500 }}>Losing Trades</p>
                  <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#ef4444' }}>
                    {tradeHistory.filter(t => t.profit_loss && parseFloat(t.profit_loss) < 0).length}
                  </p>
                </div>
                <div>
                  <p style={{ color: t.subtext, margin: '0 0 8px 0', fontSize: 14, fontWeight: 500 }}>Win Rate</p>
                  <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
                    {tradeHistory.filter(t => t.profit_loss !== null).length > 0
                      ? ((tradeHistory.filter(t => t.profit_loss && parseFloat(t.profit_loss) > 0).length /
                        tradeHistory.filter(t => t.profit_loss !== null).length) * 100).toFixed(1) + '%'
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}