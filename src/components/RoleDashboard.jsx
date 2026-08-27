import { useEffect, useState } from 'react'
import { roleLabel } from '../lib/role'
import { supabase } from '../lib/supabase'

const adminModules = [
  ['Complaints', 'Service complaints, assignment and status'],
  ['Customers', 'Customer profiles and contact details'],
  ['Technicians', 'Technician accounts and availability'],
  ['Sites & Devices', 'Customer sites and installed equipment'],
  ['AMC', 'AMC contracts, dates and status'],
  ['Service History', 'Completed service and visit records'],
]

const modules = {
  admin: adminModules,
  technician: [['My Assigned Complaints', 'Assigned service calls'], ["Today's Visits", "Today's scheduled work"], ['Service History', 'Your completed work'], ['My Profile', 'Your account']],
  customer: [['Raise Complaint', 'Report a service issue'], ['My Complaints', 'Track your complaints'], ['Service History', 'Previous service'], ['AMC Details', 'Your AMC information'], ['My Profile', 'Your account']],
}

export default function RoleDashboard({ profile, onSelectModule }) {
  const role = profile?.role || 'customer'
  const items = modules[role] || modules.customer
  const [counts, setCounts] = useState({})

  useEffect(() => {
    if (role !== 'admin' || !supabase) return
    let cancelled = false
    async function loadCounts() {
      const tables = {
        Complaints: 'complaints', Customers: 'profiles', Technicians: 'profiles',
        'Sites & Devices': 'sites', AMC: 'amc_contracts', 'Service History': 'service_history',
      }
      const entries = await Promise.all(Object.entries(tables).map(async ([name, table]) => {
        let q = supabase.from(table).select('id', { count: 'exact', head: true })
        if (name === 'Customers') q = q.eq('role', 'customer')
        if (name === 'Technicians') q = q.eq('role', 'technician')
        const { count } = await q
        return [name, count || 0]
      }))
      if (!cancelled) setCounts(Object.fromEntries(entries))
    }
    loadCounts()
    return () => { cancelled = true }
  }, [role])

  return (
    <section className="role-dashboard">
      <div className="role-heading">
        <div>
          <span className="badge">{roleLabel(role)}</span>
          <h2>Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}</h2>
          <p>{role === 'admin' ? 'Manage the complete Unique Market service operation.' : 'Use your workspace to manage the services available to your role.'}</p>
        </div>
      </div>
      {role === 'admin' && <div className="admin-stats">
        {adminModules.map(([name]) => <div className="stat-card" key={name}><strong>{counts[name] ?? '—'}</strong><span>{name}</span></div>)}
      </div>}
      <div className="modules">
        {items.map(([item, description]) => (
          <button key={item} type="button" className="module-card" onClick={() => onSelectModule?.(item)}>
            <span>●</span><h3>{item}</h3><p>{description} →</p>
          </button>
        ))}
      </div>
    </section>
  )
}
