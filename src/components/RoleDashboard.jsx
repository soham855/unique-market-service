import { roleLabel } from '../lib/role'

const modules = {
  admin: ['Complaints', 'Customers', 'Technicians', 'Sites & Devices', 'AMC', 'Service History'],
  technician: ['My Assigned Complaints', "Today's Visits", 'Service History', 'My Profile'],
  customer: ['Raise Complaint', 'My Complaints', 'Service History', 'AMC Details', 'My Profile'],
}

export default function RoleDashboard({ profile, onSelectModule }) {
  const role = profile?.role || 'customer'
  const items = modules[role] || modules.customer

  return (
    <section className="role-dashboard">
      <div className="role-heading">
        <div>
          <span className="badge">{roleLabel(role)}</span>
          <h2>Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}</h2>
          <p>Use your workspace to manage the services available to your role.</p>
        </div>
      </div>
      <div className="modules">
        {items.map((item) => (
          <button key={item} type="button" className="module-card" onClick={() => onSelectModule?.(item)}>
            <span>●</span>
            <h3>{item}</h3>
            <p>Open module →</p>
          </button>
        ))}
      </div>
    </section>
  )
}
