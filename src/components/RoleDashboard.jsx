import { useEffect, useState } from 'react'
import { roleLabel } from '../lib/roles'
import { supabase } from '../lib/supabase'

const adminModules = [
  ['Reports', 'Business performance and service insights'],
  ['Complaints', 'Manage and track customer complaints'],
  ['Customers', 'View and manage customer records'],
  ['Technicians', 'Manage technician assignments and work'],
  ['User Accounts', 'Create and manage portal accounts'],
  ['Payments', 'Track customer payments and collections'],
  ['Products', 'Manage CCTV and IT products'],
  ['AMC', 'Manage AMC contracts and renewals'],
  ['Settings', 'Configure portal settings'],
]

const modules = {
  admin: adminModules,
  technician: [
    ['My Assigned Complaints', 'View complaints assigned to you'],
    ['Find Complaint', 'Search and manage service tickets'],
    ["Today's Visits", 'View your scheduled service visits'],
    ['Service History', 'Review your completed service work'],
    ['Collect Payment', 'Collect cash or UPI payment'],
    ['My Profile', 'Manage your technician profile'],
  ],
  customer: [
    ['Raise Complaint', 'Get CCTV & security support quickly'],
    ['My Complaints', 'Track your service tickets'],
    ['Service History', 'View your previous service records'],
    ['AMC Details', 'Check AMC coverage and contract'],
    ['Payments', 'View payments and transaction details'],
    ['My Profile', 'Manage your customer profile'],
  ],
}

const countTables = {
  complaints: 'Complaints',
  customers: 'Customers',
  technicians: 'Technicians',
  payments: 'Payments',
}

const iconMap = {
  'Raise Complaint': 'wrench',
  'My Complaints': 'ticket',
  'Service History': 'history',
  'AMC Details': 'shield',
  Payments: 'card',
  'My Profile': 'user',
  Reports: 'chart',
  Complaints: 'ticket',
  Customers: 'users',
  Technicians: 'tool',
  'User Accounts': 'userPlus',
  Products: 'box',
  AMC: 'shield',
  Settings: 'settings',
  'Find Complaint': 'search',
  "Today's Visits": 'calendar',
  'Collect Payment': 'card',
}

function Icon({ name, size = 24 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const icons = {
    wrench: (
      <>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a2.1 2.1 0 1 0 3 3l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.1-2.2-2.2z" />
      </>
    ),
    ticket: (
      <>
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v2a2 2 0 0 0 0 5v2a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-2a2 2 0 0 0 0-5z" />
        <path d="M13 8v2M13 14v2" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3l7 3v5c0 4.5-3 8.1-7 10-4-1.9-7-5.5-7-10V6z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    card: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21a7 7 0 0 1 14 0" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="3" />
        <path d="M17 11a3 3 0 1 0-1-5.8M21 21v-2a4 4 0 0 0-3-3.9" />
      </>
    ),
    userPlus: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 21a6 6 0 0 1 12 0M19 8v6M16 11h6" />
      </>
    ),
    tool: (
      <>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17a2.1 2.1 0 1 0 3 3l5.7-5.7a4 4 0 0 0 5.4-5.4l-2.5 2.1-2.2-2.2z" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19V5M4 19h17" />
        <path d="m7 15 4-4 3 2 5-6" />
      </>
    ),
    box: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
        <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.6-1H6v-2.6h.4A1.7 1.7 0 0 0 8 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.6v.4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1V14h-.1a1.7 1.7 0 0 0-1.6 1z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
  }

  return <svg {...common}>{icons[name] || icons.user}</svg>
}

export default function RoleDashboard({ profile, onSelectModule }) {
  const role = profile?.role
  const items = role && modules[role] ? modules[role] : []
  const [counts, setCounts] = useState({})

  useEffect(() => {
    let cancelled = false

    async function loadCounts() {
      if (role !== 'admin') return

      const entries = await Promise.all(
        Object.entries(countTables).map(async ([key, table]) => {
          const { count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })

          return [key, count || 0]
        }),
      )

      if (!cancelled) {
        setCounts(Object.fromEntries(entries))
      }
    }

    loadCounts()

    return () => {
      cancelled = true
    }
  }, [role])

  return (
    <section className={`role-dashboard role-dashboard--${role || 'guest'}`}>
      <div className="dashboard-heading">
        <div>
          <span className="dashboard-kicker">
            SECURE SERVICE PORTAL
          </span>

          <div className="dashboard-title-row">
            <h2>{roleLabel(role)} Dashboard</h2>

            <span className="dashboard-live">
              <span />
              LIVE
            </span>
          </div>

          <p className="dashboard-subtitle">
            Your complete CCTV & security service command center.
            Everything you need, right at your fingertips.
          </p>
        </div>
      </div>

      {role === 'admin' && (
        <div className="admin-stats">
          <div className="dashboard-stat-card">
            <span className="stat-icon">
              <Icon name="ticket" size={19} />
            </span>
            <div>
              <strong>{counts.complaints ?? '—'}</strong>
              <span>Complaints</span>
            </div>
          </div>

          <div className="dashboard-stat-card">
            <span className="stat-icon">
              <Icon name="users" size={19} />
            </span>
            <div>
              <strong>{counts.customers ?? '—'}</strong>
              <span>Customers</span>
            </div>
          </div>

          <div className="dashboard-stat-card">
            <span className="stat-icon">
              <Icon name="tool" size={19} />
            </span>
            <div>
              <strong>{counts.technicians ?? '—'}</strong>
              <span>Technicians</span>
            </div>
          </div>

          <div className="dashboard-stat-card">
            <span className="stat-icon">
              <Icon name="card" size={19} />
            </span>
            <div>
              <strong>{counts.payments ?? '—'}</strong>
              <span>Payments</span>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-section-label">
        <span>QUICK ACTIONS</span>
        <i />
      </div>

      <div className="modules">
        {items.map(([item, description], index) => (
          <button
            key={item}
            type="button"
            className={`module-card module-card--${index + 1}`}
            onClick={() =>
              onSelectModule?.(
                role === 'customer' && item === 'My Complaints'
                  ? '__MY_COMPLAINTS__'
                  : item,
              )
            }
          >
            <div className="module-card-glow" />

            <div className="module-icon">
              <Icon
                name={iconMap[item] || 'user'}
                size={25}
              />
            </div>

            <div className="module-card-copy">
              <h3>{item}</h3>
              <p>{description}</p>
            </div>

            <span className="module-arrow" aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
