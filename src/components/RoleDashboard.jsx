import { roleLabel } from '../lib/role'

const modules = {
  admin: [
    { name: 'Complaints', path: '/admin/complaints' },
    { name: 'Customers', path: '/admin/customers' },
    { name: 'Technicians', path: '/admin/technicians' },
    { name: 'Sites & Devices', path: '/admin/sites-devices' },
    { name: 'AMC', path: '/admin/amc' },
    { name: 'Service History', path: '/admin/service-history' },
  ],
  technician: [
    { name: 'My Assigned Complaints', path: '/technician/complaints' },
    { name: "Today's Visits", path: '/technician/visits' },
    { name: 'Service History', path: '/technician/history' },
    { name: 'My Profile', path: '/profile' },
  ],
  customer: [
    { name: 'Raise Complaint', path: '/complaint' },
    { name: 'My Complaints', path: '/complaints' },
    { name: 'Service History', path: '/service-history' },
    { name: 'AMC Details', path: '/amc' },
    { name: 'My Profile', path: '/profile' },
  ],
}

export default function RoleDashboard({ profile }) {
  const role = profile?.role || 'customer'
  const items = modules[role] || modules.customer

  const openModule = (path) => {
    window.location.href = path
  }

  return (
    <section className="role-dashboard">
      <div className="role-heading">
        <div>
          <span className="badge">{roleLabel(role)}</span>
          <h2>
            Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}
          </h2>
          <p>
            Use your workspace to manage the services available to your role.
          </p>
        </div>
      </div>

      <div className="modules">
        {items.map((item) => (
          <button
            key={item.name}
            type="button"
            className="module-card"
            onClick={() => openModule(item.path)}
          >
            <span>●</span>
            <h3>{item.name}</h3>
            <p>Open module →</p>
          </button>
        ))}
      </div>
    </section>
  )
}
