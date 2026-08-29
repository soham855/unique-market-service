import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const categories = {
  'CCTV / Camera': ['Camera Not Working','Camera Offline','No Video / Black Screen','Blurred / Low Quality Video','Night Vision Problem','Camera Recording Problem','Motion Detection Problem','Camera Angle / Position Problem','IR Light Problem','Audio Problem','PTZ Problem','Cable / Connector Problem','Camera Power Problem','Multiple Cameras Not Working','Mobile Viewing Problem','Remote Viewing / Hik-Connect Problem','New Camera Installation','Camera Relocation','Camera Configuration','Other CCTV Problem'],
  'DVR / NVR / Storage': ['DVR/NVR Not Working','No Recording','HDD Not Detected','HDD Error / Bad Sector','Recording Playback Problem','Backup Problem','Date/Time Problem','Channel Not Showing','Network Configuration','Remote Access Problem','NVR/DVR Configuration','Firmware / Software Problem','Other DVR/NVR Problem'],
  'Computer / Laptop': ['Computer Not Starting','Windows Problem','Slow Computer','Hanging / Freezing','Blue Screen / Error','Software Installation','Software Not Working','Driver Problem','Internet Problem','Wi-Fi Problem','LAN Problem','Keyboard Problem','Mouse Problem','Monitor / Display Problem','Printer Connection Problem','Data Backup / Recovery','Virus / Malware Problem','HDD / SSD Problem','RAM Problem','SMPS / Power Problem','New Computer Installation','Computer Formatting','Windows Installation','Other Computer Problem'],
  'Networking / Internet': ['Internet Not Working','Slow Internet','LAN Not Working','Wi-Fi Not Working','Network Disconnection','Router Problem','Switch Problem','PoE Switch Problem','IP Address Problem','DHCP Problem','DNS Problem','Network Cable Problem','Connector Problem','Network Configuration','New Network Installation','Other Networking Problem'],
  'Printer / Scanner': ['Printer Not Working','Printer Offline','Paper Jam','Printing Quality Problem','Ink / Toner Problem','Printer Network Problem','USB Connection Problem','Scanner Not Working','Scan Quality Problem','Driver Problem','Printer Installation','Printer Configuration','Other Printer Problem'],
  'Biometric / Access Control': ['Fingerprint Not Working','Face Recognition Problem','Card Not Working','Attendance Not Syncing','Device Offline','Door Lock Problem','Exit Button Problem','Power Supply Problem','Software Problem','Network Problem','New Installation','Configuration Problem','Other Access Control Problem'],
  'Video Door Phone': ['Indoor Unit Problem','Outdoor Unit Problem','No Video','No Audio','Door Unlock Problem','Calling Problem','Network Problem','Power Problem','Installation','Configuration','Other VDP Problem'],
  'TV / Display': ['TV Not Turning On','No Display','No Signal','HDMI Problem','Display Quality Problem','Audio Problem','Remote Problem','Wall Mount / Installation','Configuration','Other Display Problem'],
  'Wi-Fi / Router': ['Wi-Fi Not Working','Slow Wi-Fi','Wi-Fi Range Problem','Router Not Working','Router Configuration','Password / SSID Configuration','Internet Connection Problem','Network Drop','New Wi-Fi Installation','Other Wi-Fi Problem'],
  'Power / UPS': ['UPS Not Working','Battery Problem','Backup Time Problem','Power Failure','Adapter Problem','SMPS Problem','Voltage Problem','Power Cable Problem','Installation','Battery Replacement','Other Power Problem'],
  'Installation / Configuration': ['New CCTV Installation','Computer Installation','Network Installation','Printer Installation','Wi-Fi Installation','DVR/NVR Configuration','Camera Configuration','Software Installation','Device Relocation','System Upgrade','Other Installation'],
  'AMC / Maintenance': ['Preventive Maintenance','CCTV Maintenance','Computer Maintenance','Network Maintenance','Cleaning Required','System Health Check','AMC Service Visit','Breakdown Service','Other AMC Request'],
  'Product / Hardware': ['Product Not Working','Warranty Service','Hardware Replacement','Product Installation','Product Configuration','Damaged Product','Product Compatibility','Upgrade Required','Other Hardware Problem']
}

export default function CustomerComplaintModule({ profile }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ category:'', problem:'', priority:'normal', location_text:'', description:'' })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!supabase || !profile?.id) return
    const { data, error } = await supabase.from('complaints').select('id,title,description,category,priority,status,location_text,created_at').eq('customer_id', profile.id).order('created_at',{ascending:false})
    if (error) setMessage(error.message); else setItems(data || [])
  }
  useEffect(() => { load() }, [profile?.id])

  async function createComplaint(e) {
    e.preventDefault(); setMessage(''); setLoading(true)
    try {
      if (!form.category || !form.problem) throw new Error('Please select a category and problem.')
      const title = `${form.category} - ${form.problem}`
      const { error } = await supabase.from('complaints').insert({ customer_id:profile.id, title, description:form.description || form.problem, category:form.category, priority:form.priority, location_text:form.location_text })
      if (error) throw error
      setForm({category:'',problem:'',priority:'normal',location_text:'',description:''})
      setMessage('Complaint raised successfully. Admin can now assign a technician.')
      await load()
    } catch (error) { setMessage(error.message || 'Unable to submit complaint') }
    finally { setLoading(false) }
  }

  return <section className="complaints-panel">
    <div className="panel-heading"><div><span className="badge">SERVICE DESK</span><h2>Complaint Management</h2><p>Select your service category, then choose the exact problem.</p></div><button className="secondary" onClick={load}>Refresh</button></div>
    <form className="complaint-form" onSubmit={createComplaint}>
      <label>Service Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value,problem:''})} required><option value="">Select Category</option>{Object.keys(categories).map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      {form.category && <label>Problem<select value={form.problem} onChange={e=>setForm({...form,problem:e.target.value})} required><option value="">Select Problem</option>{categories[form.category].map(p=><option key={p} value={p}>{p}</option>)}</select></label>}
      <label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      <label>Service Address<input placeholder="Enter service address" value={form.location_text} onChange={e=>setForm({...form,location_text:e.target.value})} required /></label>
      <label>Additional Details<textarea placeholder="Describe the issue (optional)" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows="4" /></label>
      <button disabled={loading || !form.problem}>{loading ? 'Submitting…' : 'Raise Complaint'}</button>
    </form>
    {message && <p className="muted">{message}</p>}
    <div className="complaint-list"><h3>My Complaints</h3>{items.length === 0 ? <p className="muted">No complaints found.</p> : items.map(item=><article className="complaint-card" key={item.id}><div><h3>{item.title}</h3><p>{item.description}</p><small>{item.category} · {item.priority} · {new Date(item.created_at).toLocaleString()}</small><p><strong>Status:</strong> {item.status?.replaceAll('_',' ')}</p></div></article>)}</div>
  </section>
}
