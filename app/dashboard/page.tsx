'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getMultipleStocks, DEFAULT_STOCKS } from '../../lib/stocks'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [portfolio, setPortfolio] = useState<any>(null)
  const [stocks, setStocks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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

      const stockData = await getMultipleStocks(DEFAULT_STOCKS)
      setStocks(stockData)
      setLoading(false)
    }
    load()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (!user || loading) return <p style={{ fontFamily: 'monospace', padding: 40 }}>Loading...</p>

  return (
    <div style={{ fontFamily: 'monospace', padding: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1>📈 Stock Simulator</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#666' }}>{user.email}</span>
          <button onClick={handleLogout} style={{ padding: '8px 16px', cursor: 'pointer' }}>Logout</button>
        </div>
      </div>

      <div style={{ background: '#f5f5f5', padding: 24, borderRadius: 8, marginBottom: 32 }}>
        <h2 style={{ marginBottom: 8 }}>💰 Available Cash</h2>
        <p style={{ fontSize: 32, fontWeight: 'bold' }}>${portfolio?.cash?.toFixed(2)}</p>
      </div>

      <h2 style={{ marginBottom: 16 }}>📊 Market</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {stocks.map(stock => (
          <div key={stock.ticker} style={{ background: '#f9f9f9', border: '1px solid #eee', padding: 16, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 'bold', fontSize: 18 }}>{stock.ticker}</p>
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
      </div>
    </div>
  )
}