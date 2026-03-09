'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [portfolio, setPortfolio] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/'
        return
      }
      setUser(user)

      const { data: portfolio } = await supabase
        .from('portfolios')
        .select('*')
        .eq('id', user.id)
        .single()
      setPortfolio(portfolio)
    }
    load()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (!user) return <p style={{ fontFamily: 'monospace', padding: 40 }}>Loading...</p>

  return (
    <div style={{ fontFamily: 'monospace', padding: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1>📈 Stock Simulator</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#666' }}>{user.email}</span>
          <button onClick={handleLogout} style={{ padding: '8px 16px', cursor: 'pointer' }}>Logout</button>
        </div>
      </div>

      <div style={{ background: '#f5f5f5', padding: 24, borderRadius: 8, marginBottom: 24 }}>
        <h2 style={{ marginBottom: 8 }}>Portfolio Summary</h2>
        <p style={{ fontSize: 32, fontWeight: 'bold' }}>
          ${portfolio?.cash?.toFixed(2) ?? '10000.00'}
        </p>
        <p style={{ color: '#666' }}>Available cash</p>
      </div>

      <p style={{ color: '#999' }}>Market and trading coming soon...</p>
    </div>
  )
}