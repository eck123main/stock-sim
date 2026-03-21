'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useSearchParams } from 'next/navigation'

export default function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. Please try again.')
    }
  }, [token])

  async function handleResetPassword() {
    setError('')
    setMessage('')

    if (!password || !confirmPassword) {
      setError('Please fill in all fields')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
      setMessage('Password reset successfully! Redirecting to login...')
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
    }
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
          <div style={{ fontSize: 64, marginBottom: 20 }}>🔑</div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#1a1a1a', marginBottom: 10 }}>Set New Password</h1>
        </div>

      {!token && (
        <div style={{
          padding: '14px 18px',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: 8,
          color: '#c33',
          fontSize: 15
        }}>Invalid or expired reset link. Please request a new one.</div>
      )}

      {!success && token && (
        <>
          <input placeholder="New Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
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
            }} />
          <input placeholder="Confirm Password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
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
            }} />
          <button onClick={handleResetPassword} disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              background: loading ? '#cbd5e1' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              fontSize: 17,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              boxShadow: loading ? 'none' : '0 4px 15px rgba(102, 126, 234, 0.4)'
            }}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </>
      )}

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
        onClick={() => window.location.href = '/'}
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
