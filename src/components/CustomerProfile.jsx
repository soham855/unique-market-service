import { useState } from 'react'
import { updateMyProfile } from '../lib/profile'

export default function CustomerProfile({ profile, onBack, onSaved }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    company_name: profile?.company_name || '',
    phone: profile?.phone || '',
    email: profile?.email || '',
    site_address: profile?.site_address || ''
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const change = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  async function save(e) {
    e.preventDefault()
    setSaving(true); setMessage(''); setError('')
    try {
      const updated = await updateMyProfile(form)
      setMessage(updated.email !== profile?.email ? 'Profile saved. Check your new email inbox if confirmation is required.' : 'Profile updated successfully.')
      onSaved?.(updated)
    } catch (err) {
      setError(err.message || 'Unable to update profile.')
    } finally { setSaving(false) }
  }

  return <section className='role-dashboard'>
    <button className='secondary' type='button' onClick={onBack}>← Back to Dashboard</button>
    <div className='module-card' style={{maxWidth:760,margin:'24px auto',cursor:'default'}}>
      <span>●</span><h2>My Profile</h2><p>View and update your customer details.</p>
      <form onSubmit={save} style={{display:'grid',gap:14,marginTop:18}}>
        <label>Full Name<input value={form.full_name} onChange={e=>change('full_name',e.target.value)} required /></label>
        <label>Company Name<input value={form.company_name} onChange={e=>change('company_name',e.target.value)} placeholder='Optional' /></label>
        <label>Mobile Number<input value={form.phone} onChange={e=>change('phone',e.target.value)} required /></label>
        <label>Email ID<input type='email' value={form.email} onChange={e=>change('email',e.target.value)} required /></label>
        <label>Site Address<textarea value={form.site_address} onChange={e=>change('site_address',e.target.value)} rows='3' required /></label>
        {error && <p className='error'>{error}</p>}
        {message && <p>{message}</p>}
        <button type='submit' disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
      </form>
    </div>
  </section>
}
