import React from 'react'

const reasons=[
 {icon:'✓',title:'Professional Installation',text:'Experienced technicians handle site survey, camera positioning, cabling, configuration and final testing.'},
 {icon:'⚡',title:'Fast Local Support',text:'Local technical assistance for CCTV, networking and IT service requirements across our service areas.'},
 {icon:'◈',title:'Complete Security Solutions',text:'From cameras and DVR/NVR to storage, PoE, networking and AMC support — one trusted team.'},
 {icon:'₹',title:'Transparent & Practical Pricing',text:'Solutions are planned around your coverage needs, site conditions and budget without unnecessary extras.'},
 {icon:'↻',title:'Reliable AMC & Maintenance',text:'Preventive maintenance, health checks and troubleshooting help keep your surveillance system running.'},
 {icon:'★',title:'Business-Focused Service',text:'We support homes, shops, offices, factories, warehouses, commercial sites and institutional requirements.'}
]

export default function WhyChooseUniqueMarket(){
 return <section className='why-choose-unique'>
  <style>{`\
  .why-choose-unique{width:min(1240px,calc(100% - 36px));margin:0 auto 80px;padding:72px 0;border-top:1px solid rgba(148,163,184,.08)}\
  .why-choose-unique .why-label{color:#67e8f9;font-size:10px;font-weight:950;letter-spacing:.2em;text-transform:uppercase}\
  .why-choose-unique .why-head{display:grid;grid-template-columns:1fr .72fr;gap:50px;align-items:end;margin:12px 0 30px}\
  .why-choose-unique h2{margin:0;max-width:700px;color:#f4f8fc;font-size:clamp(32px,4vw,50px);line-height:1.02;letter-spacing:-.045em}\
  .why-choose-unique h2 span{color:#22d3ee}\
  .why-choose-unique .why-intro{margin:0;color:#8190a4;font-size:13px;line-height:1.8}\
  .why-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}\
  .why-card{position:relative;padding:24px;min-height:205px;border:1px solid rgba(148,163,184,.12);border-radius:20px;background:linear-gradient(145deg,rgba(17,28,44,.8),rgba(6,12,23,.82));transition:.3s;overflow:hidden}\
  .why-card:after{content:'';position:absolute;width:120px;height:120px;right:-55px;top:-55px;border-radius:50%;background:rgba(34,211,238,.07);filter:blur(12px)}\
  .why-card:hover{transform:translateY(-5px);border-color:rgba(34,211,238,.3);box-shadow:0 20px 55px rgba(0,0,0,.25)}\
  .why-icon{position:relative;z-index:1;width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(103,232,249,.22);border-radius:12px;background:rgba(34,211,238,.06);color:#67e8f9;font-size:17px;font-weight:950}\
  .why-card h3{margin:17px 0 8px;font-size:15px;color:#f2f7fb}\
  .why-card p{margin:0;color:#8190a4;font-size:11px;line-height:1.7}\
  @media(max-width:850px){.why-head{grid-template-columns:1fr!important;gap:16px!important}.why-grid{grid-template-columns:1fr 1fr}}\
  @media(max-width:560px){.why-choose-unique{padding:50px 0;margin-bottom:55px}.why-grid{grid-template-columns:1fr}.why-card{min-height:auto}}\
  `}</style>
  <div className='why-label'>WHY CHOOSE UNIQUE MARKET</div>
  <div className='why-head'>
   <h2>Security that is <span>planned right, installed right & supported right.</span></h2>
   <p className='why-intro'>Choose a local technology partner that combines professional installation, practical solutions and dependable after-sales support for CCTV, networking and IT infrastructure.</p>
  </div>
  <div className='why-grid'>
   {reasons.map(reason=><article className='why-card' key={reason.title}>
    <div className='why-icon'>{reason.icon}</div>
    <h3>{reason.title}</h3>
    <p>{reason.text}</p>
   </article>)}
  </div>
 </section>
}
