import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const categories = {
  cctv: ['📹 CCTV / Camera', ['Camera Not Working','Camera Offline','No Video / Black Screen','Blurred / Low Quality Video','Night Vision Problem','Camera Recording Problem','Motion Detection Problem','Camera Angle / Position Problem','IR Light Problem','Cable / Connector Problem','Camera Power Problem','Multiple Cameras Not Working','Mobile Viewing Problem','Remote Viewing / Hik-Connect Problem','New Camera Installation','Camera Relocation','Camera Configuration','Other CCTV Problem']],
  dvr_nvr: ['💾 DVR / NVR / Storage', ['DVR/NVR Not Working','No Recording','HDD Not Detected','HDD Error / Bad Sector','Recording Playback Problem','Backup Problem','Date/Time Problem','Channel Not Showing','Network Configuration','Remote Access Problem','NVR/DVR Configuration','Firmware / Software Problem','Other DVR/NVR Problem']],
  computer: ['💻 Computer / Laptop', ['Computer Not Starting','Windows Problem','Slow Computer','Hanging / Freezing','Blue Screen / Error','Software Installation','Software Not Working','Driver Problem','Internet Problem','Wi-Fi Problem','LAN Problem','Keyboard Problem','Mouse Problem','Monitor / Display Problem','Printer Connection Problem','Data Backup / Recovery','Virus / Malware Problem','HDD / SSD Problem','RAM Problem','SMPS / Power Problem','New Computer Installation','Computer Formatting','Windows Installation','Other Computer Problem']],
  network: ['🌐 Networking / Internet', ['Internet Not Working','Slow Internet','LAN Not Working','Wi-Fi Not Working','Network Disconnection','Router Problem','Switch Problem','PoE Switch Problem','IP Address Problem','DHCP Problem','DNS Problem','Network Cable Problem','Connector Problem','Network Configuration','New Network Installation','Other Networking Problem']],
  printer: ['🖨️ Printer / Scanner', ['Printer Not Working','Printer Offline','Paper Jam','Printing Quality Problem','Ink / Toner Problem','Printer Network Problem','USB Connection Problem','Scanner Not Working','Scan Quality Problem','Driver Problem','Printer Installation','Printer Configuration','Other Printer Problem']],
  access_control: ['🔐 Biometric / Access Control', ['Fingerprint Not Working','Face Recognition Problem','Card Not Working','Attendance Not Syncing','Device Offline','Door Lock Problem','Exit Button Problem','Power Supply Problem','Software Problem','Network Problem','New Installation','Configuration Problem','Other Access Control Problem']],
  vdp: ['🚪 Video Door Phone', ['Indoor Unit Problem','Outdoor Unit Problem','No Video','No Audio','Door Unlock Problem','Calling Problem','Network Problem','Power Problem','Installation','Configuration','Other VDP Problem']],
  tv: ['📺 TV / Display', ['TV Not Turning On','No Display','No Signal','HDMI Problem','Display Quality Problem','Audio Problem','Remote Problem','Wall Mount / Installation','Configuration','Other Display Problem']],
  wifi_router: ['📡 Wi-Fi / Router', ['Wi-Fi Not Working','Slow Wi-Fi','Wi-Fi Range Problem','Router Not Working','Router Configuration','Password / SSID Configuration','Internet Connection Problem','Network Drop','New Wi-Fi Installation','Other Wi-Fi Problem']],
  ups: ['🔌 Power / UPS', ['UPS Not Working','Battery Problem','Backup Time Problem','Power Failure','Adapter Problem','SMPS Problem','Voltage Problem','Power Cable Problem','Installation','Battery Replacement','Other Power Problem']],
  installation: ['🛠️ Installation / Configuration', ['New CCTV Installation','Computer Installation','Network Installation','Printer Installation','Wi-Fi Installation','DVR/NVR Configuration','Camera Configuration','Software Installation','Device Relocation','System Upgrade','Other Installation']],
  amc: ['🔧 AMC / Maintenance', ['Preventive Maintenance','CCTV Maintenance','Computer Maintenance','Network Maintenance','Cleaning Required','System Health Check','AMC Service Visit','Breakdown Service','Other AMC Request']],
  hardware: ['📦 Product / Hardware', ['Product Not Working','Warranty Service','Hardware Replacement','Product Installation','Product Configuration','Damaged Product','Product Compatibility','Upgrade Required','Other Hardware Problem']]
}
const defaultActive = Object.keys(categories)

