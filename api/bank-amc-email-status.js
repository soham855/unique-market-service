const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ready: false, error: 'GET required' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://tfscvycomllamoubtlcf.supabase.co'
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_VeJIjcsILLniCHf2HjA20A_xlMydma'
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''

  if (!token) return res.status(401).json({ ready: false, error: 'Sign in as an administrator to check email readiness.' })
  if (!resendKey || !fromEmail || !supabaseUrl || !supabaseKey) {
    return res.status(200).json({ ready: false, senderConfigured: Boolean(fromEmail), apiKeyConfigured: Boolean(resendKey), domainVerified: false, error: 'Resend API key or sender address is missing in production environment variables.' })
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` } })
    if (!userResponse.ok) return res.status(401).json({ ready: false, error: 'Your session is invalid. Sign in again.' })
    const user = await userResponse.json()
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` } })
    if (!profileResponse.ok) return res.status(403).json({ ready: false, error: 'Could not verify administrator access.' })
    const profiles = await profileResponse.json()
    if (!profiles.some(profile => String(profile.role || '').toLowerCase() === 'admin')) return res.status(403).json({ ready: false, error: 'Administrator access required.' })

    const domainsResponse = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${resendKey}` } })
    if (!domainsResponse.ok) {
      const status = domainsResponse.status
      return res.status(200).json({ ready: false, senderConfigured: true, apiKeyConfigured: true, domainVerified: false, error: status === 401 || status === 403 ? 'Resend rejected the API key. Check the production key in Vercel.' : `Could not verify Resend configuration (HTTP ${status}).` })
    }
    const domainsPayload = await domainsResponse.json()
    const senderDomain = String(fromEmail).split('@').pop().toLowerCase()
    const domains = Array.isArray(domainsPayload.data) ? domainsPayload.data : []
    const matched = domains.find(domain => String(domain.name || '').toLowerCase() === senderDomain)
    const domainVerified = Boolean(matched && String(matched.status || '').toLowerCase() === 'verified')
    return res.status(200).json({
      ready: Boolean(domainVerified),
      senderConfigured: true,
      apiKeyConfigured: true,
      domainVerified,
      senderDomain,
      domainStatus: matched?.status || 'not_found',
      error: domainVerified ? null : matched ? `The sender domain is not verified in Resend (status: ${matched.status || 'unknown'}).` : `The sender domain ${senderDomain} was not found in this Resend account.`
    })
  } catch {
    return res.status(200).json({ ready: false, error: 'Could not reach Resend to verify configuration. No email was sent.' })
  }
}
