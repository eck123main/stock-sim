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
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          maxWidth: 520,
          width: '100%',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderRadius: 24,
          padding: '56px 48px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 20 }}>🔑</div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#1a1a1a', marginBottom: 10 }}>Reset Password</h1>
            <p style={{ color: '#666', margin: 0, fontSize: 16 }}>Enter your email and we'll send you a reset link</p>
          </div>

          <input
            placeholder="Email address"
            value={resetEmail}
            onChange={e => setResetEmail(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              padding: '16px 18px',
              marginBottom: 20,
              border: '2px solid #e0e0e0',
              borderRadius: 12,
              fontSize: 16,
              fontFamily: 'inherit',
              transition: 'all 0.2s',
              boxSizing: 'border-box'
            }}
          />

          <button
            onClick={handleForgotPassword}
            disabled={resetSent}
            style={{
              width: '100%',
              padding: '16px',
              background: resetSent ? '#cbd5e1' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              fontSize: 17,
              fontWeight: 600,
              cursor: resetSent ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              boxShadow: resetSent ? 'none' : '0 4px 15px rgba(102, 126, 234, 0.4)'
            }}>
            {resetSent ? '✓ Email sent! Check your inbox' : 'Send Reset Link'}
          </button>

          {error && (
            <div style={{
              marginTop: 20,
              padding: '14px 18px',
              background: '#fee',
              border: '1px solid #fcc',
              borderRadius: 8,
              color: '#c33',
              fontSize: 15
            }}>{error}</div>
          )}

          {message && (
            <div style={{
              marginTop: 20,
              padding: '14px 18px',
              background: '#efe',
              border: '1px solid #cfc',
              borderRadius: 8,
              color: '#282',
              fontSize: 15
            }}>{message}</div>
          )}

          <button
            onClick={() => {
              setForgotPasswordMode(false)
              setResetEmail('')
              setResetSent(false)
            }}
            style={{
              marginTop: 24,
              width: '100%',
              padding: '14px',
              background: 'transparent',
              border: 'none',
              color: '#667eea',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 500
            }}>
            ← Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: 520,
        width: '100%',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: 24,
        padding: '56px 48px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 72, marginBottom: 20 }}>📈</div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 700, color: '#1a1a1a', marginBottom: 10 }}>Stock Simulator</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 16 }}>Learn to trade with virtual money</p>
        </div>

        <input
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            padding: '16px 18px',
            marginBottom: 14,
            border: '2px solid #e0e0e0',
            borderRadius: 12,
            fontSize: 16,
            fontFamily: 'inherit',
            transition: 'all 0.2s',
            boxSizing: 'border-box'
          }}
        />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            padding: '16px 18px',
            marginBottom: 24,
            border: '2px solid #e0e0e0',
            borderRadius: 12,
            fontSize: 16,
            fontFamily: 'inherit',
            transition: 'all 0.2s',
            boxSizing: 'border-box'
          }}
        />

        <button
          onClick={handleAuth}
          style={{
            width: '100%',
            padding: '16px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: 12,
            fontSize: 17,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s',
            boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
            marginBottom: 20
          }}>
          {isLogin ? 'Sign In' : 'Create Account'}
        </button>

        {error && (
          <div style={{
            marginBottom: 14,
            padding: '14px 18px',
            background: '#fee',
            border: '1px solid #fcc',
            borderRadius: 8,
            color: '#c33',
            fontSize: 15
          }}>{error}</div>
        )}

        {message && (
          <div style={{
            marginBottom: 14,
            padding: '14px 18px',
            background: '#efe',
            border: '1px solid #cfc',
            borderRadius: 8,
            color: '#282',
            fontSize: 15
          }}>{message}</div>
        )}

        {isLogin && (
          <button
            onClick={() => setForgotPasswordMode(true)}
            style={{
              width: '100%',
              padding: '10px',
              background: 'transparent',
              border: 'none',
              color: '#667eea',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 500,
              marginBottom: 10
            }}>
            Forgot password?
          </button>
        )}

        <div style={{
          borderTop: '1px solid #e0e0e0',
          marginTop: 28,
          paddingTop: 28,
          textAlign: 'center'
        }}>
          <p style={{ margin: 0, color: '#666', fontSize: 16 }}>
            {isLogin ? "Don't have an account?" : "Already have an account?"}
          </p>
          <button
            onClick={() => setIsLogin(!isLogin)}
            style={{
              marginTop: 12,
              padding: '12px 28px',
              background: 'transparent',
              border: '2px solid #667eea',
              borderRadius: 12,
              color: '#667eea',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 600,
              transition: 'all 0.2s'
            }}>
            {isLogin ? 'Create Account' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}