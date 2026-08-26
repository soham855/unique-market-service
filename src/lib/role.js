import { getMyProfile } from './profile'

export async function getUserRole() {
  const profile = await getMyProfile()
  return profile?.role || 'customer'
}

export function roleLabel(role) {
  return ({ admin: 'Administrator', technician: 'Technician', customer: 'Customer' })[role] || 'Customer'
}
