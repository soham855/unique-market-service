import { useState } from 'react'
import { updateMyProfile } from '../lib/profile'

export default function CustomerProfile({ profile, onBack, onSaved }) {
  const role = profile?.role === 'technician' ? 'technician' : 'customer'
  const roleLabel = role === 'technician' ? 'Field Technician' : 'Customer'
  const initials = (profile?.full_name || 'U').trim().split(/\s+/).slice(0, 2).map(v => v[0]).join('').toUpperCase()
  const [form, setForm] = useState({ full_name: profile?.full_name || '', company_name: profile?.company_name || '', phone: profile?.phone || '', email: profile?.email || '', site_address: profile?.site_address || '' })
  const [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const change = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  async function save(e) {
    e.preventDefault()
    setSaving(true); setMessage(''); setError('')
    try {
      const updated = await updateMyProfile(form)
      setMessage(updated.email !== profile?.email ? 'Profile saved. Check your new email inbox if confirmation is required.' : 'Profile updated successfully.')
      onSaved?.(updated)
    } catch (err) { setError(err.message || 'Unable to update profile.') }
    finally { setSaving(false) }
  }
  return <section className='role-dashboard profile-page'>
    <div className='profile-back-row'>
      <button className='secondary' type='button' onClick={onBack}>← Back to Dashboard</button>
      <span className='profile-secure'>● SECURE PROFILE</span>
    </div>

    <div className='profile-hero'>
      <div className='profile-avatar'>{initials}</div>
      <div className='profile-hero-copy'>
        <span className='badge'>TECHNICIAN PORTAL</span>
        <h2>My Profile</h2>
        <p>Manage your service identity and contact details.</p>
      </div>
      <div className='profile-role-pill'><span>●</span>{roleLabel}</div>
    </div>

    <div className='profile-layout'>
      <aside className='profile-side-card'>
        <div className='profile-side-icon'>✦</div>
        <h3>Profile Center</h3>
        <p>Keep your contact and service information current so the Unique Market team can reach you without delay.</p>
        <div className='profile-side-line'><span>ACCOUNT</span><strong>ACTIVE</strong></div>
        <div className='profile-side-line'><span>ROLE</span><strong>{roleLabel.toUpperCase()}</strong></div>
        <div className='profile-side-line'><span>ACCESS</span><strong>VERIFIED</strong></div>
      </aside>

      <div className='profile-form-card'>
        <div className='profile-card-head'>
          <div><span className='profile-kicker'>ACCOUNT DETAILS</span><h3>Personal &amp; Service Information</h3></div>
          <span className='profile-edit-dot'>●</span>
        </div>
        <form onSubmit={save} className='premium-profile-form'>
          <label><span>Full Name</span><input value={form.full_name} onChange={e=>change('full_name',e.target.value)} placeholder='Enter full name' required /></label>
          <label><span>Company Name <em>Optional</em></span><input value={form.company_name} onChange={e=>change('company_name',e.target.value)} placeholder='Company / organisation' /></label>
          <label><span>Mobile Number</span><input value={form.phone} onChange={e=>change('phone',e.target.value)} placeholder='10-digit mobile number' required /></label>
          <label><span>Email ID</span><input type='email' value={form.email} onChange={e=>change('email',e.target.value)} placeholder='name@example.com' required /></label>
          <label className='profile-full'><span>{role === 'technician' ? 'Service / Home Address' : 'Site Address'} <em>Optional</em></span><textarea value={form.site_address} onChange={e=>change('site_address',e.target.value)} rows='4' placeholder={role==='technician' ? 'Enter your service or home address' : 'Enter service address'} /></label>
          {error && <p className='error profile-message'>{error}</p>}
          {message && <p className='profile-success'>✓ {message}</p>}
          <div className='profile-actions'>
            <button type='submit' disabled={saving}>{saving ? 'Saving…' : '✓ Save Changes'}</button>
            <button type='button' className='secondary' onClick={onBack}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  </section>
}
