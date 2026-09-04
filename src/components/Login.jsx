import { useState } from 'react'
import { signIn } from '../lib/auth'
import CustomerRegister from './CustomerRegister'

export default function Login({ onLogin }) {
  const [registering, setRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  if (registering) return <CustomerRegister onBack={()=>setRegistering(false)} />
  async function submit(event) {
    event.preventDefault(); setError(''); setLoading(true)
    try { const data = await signIn(email.trim(), password); onLogin(data.session) }
    catch (err) { setError(err.message || 'Unable to sign in') }
    finally { setLoading(false) }
  }
  return <main className='auth-shell'>
    <form className='login-card' onSubmit={submit}>
      <p className='eyebrow'>UNIQUE MARKET</p><h1>Sign in</h1>
      <p className='muted'>Access the Service Management control center.</p>
      <label>Email<input type='email' value={email} onChange={e=>setEmail(e.target.value)} required autoComplete='email' /></label>
      <label>Password<input type='password' value={password} onChange={e=>setPassword(e.target.value)} required autoComplete='current-password' /></label>
      {error && <div className='error'>{error}</div>}
      <button disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
      <button type='button' className='secondary' onClick={()=>setRegistering(true)}>New Customer? Register</button>
    </form>
  </main>
}
