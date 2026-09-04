import { useState } from 'react'
import { signUp } from '../lib/auth'

export default function CustomerRegister({ onBack }) {
  const [form, setForm] = useState({ name:'', company_name:'', mobile:'', email:'', address:'', password:'', confirmPassword:'' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const change = (key,value) => setForm(prev => ({...prev,[key]:value}))
  async function submit(e){
    e.preventDefault(); setMessage(''); setError('')
    if(form.password.length < 6) return setError('Password must be at least 6 characters.')
    if(form.password !== form.confirmPassword) return setError('Passwords do not match.')
    setLoading(true)
    try {
      const data = await signUp(form)
      if(data.session) setMessage('Registration successful. Opening your Customer Portal…')
      else setMessage('Registration successful. Please check your email if email confirmation is enabled, then sign in.')
    } catch(err){ setError(err.message || 'Unable to register.') }
    finally { setLoading(false) }
  }
  return <main className='auth-shell'>
    <form className='login-card' onSubmit={submit}>
      <p className='eyebrow'>UNIQUE MARKET • CUSTOMER</p>
      <h1>Create Customer Account</h1>
      <p className='muted'>Registration is required before raising a service complaint.</p>
      <label>Full Name <span>*</span><input value={form.name} onChange={e=>change('name',e.target.value)} required autoComplete='name' /></label>
      <label>Company Name <small>(Optional)</small><input value={form.company_name} onChange={e=>change('company_name',e.target.value)} /></label>
      <label>Mobile Number <span>*</span><input type='tel' value={form.mobile} onChange={e=>change('mobile',e.target.value)} required autoComplete='tel' /></label>
      <label>Email ID <span>*</span><input type='email' value={form.email} onChange={e=>change('email',e.target.value)} required autoComplete='email' /></label>
      <label>Address <span>*</span><textarea value={form.address} onChange={e=>change('address',e.target.value)} rows='3' required autoComplete='street-address' /></label>
      <label>Password <span>*</span><input type='password' value={form.password} onChange={e=>change('password',e.target.value)} required autoComplete='new-password' minLength='6' /></label>
      <label>Confirm Password <span>*</span><input type='password' value={form.confirmPassword} onChange={e=>change('confirmPassword',e.target.value)} required autoComplete='new-password' minLength='6' /></label>
      {error && <div className='error'>{error}</div>}
      {message && <p className='muted'>{message}</p>}
      <button disabled={loading}>{loading ? 'Creating account…' : 'Create Customer Account'}</button>
      <button type='button' className='secondary' onClick={onBack}>← Back to Sign in</button>
    </form>
  </main>
}
