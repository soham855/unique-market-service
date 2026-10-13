import { useState } from 'react'
import { signIn } from '../lib/auth'
import { REMEMBER_KEY, AUTH_STORAGE_KEY } from '../lib/supabase'

const FIFTEEN_DAYS = 15 * 24 * 60 * 60 * 1000

export default function Login({ onLogin, portal = null }) {
  const portalTitle = portal === 'customer' ? 'Customer Portal' : portal === 'technician' ? 'Technician Portal' : portal === 'admin' ? 'Admin Portal' : 'Service Portal'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => Number(localStorage.getItem(REMEMBER_KEY) || 0) > Date.now())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, String(Date.now() + FIFTEEN_DAYS))
      } else {
        localStorage.removeItem(REMEMBER_KEY)
        localStorage.removeItem(AUTH_STORAGE_KEY)
      }

      const data = await signIn(email.trim(), password)

      if (remember) {
        localStorage.setItem(REMEMBER_KEY, String(Date.now() + FIFTEEN_DAYS))
      }

      onLogin(data.session)
    } catch (err) {
      if (remember) localStorage.removeItem(REMEMBER_KEY)
      setError(err.message || 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return <main className='auth-shell'>
    <form className='login-card' onSubmit={submit}>
      <p className='eyebrow'>UNIQUE MARKET</p><h1>{portalTitle} Sign in</h1>
      <p className='muted'>Secure access from anywhere. Use your assigned account credentials.</p>
      <label>Email<input type='email' value={email} onChange={e=>setEmail(e.target.value)} required autoComplete='email' /></label>
      <label>Password<input type='password' value={password} onChange={e=>setPassword(e.target.value)} required autoComplete='current-password' /></label>
      <label className='remember-login'>
        <input type='checkbox' checked={remember} onChange={e=>setRemember(e.target.checked)} />
        <span>Remember me for 15 days</span>
      </label>
      {error && <div className='error'>{error}</div>}
      <button disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
      <nav aria-label='Portal links' className='portal-login-links' style={{display:'flex',flexWrap:'wrap',gap:10,marginTop:14,fontSize:12}}><a href='/customer/login'>Customer</a><a href='/technician/login'>Technician</a><a href='/admin/login'>Admin</a></nav>
    </form>
  </main>
}
