import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { supabase } from './lib/supabase'
import { getSession, onAuthStateChange, signOut } from './lib/auth'
import Login from './components/Login'

const stats = [
  ['Open Complaints', 'complaints', 'Open tickets requiring action'],
  ['Customers', 'customers', 'Registered service customers'],
  ['Technicians', 'technicians', 'Technician team members'],
]

function Dashboard({ session }) {
  const [counts, setCounts] = useState({ complaints: 0, customers: 0, technicians: 0 })
  const [connected, setConnected] = useState(Boolean(supabase))

  useEffect(() => {
    let active = true
    async function loadStats() {
      if (!supabase) return
      const tables = ['complaints', 'customers', 'technicians']
      const results = await Promise.all(tables.map((table) => supabase.from(table).select('*', { count: 'exact', head: true })))
      if (!active) return
      const next = {}
      results.forEach((result, index) => { next[tables[index]] = result.count ?? 0 })
      setCounts(next)
      setConnected(results.every((result) => !result.error))
    }
    loadStats()
    return () => { active = false }
  }, [])

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="eyebrow">UNIQUE MARKET</p><h1>Service Management</h1></div>
      <div className="top-actions"><span className={connected ? 'status' : 'status offline'}>{connected ? 'Supabase Connected' : 'Configuration Required'}</span><button className="secondary" onClick={signOut}>Sign out</button></div>
    </header>
    <section className="hero">
      <div><span className="badge">CCTV • IT • SECURITY</span><h2>One platform for every service call.</h2><p>Admin workspace for customers, complaints, technicians, sites, devices and AMC operations.</p><small className="muted">Signed in as {session?.user?.email}</small></div>
      <div className="hero-card"><strong>CONTROL CENTER</strong><span>Admin Dashboard</span><small>Live database counts where configuration is available</small></div>
    </section>
    <section className="stats">{stats.map(([label, key, description]) => <article key={key}><small>{label}</small><strong>{counts[key]}</strong><p>{description}</p></article>)}</section>
    <section className="modules">{['Complaints','Customers','Technicians','Sites & Devices','AMC','Service History'].map((item) => <article key={item}><span>●</span><h3>{item}</h3><p>Module foundation ready</p></article>)}</section>
  </main>
}

function App() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    let mounted = true
    getSession().then((value) => mounted && setSession(value))
    const { data } = onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => { mounted = false; data.subscription.unsubscribe() }
  }, [])
  if (session === undefined) return <main className="auth-shell"><div className="login-card"><p className="eyebrow">UNIQUE MARKET</p><h1>Loading…</h1></div></main>
  return session ? <Dashboard session={session} /> : <Login onLogin={setSession} />
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
