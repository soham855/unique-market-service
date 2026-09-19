import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const rules = [
  { keys:['camera','cctv','cam'], title:'Camera is not working', steps:['Check whether the camera power/SMPS indicator is ON.','If it is a PoE camera, check the PoE port light and LAN cable.','Open the CCTV app and check whether the camera shows Online/Offline.','If only one camera is affected, try reseating its connector/cable.'], category:'cctv', problem:'Camera Not Working' },
  { keys:['recording','record','playback'], title:'Recording problem', steps:['Check whether the DVR/NVR shows the HDD as Normal/Healthy.','Open Playback and select the affected camera and time range.','Check that date/time is correct on the recorder.','If HDD is not detected or shows an error, do not format it before checking with support.'], category:'dvr_nvr', problem:'Camera Recording Problem' },
  { keys:['black screen','no video','display'], title:'No video / black screen', steps:['Check the camera power and connector.','If possible, check another channel/camera to identify whether the issue is with the camera or recorder channel.','For a monitor black screen, check HDMI/VGA cable and monitor input.'], category:'cctv', problem:'No Video / Black Screen' },
  { keys:['offline','not online','network'], title:'Camera/device appears offline', steps:['Check router/network and PoE/LAN cable connections.','Restart the network device only if it is safe to do so.','Check whether other cameras are also offline.','If all cameras are offline, the issue may be network/recorder related.'], category:'network', problem:'Network Disconnection' },
  { keys:['mobile','app','hik','remote'], title:'Mobile/remote viewing problem', steps:['Check that the phone has internet access.','Check whether the CCTV device is Online in the app.','If the device is offline, check the recorder network cable and router.','Do not share your CCTV password in chat.'], category:'cctv', problem:'Mobile Viewing Problem' },
  { keys:['blur','blurry','clear'], title:'Image quality problem', steps:['Clean the camera lens gently with a soft dry cloth.','Check whether the problem occurs during day, night, or both.','Check focus/IR light and camera position if accessible.'], category:'cctv', problem:'Blurred / Low Quality Video' }
]

function classify(text){
  const t=text.toLowerCase()
  return rules.find(r=>r.keys.some(k=>t.includes(k))) || null
}

