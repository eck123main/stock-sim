'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleAuth() {
    setError('')
    setMessage('')
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else window.location.href = '/dashboard'
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Check your email to confirm your account!')
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', fontFamily: 'monospace' }}>
      <h1 style={{ marginBottom: 24 }}>📈 Stock Simulator</h1>
      <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
        style={{ display: 'block', width: '100%', padding: 10, marginBottom: 12 }} />
      <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
        style={{ display: 'block', width: '100%', padding: 10, marginBottom: 12 }} />
      <button onClick={handleAuth}
        style={{ width: '100%', padding: 12, background: 'black', color: 'white', cursor: 'pointer' }}>
        {isLogin ? 'Login' : 'Sign Up'}
      </button>
      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
      {message && <p style={{ color: 'green', marginTop: 12 }}>{message}</p>}
      <p style={{ marginTop: 16, cursor: 'pointer', textDecoration: 'underline' }}
        onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "Don't have an account? Sign up" : "Already have an account? Login"}
      </p>
    </div>
  )
}