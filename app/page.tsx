'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)

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

  async function handleForgotPassword() {
    setError('')
    setMessage('')
    if (!resetEmail) {
      setError('Please enter your email')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) setError(error.message)
    else {
      setResetSent(true)
      setMessage('Password reset email sent! Check your inbox.')
    }
  }

  if (forgotPasswordMode) {
    return (
      <div style={{ maxWidth: 400, margin: '100px auto', fontFamily: 'monospace' }}>
        <h1 style={{ marginBottom: 24 }}>🔑 Reset Password</h1>
        <p style={{ color: '#666', marginBottom: 16 }}>Enter your email and we'll send you a link to reset your password.</p>
        <input placeholder="Email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 10, marginBottom: 12 }} />
        <button onClick={handleForgotPassword} disabled={resetSent}
          style={{ width: '100%', padding: 12, background: resetSent ? '#ccc' : 'black', color: 'white', cursor: resetSent ? 'default' : 'pointer' }}>
          {resetSent ? 'Email sent! Check your inbox' : 'Send Reset Link'}
        </button>
        {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
        {message && <p style={{ color: 'green', marginTop: 12 }}>{message}</p>}
        <p style={{ marginTop: 16, cursor: 'pointer', textDecoration: 'underline' }}
          onClick={() => {
            setForgotPasswordMode(false)
            setResetEmail('')
            setResetSent(false)
          }}>
          Back to login
        </p>
      </div>
    )
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
      {isLogin && (
        <p style={{ marginTop: 12, cursor: 'pointer', textDecoration: 'underline', color: '#0066cc' }}
          onClick={() => setForgotPasswordMode(true)}>
          Forgot password?
        </p>
      )}
      <p style={{ marginTop: 16, cursor: 'pointer', textDecoration: 'underline' }}
        onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "Don't have an account? Sign up" : "Already have an account? Login"}
      </p>
    </div>
  )
}