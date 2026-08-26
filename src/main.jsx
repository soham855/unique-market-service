import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">UNIQUE MARKET</p>
          <h1>Service Management</h1>
        </div>
        <span className="status">System Ready</span>
      </header>
      <section className="hero">
        <div>
          <span className="badge">CCTV • IT • SECURITY</span>
          <h2>One platform for every service call.</h2>
          <p>Manage customers, complaints, technicians, sites, devices and AMC operations from one secure workspace.</p>
        </div>
        <div className="hero-card">
          <strong>Next module</strong>
          <span>Admin Dashboard</span>
          <small>Supabase-connected foundation</small>
        </div>
      </section>
      <section className="modules">
        {['Complaints','Customers','Technicians','Sites & Devices','AMC','Service History'].map((item) => (
          <article key={item}><span>●</span><h3>{item}</h3><p>Module foundation ready</p></article>
        ))}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
