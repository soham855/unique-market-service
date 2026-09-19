import {useEffect,useRef,useState} from 'react'
import {jsPDF} from 'jspdf'
import {supabase} from '../lib/supabase'

export default function ServiceReportModule({profile,onBack}){
 const [complaints,setComplaints]=useState([]),[selected,setSelected]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState('')
 const [work,setWork]=useState(''),[diagnosis,setDiagnosis]=useState(''),[labour,setLabour]=useState('0'),[parts,setParts]=useState([{name:'',qty:'1',amount:'0'}]),[before,setBefore]=useState(null),[after,setAfter]=useState(null),[otp,setOtp]=useState('')
 const canvasRef=useRef(null),drawing=useRef(false)
 useEffect(()=>{loadComplaints()},[profile?.id])
 async function loadComplaints(){
  setLoading(true);const {data,error}=await supabase.from('complaints').select('id,ticket_no,complaint_no,title,customer_name,customer_phone,company_name,address,location_text,status,technician_id,created_at').eq('technician_id',profile.id).neq('status','completed').order('created_at',{ascending:false})
  if(!error)setComplaints(data||[]);else setMessage(error.message);setLoading(false)
 }
 function clearSignature(){const c=canvasRef.current;if(c)c.getContext('2d').clearRect(0,0,c.width,c.height)}
 function pointer(e){const c=canvasRef.current;if(!c)return;const r=c.getBoundingClientRect(),x=(e.clientX-r.left)*(c.width/r.width),y=(e.clientY-r.top)*(c.height/r.height),ctx=c.getContext('2d');if(e.type==='pointerdown'){drawing.current=true;ctx.beginPath();ctx.moveTo(x,y)}else if(e.type==='pointermove'&&drawing.current){ctx.lineTo(x,y);ctx.stroke()}else if(e.type==='pointerup'||e.type==='pointerleave')drawing.current=false}
 function reset(){setSelected(null);setWork('');setDiagnosis('');setLabour('0');setParts([{name:'',qty:'1',amount:'0'}]);setBefore(null);setAfter(null);setOtp('');clearSignature()}
 function addPart(){setParts(p=>[...p,{name:'',qty:'1',amount:'0'}])}
 function updatePart(i,k,v){setParts(p=>p.map((x,n)=>n===i?{...x,[k]:v}:x))}
 async function upload(file,prefix){if(!file)return '';const ext=file.name.split('.').pop()||'jpg',path=profile.id+'/'+Date.now()+'-'+prefix+'.'+ext;const {error}=await supabase.storage.from('service-reports').upload(path,file,{upsert:true,contentType:file.type});if(error)throw error;return supabase.storage.from('service-reports').getPublicUrl(path).data.publicUrl}
 async function saveReport(){
  if(!selected||!work.trim()){setMessage('Select a complaint and enter work completed.');return}setSaving(true);setMessage('')
  try{
   const signature=canvasRef.current?.toDataURL('image/png')||'',cleanParts=parts.filter(p=>p.name.trim()).map(p=>({...p,qty:Number(p.qty)||1,amount:Number(p.amount)||0}))
   const beforeUrl=await upload(before,'before'),afterUrl=await upload(after,'after'),reportNo='UM-SR-'+new Date().getFullYear()+'-'+String(Date.now()).slice(-6),verified=/^\d{6}$/.test(otp.trim())
   const {data:report,error}=await supabase.from('service_reports').insert({complaint_id:selected.id,technician_id:profile.id,work_summary:work.trim(),diagnosis:diagnosis.trim()||null,parts_used:cleanParts,labour_amount:Number(labour)||0,before_photo_url:beforeUrl||null,after_photo_url:afterUrl||null,customer_signature:signature||null,customer_otp:otp.trim()||null,customer_otp_verified:verified,customer_approved_at:(signature||verified)?new Date().toISOString():null,report_number:reportNo}).select('*').single()
   if(error)throw error
   await supabase.from('complaints').update({status:'completed',completed_at:new Date().toISOString(),resolution_notes:work.trim(),updated_at:new Date().toISOString()}).eq('id',selected.id)
   const pdf=new jsPDF();pdf.setFontSize(18);pdf.text('UNIQUE MARKET',20,20);pdf.setFontSize(11);pdf.text('Digital Service Report',20,28);pdf.text('Report: '+reportNo,20,37);pdf.text('Ticket: '+(selected.ticket_no||selected.complaint_no||selected.id.slice(0,8)),20,44);pdf.text('Customer: '+(selected.customer_name||''),20,51);pdf.text('Company: '+(selected.company_name||''),20,58);pdf.text('Technician: '+(profile.full_name||''),20,65);pdf.text('Date: '+new Date().toLocaleString('en-IN'),20,72)
   let y=84;const wrap=(label,value)=>{pdf.setFont(undefined,'bold');pdf.text(label,20,y);pdf.setFont(undefined,'normal');const lines=pdf.splitTextToSize(value||'-',165);pdf.text(lines,20,y+7);y+=7+lines.length*6+5}
   wrap('Diagnosis',diagnosis);wrap('Work Completed',work);wrap('Parts Used',cleanParts.map(p=>p.name+' × '+p.qty+' — ₹'+p.amount).join(' | '));wrap('Labour','₹'+(Number(labour)||0));wrap('Customer Confirmation',signature?'Signature captured':(verified?'OTP verified':'Not captured'))
   if(beforeUrl){pdf.addImage(beforeUrl,'JPEG',20,y,75,55);y+=62}if(afterUrl){pdf.addImage(afterUrl,'JPEG',105,y,75,55);y+=62}pdf.text('Thank you for choosing Unique Market.',20,285);pdf.save(reportNo+'.pdf')
   await supabase.from('service_reports').update({pdf_generated_at:new Date().toISOString()}).eq('id',report.id);setMessage('Service report '+reportNo+' saved and PDF generated.');reset();await loadComplaints()
  }catch(e){setMessage(e.message||'Unable to save service report.')}finally{setSaving(false)}
 }
 return <section className="complaints-panel service-report-panel"><div className="panel-heading"><div><span className="badge">DIGITAL SERVICE REPORT</span><h2>Complete Technician Work</h2><p>Before/after photos, parts, labour and customer confirmation — then generate the PDF automatically.</p></div><button className="secondary" onClick={onBack}>← Back</button></div>
 {loading?<p className="muted">Loading assigned work…</p>:!selected?<div className="service-report-jobs">{complaints.length===0?<div className="module-card"><h3>No open assigned complaints</h3><p>Assigned service tickets will appear here.</p></div>:complaints.map(c=><button key={c.id} className="module-card service-job-card" onClick={()=>setSelected(c)}><div><span className="badge">{c.ticket_no||c.complaint_no||'TICKET'}</span><h3>{c.title||'Service request'}</h3><p>{c.customer_name||'Customer'} · {c.company_name||''}</p></div><span>→</span></button>)}</div>:<div className="service-report-form">
 <div className="module-card"><span className="badge">{selected.ticket_no||selected.complaint_no||'TICKET'}</span><h3>{selected.title||'Service request'}</h3><p>{selected.customer_name} · {selected.customer_phone||''}</p></div>
 <label>Diagnosis<textarea value={diagnosis} onChange={e=>setDiagnosis(e.target.value)} rows="2" placeholder="What was found?"/></label><label>Work Completed *<textarea value={work} onChange={e=>setWork(e.target.value)} rows="4" placeholder="Describe work completed…"/></label>
 <label>Labour (₹)<input type="number" min="0" value={labour} onChange={e=>setLabour(e.target.value)}/></label>
 <div><div className="form-section-title">Parts Used</div>{parts.map((p,i)=><div className="part-row" key={i}><input placeholder="Part name" value={p.name} onChange={e=>updatePart(i,'name',e.target.value)}/><input type="number" min="1" placeholder="Qty" value={p.qty} onChange={e=>updatePart(i,'qty',e.target.value)}/><input type="number" min="0" placeholder="Amount" value={p.amount} onChange={e=>updatePart(i,'amount',e.target.value)}/><button type="button" className="secondary" onClick={()=>setParts(x=>x.filter((_,n)=>n!==i))}>×</button></div>)}<button type="button" className="secondary" onClick={addPart}>+ Add Part</button></div>
 <div className="service-report-grid"><label>Before Photo<input type="file" accept="image/*" capture="environment" onChange={e=>setBefore(e.target.files?.[0]||null)}/></label><label>After Photo<input type="file" accept="image/*" capture="environment" onChange={e=>setAfter(e.target.files?.[0]||null)}/></label></div>
 <div><div className="form-section-title">Customer Signature</div><canvas ref={canvasRef} width="700" height="220" className="signature-pad" onPointerDown={pointer} onPointerMove={pointer} onPointerUp={pointer} onPointerLeave={pointer}/><button type="button" className="secondary" onClick={clearSignature}>Clear Signature</button></div>
 <label>Customer OTP (optional, 6 digits)<input inputMode="numeric" maxLength="6" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="Enter customer-provided OTP"/></label>
 <div className="service-report-actions"><button type="button" className="secondary" onClick={reset}>Cancel</button><button type="button" onClick={saveReport} disabled={saving}>{saving?'Saving…':'Complete & Generate PDF'}</button></div>
 </div>}
 {message&&<p className={message.toLowerCase().includes('unable')?'error':'muted'}>{message}</p>}</section>
}