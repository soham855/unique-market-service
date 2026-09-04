import { useState } from 'react'
import { signUp, verifyCustomerOtp } from '../lib/auth'

export default function CustomerRegister({ onBack }) {
  const [form, setForm] = useState({ name:'', company_name:'', mobile:'', email:'', address:'', password:'', confirmPassword:'' })
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('details')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const change = (key,value) => setForm(prev => ({...prev,[key]:value}))

  async function sendOtp(e){
    e.preventDefault(); setMessage(''); setError('')
    if(form.password.length < 6) return setError('Password must be at least 6 characters.')
    if(form.password !== form.confirmPassword) return setError('Passwords do not match.')
    setLoading(true)
    try {
      await signUp(form)
      setStep('otp')
      setMessage(`OTP sent to ${form.mobile}. Enter the 6-digit OTP to complete registration.`)
    } catch(err){ setError(err.message || 'Unable to send OTP.') }
    finally { setLoading(false) }
  }

  async function verifyOtp(e){
    e.preventDefault(); setMessage(''); setError('')
    if(!/^\d{6}$/.test(otp.trim())) return setError('Please enter the 6-digit OTP.')
    setLoading(true)
    try {
      const data = await verifyCustomerOtp({ ...form, token: otp })
      if(data.session) setMessage('Mobile number verified. Registration successful. Please sign in with your email and password.')
      else setMessage('Mobile number verified. Registration successful. Please sign in.')
      setStep('done')
    } catch(err){ setError(err.message || 'Invalid or expired OTP.') }
    finally { setLoading(false) }
  }

  return <main className='auth-shell'>
    <form className='login-card' onSubmit={step==='details' ? sendOtp : verifyOtp}>
      <p className='eyebrow'>UNIQUE MARKET • CUSTOMER</p>
      <h1>{step==='details' ? 'Create Customer Account' : step==='otp' ? 'Verify Mobile Number' : 'Registration Complete'}</h1>
      {step==='details' && <>
        <p className='muted'>Registration is required before raising a service complaint.</p>
        <label>Full Name <span>*</span><input value={form.name} onChange={e=>change('name',e.target.value)} required autoComplete='name' /></label>
        <label>Company Name <small>(Optional)</small><input value={form.company_name} onChange={e=>change('company_name',e.target.value)} /></label>
        <label>Mobile Number <span>*</span><input type='tel' value={form.mobile} onChange={e=>change('mobile',e.target.value)} required autoComplete='tel' placeholder='10-digit mobile number' /></label>
        <label>Email ID <span>*</span><input type='email' value={form.email} onChange={e=>change('email',e.target.value)} required autoComplete='email' /></label>
        <label>Address <span>*</span><textarea value={form.address} onChange={e=>change('address',e.target.value)} rows='3' required autoComplete='street-address' /></label>
        <label>Password <span>*</span><input type='password' value={form.password} onChange={e=>change('password',e.target.value)} required autoComplete='new-password' minLength='6' /></label>
        <label>Confirm Password <span>*</span><input type='password' value={form.confirmPassword} onChange={e=>change('confirmPassword',e.target.value)} required autoComplete='new-password' minLength='6' /></label>
        {error && <div className='error'>{error}</div>}
        <button disabled={loading}>{loading ? 'Sending OTP…' : 'Send OTP to Mobile'}</button>
        <button type='button' className='secondary' onClick={onBack}>← Back to Sign in</button>
      </>}

      {step==='otp' && <>
        <p className='muted'>We sent a 6-digit OTP to <strong>{form.mobile}</strong>.</p>
        <label>Mobile OTP <span>*</span><input inputMode='numeric' pattern='[0-9]{6}' maxLength='6' value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} autoComplete='one-time-code' required autoFocus placeholder='Enter 6-digit OTP' /></label>
        {error && <div className='error'>{error}</div>}
        {message && <p className='muted'>{message}</p>}
        <button disabled={loading}>{loading ? 'Verifying…' : 'Verify OTP & Create Account'}</button>
        <button type='button' className='secondary' disabled={loading} onClick={()=>{setStep('details');setOtp('');setError('');setMessage('')}}>← Change details</button>
      </>}

      {step==='done' && <>
        {message && <p className='muted'>{message}</p>}
        <button type='button' onClick={onBack}>Go to Sign in</button>
      </>}
    </form>
  </main>
}
