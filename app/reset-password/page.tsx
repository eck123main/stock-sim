'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useSearchParams } from 'next/navigation'

export default function ResetPassword() {
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
    <div style={{ maxWidth: 400, margin: '100px auto', fontFamily: 'monospace' }}>
      <h1 style={{ marginBottom: 24 }}>🔑 Set New Password</h1>
      
      {!token && (
        <p style={{ color: 'red' }}>Invalid or expired reset link. Please request a new one.</p>
      )}

      {!success && token && (
        <>
          <input placeholder="New Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 10, marginBottom: 12 }} />
          <input placeholder="Confirm Password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 10, marginBottom: 12 }} />
          <button onClick={handleResetPassword} disabled={loading}
            style={{ width: '100%', padding: 12, background: loading ? '#ccc' : 'black', color: 'white', cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </>
      )}

      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
      {message && <p style={{ color: 'green', marginTop: 12 }}>{message}</p>}

      <p style={{ marginTop: 16, cursor: 'pointer', textDecoration: 'underline' }}
        onClick={() => window.location.href = '/'}>
        Back to login
      </p>
    </div>
  )
}
