import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { supabase } from './lib/supabase'
import { getSession, onAuthStateChange, signOut } from './lib/auth'
import { getMyProfile } from './lib/profile'
import Login from './components/Login'
import RoleDashboard from './components/RoleDashboard'
import ComplaintModule from './components/ComplaintModule'
import NotificationBell from './components/NotificationBell'

function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [activeModule, setActiveModule] = useState(null)

  async function loadProfile() {
    try { setProfileError(''); setProfile(await getMyProfile()) }
    catch (error) { setProfileError(error.message || 'Unable to load profile') }
  }

  useEffect(() => {
    let mounted = true
    getSession().then(async (value) => {
      if (!mounted) return
      setSession(value)
      if (value) {
        try { setProfile(await getMyProfile()) } catch (error) { setProfileError(error.message || 'Unable to load profile') }
      }
    })
    const { data } = onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) loadProfile(); else { setProfile(null); setActiveModule(null) }
    })
    return () => { mounted = false; data.subscription.unsubscribe() }
  }, [])

  if (session === undefined) return <main className="auth-shell"><div className="login-card"><p className="eyebrow">UNIQUE MARKET</p><h1>Loading…</h1></div></main>
  if (!session) return <Login onLogin={setSession} />
  if (profileError) return <main className="auth-shell"><div className="login-card"><p className="eyebrow">UNIQUE MARKET</p><h1>Profile setup required</h1><p className="error">{profileError}</p><p className="muted">Run the roles migration in Supabase, then sign in again.</p><button onClick={signOut}>Sign out</button></div></main>
  if (!profile) return <main className="auth-shell"><div className="login-card"><p className="eyebrow">UNIQUE MARKET</p><h1>Loading profile…</h1></div></main>

  const isComplaintModule = activeModule === 'Complaints' || activeModule === 'Raise Complaint' || activeModule === 'My Complaints'

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">UNIQUE MARKET</p><h1>Service Management</h1></div><div className="top-actions"><span className="status">{profile.role.toUpperCase()}</span><NotificationBell userId={session.user.id} /><button className="secondary" onClick={signOut}>Sign out</button></div></header>
    {!activeModule ? (
      <RoleDashboard profile={profile} onSelectModule={setActiveModule} />
    ) : (
      <section className="role-dashboard">
        <button className="secondary" type="button" onClick={() => setActiveModule(null)}>← Back to Dashboard</button>
        <div className="role-heading"><div><span className="badge">{profile.roleLabel || profile.role}</span><h2>{activeModule}</h2><p>Module opened successfully.</p></div></div>
        {isComplaintModule ? <ComplaintModule profile={profile} /> : <div className="modules"><article className="module-card"><span>●</span><h3>{activeModule}</h3><p>Module interface is ready for implementation.</p></article></div>}
      </section>
    )}
    {supabase && <footer className="footer">Signed in as {session.user.email}</footer>}
  </main>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