export default function CustomerAIAssistant({profile,onBack}){
  const [text,setText]=useState('')
  const [conversation,setConversation]=useState([])
  const [result,setResult]=useState(null)
  const [loading,setLoading]=useState(false)
  const [message,setMessage]=useState('')
  const [listening,setListening]=useState(false)
  const [speechSupported,setSpeechSupported]=useState(false)

  useEffect(()=>{
    setSpeechSupported(typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window))
  },[])

  function toggleVoice(){
    if(typeof window === 'undefined') return
    const Recognition=window.SpeechRecognition || window.webkitSpeechRecognition
    if(!Recognition){
      setMessage('Voice input is not supported on this device/browser. Please use Type.')
      return
    }
    if(listening){
      setListening(false)
      return
    }
    const recognition=new Recognition()
    recognition.lang='mr-IN'
    recognition.interimResults=true
    recognition.continuous=false
    recognition.onstart=()=>{setListening(true);setMessage('🎙️ Listening… Marathi/English मध्ये problem सांगा.')}
    recognition.onresult=e=>{
      let value=''
      for(let i=e.resultIndex;i<e.results.length;i++) value+=e.results[i][0].transcript
      setText(value)
    }
    recognition.onerror=()=>{setListening(false);setMessage('Voice input failed. Please try again or use Type.')}
    recognition.onend=()=>setListening(false)
    recognition.start()
  }

  const diagnosis=useMemo(()=>classify(text),[text])

  function analyse(){
    if(!text.trim()) return
    const r=classify(text)
    setResult(r)
    setConversation(c=>[...c,
      {from:'customer',text:text.trim()},
      {from:'ai',text:r?'I understood this as: '+r.title+'. I will guide you through a few safe checks first.':'I could not confidently identify the issue. I can create a service complaint for a technician to check it.'}
    ])
    setMessage('')
  }

  async function createComplaint(){
    setLoading(true)
    setMessage('')
    try{
      if(!profile?.id) throw new Error('Please sign in again.')
      const {data:customer,error:customerError}=await supabase
        .from('customers')
        .select('id,name,mobile,company_name,address')
        .eq('profile_id',profile.id)
        .maybeSingle()
      if(customerError) throw customerError
      if(!customer) throw new Error('Customer record is not linked to this login. Please ask Admin to link your account.')

      const title=diagnosis?.title||'CCTV / Security service request'
      const description=[
        'AI Assistant complaint',
        'Customer message: '+text.trim(),
        diagnosis?.steps?.length
          ? 'AI basic troubleshooting shown: '+diagnosis.steps.join(' | ')
          : 'Issue could not be classified confidently.'
      ].join('\n')

      const {error}=await supabase.from('complaints').insert({
        customer_id:customer.id,
        customer_name:customer.name||profile.full_name||'Customer',
        customer_phone:customer.mobile||profile.phone||null,
        company_name:customer.company_name||profile.company_name||null,
        title,
        description,
        category:diagnosis?.category||'cctv',
        problem:diagnosis?.problem||'Other CCTV Problem',
        priority:'normal',
        location_text:customer.address||profile.site_address||null
      })
      if(error) throw error

      setConversation(c=>[...c,{from:'ai',text:'Complaint created successfully. Your service team can now review and assign a technician.'}])
      setMessage('Complaint created successfully.')
    }catch(e){
      setMessage(e.message||'Unable to create complaint.')
    }finally{
      setLoading(false)
    }
  }

  return <section className="complaints-panel ai-assistant-panel">
    <div className="panel-heading">
      <div>
        <span className="badge">AI SERVICE ASSISTANT</span>
        <h2>Tell us your CCTV problem</h2>
        <p>Type or use voice to describe the issue. The assistant will try basic troubleshooting first.</p>
      </div>
      <button type="button" className="secondary" onClick={onBack}>← Back</button>
    </div>

    <div className="ai-chat">
      {conversation.length===0 && <div className="module-card">
        <div className="module-icon">🤖</div>
        <div><h3>Example</h3><p>“Camera बंद आहे” / “My camera is offline” / “Recording दिसत नाही.”</p></div>
      </div>}

      {conversation.map((m,i)=><div key={i} className={m.from==='customer'?'ai-message customer':'ai-message'}>
        <strong>{m.from==='customer'?'You':'AI Assistant'}</strong><p>{m.text}</p>
      </div>)}

      {result && <div className="ai-diagnosis">
        <h3>Basic troubleshooting</h3>
        <ol>{result.steps.map((s,i)=><li key={i}>{s}</li>)}</ol>
        <p className="muted">If these checks do not solve the problem, create a complaint below.</p>
        <button type="button" onClick={createComplaint} disabled={loading}>
          {loading?'Creating complaint…':'Create Complaint Automatically'}
        </button>
      </div>}

      {!result && text.trim() && <div className="ai-diagnosis">
        <p>I’m not confident enough to give a specific troubleshooting path.</p>
        <button type="button" onClick={createComplaint} disabled={loading}>
          {loading?'Creating complaint…':'Create Complaint'}
        </button>
      </div>}
    </div>

    <div className="ai-input-mode">
      <button type="button" className={!listening?'active':''} onClick={()=>setMessage('Type your CCTV problem below.')}>⌨️ Type</button>
      <button type="button" className={listening?'active':''} onClick={toggleVoice} disabled={!speechSupported && typeof window !== 'undefined'}>
        {listening?'⏹️ Stop Voice':'🎙️ Voice'}
      </button>
    </div>

    <div className="ai-input-row">
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="उदा. Camera बंद आहे / Camera is offline…" rows="3"/>
      <button type="button" onClick={analyse} disabled={!text.trim()}>Analyse Problem</button>
    </div>

    {message && <p className={message.toLowerCase().includes('unable')||message.toLowerCase().includes('error')?'error':'muted'}>{message}</p>}
  </section>
}