export default function CustomerComplaintModule({ profile, activeModule = 'Complaints', onSubmitted }) {
  const [items, setItems] = useState([])
  const [activeCategories, setActiveCategories] = useState(defaultActive)
  const [maxRadiusKm, setMaxRadiusKm] = useState(20)
  const [form, setForm] = useState({ customer_name:profile?.full_name || '', customer_phone:profile?.phone || '', company_name:profile?.company_name || '', category:'', problem:'', priority:'normal', location_text:profile?.address || '', description:'' })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const moduleKey = String(activeModule || '').trim().toLowerCase()
  const isMyComplaints = moduleKey === 'my complaints'
  const isRaiseComplaint = moduleKey === 'raise complaint'

  useEffect(() => {
    setForm(f => ({ ...f, customer_name:profile?.full_name || f.customer_name, customer_phone:profile?.phone || f.customer_phone, company_name:profile?.company_name || f.company_name, location_text:profile?.address || f.location_text }))
  }, [profile?.full_name, profile?.phone, profile?.company_name, profile?.address])

  async function loadAccess() {
    if (!supabase) return
    const { data, error } = await supabase.from('service_access_settings').select('max_radius_km,active_categories').limit(1).maybeSingle()
    if (!error && data) {
      setMaxRadiusKm(Number(data.max_radius_km) || 20)
      setActiveCategories(Array.isArray(data.active_categories) && data.active_categories.length ? data.active_categories : defaultActive)
    }
  }
  async function load() {
    if (!supabase || !profile?.id) return
    const { data, error } = await supabase.from('complaints').select('id,title,description,category,priority,status,location_text,created_at,customer_name,customer_phone,company_name').eq('customer_id', profile.id).order('created_at',{ascending:false})
    if (error) setMessage(error.message); else setItems(data || [])
  }
  useEffect(() => { load(); loadAccess() }, [profile?.id])

  async function useMyLocation() {
    if (!navigator.geolocation) return setMessage('Location is not supported by this browser.')
    setLocating(true); setMessage('Getting your location…')
    navigator.geolocation.getCurrentPosition(async ({coords}) => {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&addressdetails=1`
        const response = await fetch(url, { headers:{ Accept:'application/json', 'Accept-Language':'en-IN' } })
        const data = await response.json()
        const address = data.display_name || `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`
        const pincode = data.address?.postcode ? `, Pincode: ${data.address.postcode}` : ''
        setForm(f => ({ ...f, location_text:`${address}${pincode}` }))
        setMessage(`Location detected. Admin service radius: ${maxRadiusKm} km.`)
      } catch { setMessage('Location found, but address lookup failed. Please enter the address manually.') }
      finally { setLocating(false) }
    }, error => { setLocating(false); setMessage(error.message || 'Unable to get your location.') }, { enableHighAccuracy:true, timeout:15000, maximumAge:60000 })
  }

  async function createComplaint(e) {
    e.preventDefault(); setMessage(''); setLoading(true)
    try {
      if (!form.customer_name.trim()) throw new Error('Customer Name is required.')
      if (!form.customer_phone.trim()) throw new Error('Mobile Number is required.')
      if (!form.location_text.trim()) throw new Error('Service Address is required.')
      if (!form.category || !activeCategories.includes(form.category)) throw new Error('Please select an available service category.')
      if (!form.problem) throw new Error('Problem is required.')
      if (!form.priority) throw new Error('Priority is required.')
      const title = `${categories[form.category][0].replace(/^\S+\s/,'')} - ${form.problem}`
      const { error } = await supabase.from('complaints').insert({ customer_id:profile.id, customer_name:form.customer_name.trim(), customer_phone:form.customer_phone.trim(), company_name:form.company_name.trim() || null, title, description:form.description.trim() || form.problem, category:form.category, priority:form.priority, location_text:form.location_text.trim() })
      if (error) throw error
      await load(); setForm(f=>({ ...f, category:'', problem:'', priority:'normal', description:'' }))
      setMessage('Complaint raised successfully. It is now available in My Complaints.')
      if (onSubmitted) onSubmitted()
    } catch (error) { setMessage(error.message || 'Unable to submit complaint') }
    finally { setLoading(false) }
  }

  const visibleCategories = Object.entries(categories).filter(([id]) => activeCategories.includes(id))
  const problems = form.category ? categories[form.category]?.[1] || [] : []

  // My Complaints is a strict read-only route. No complaint form is rendered here.
  if (isMyComplaints) return <section className="complaints-panel">
    <div className="panel-heading"><div><span className="badge">SERVICE DESK</span><h2>My Complaints</h2><p>Track your complaints and service status.</p></div><button className="secondary" onClick={load}>Refresh</button></div>
    <div className="complaint-list">{items.length === 0 ? <p className="muted">No complaints found.</p> : items.map(item=><article className="complaint-card" key={item.id}><div><h3>{item.title}</h3><p>{item.description}</p><small>{item.customer_name || ''}{item.customer_phone ? ` · ${item.customer_phone}` : ''}{item.company_name ? ` · ${item.company_name}` : ''} · {item.category} · {item.priority} · {new Date(item.created_at).toLocaleString()}</small><p><strong>Status:</strong> {item.status?.replaceAll('_',' ') || 'Pending'}</p></div></article>)}</div>
  </section>

  return <section className="complaints-panel">
    <div className="panel-heading"><div><span className="badge">SERVICE DESK</span><h2>{isRaiseComplaint ? 'Raise Complaint' : 'Complaint Management'}</h2><p>{isRaiseComplaint ? 'Select a service category, then choose the exact problem.' : 'View your complaints and their current service status.'}</p></div><button className="secondary" onClick={()=>{load();loadAccess()}}>Refresh</button></div>
    {isRaiseComplaint && <form className="complaint-form" onSubmit={createComplaint}>
      <input placeholder="Customer Name" value={form.customer_name} onChange={e=>setForm({...form,customer_name:e.target.value})} required />
      <input type="tel" placeholder="Mobile Number" value={form.customer_phone} onChange={e=>setForm({...form,customer_phone:e.target.value})} required />
      <input placeholder="Company Name (Optional)" value={form.company_name} onChange={e=>setForm({...form,company_name:e.target.value})} />
      <div><label>Service Address</label><input placeholder="Service Address" value={form.location_text} onChange={e=>setForm({...form,location_text:e.target.value})} required /><button type="button" className="secondary" onClick={useMyLocation} disabled={locating}>{locating ? 'Detecting…' : '📍 Use My Location'}</button></div>
      <select value={form.category} onChange={e=>setForm({...form,category:e.target.value,problem:''})} required><option value="">Select Service Category</option>{visibleCategories.map(([id,[label]])=><option key={id} value={id}>{label}</option>)}</select>
      {form.category && <select value={form.problem} onChange={e=>setForm({...form,problem:e.target.value})} required><option value="">Select Specific Problem</option>{problems.map(p=><option key={p} value={p}>{p}</option>)}</select>}
      <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} required><option value="">Select Priority</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
      <textarea placeholder="Additional Details (Optional)" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows="4" />
      <small className="muted">Admin service radius: {maxRadiusKm} km</small>
      <button disabled={loading || !form.problem}>{loading ? 'Submitting…' : 'Raise Complaint'}</button>
    </form>}
    {message && isRaiseComplaint && <p className="muted">{message}</p>}
  </section>
}
