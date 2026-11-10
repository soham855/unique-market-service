import React from 'react'
const PHONE='7350060071'
const ADDRESS='Station Road, Hotel Rajdoot, Ichalkaranji'
const MESSAGE='Hello Unique Market, I am interested in the 4 Camera CCTV Setup offer for ₹13,999.'
export default function CCTVOfferSlider(){
 const whatsapp=`https://wa.me/91${PHONE}?text=${encodeURIComponent(MESSAGE)}`
 return <section className="um-offer-wrap" aria-label="4 camera CCTV offer">
  <style>{`
   .um-offer-wrap{width:min(1180px,calc(100% - 32px));margin:12px auto 24px}
   .um-offer-slide{display:grid;grid-template-columns:1fr auto;align-items:center;gap:18px;padding:18px 24px;border:1px solid rgba(103,232,249,.25);border-radius:18px;background:radial-gradient(circle at 85% 10%,rgba(34,211,238,.17),transparent 30%),linear-gradient(110deg,#07152c,#0b2a52 60%,#071326);box-shadow:0 10px 30px rgba(0,0,0,.16)}
   .um-offer-tag{display:inline-block;padding:4px 9px;border-radius:20px;background:rgba(250,204,21,.13);color:#fde68a;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
   .um-offer-title{margin:7px 0 5px;color:#fff;font-size:clamp(21px,3vw,32px);line-height:1.05;font-weight:950;letter-spacing:-.035em}
   .um-offer-title span{color:#67e8f9}
   .um-offer-details{margin:0;color:#c6d5e6;font-size:11px;line-height:1.55}
   .um-offer-pricebox{display:flex;align-items:center;gap:14px}
   .um-offer-price{color:#fff;font-size:clamp(27px,3.6vw,40px);font-weight:1000;white-space:nowrap;letter-spacing:-.05em}
   .um-offer-price small{display:block;color:#fde68a;font-size:9px;letter-spacing:.12em;text-align:center}
   .um-offer-buttons{display:flex;flex-direction:column;gap:6px;min-width:126px}
   .um-offer-buttons a{padding:9px 12px;border-radius:9px;text-align:center;text-decoration:none;font-size:10px;font-weight:900;white-space:nowrap}
   .um-offer-wa{background:#16a34a;color:#fff}.um-offer-call{border:1px solid #64748b;color:#fff}
   .um-offer-address{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:7px 3px 0;color:#8194ad;font-size:9px}
   .um-offer-address strong{color:#cbd5e1}
   @media(max-width:600px){.um-offer-wrap{width:calc(100% - 20px);margin:9px auto 18px}.um-offer-slide{grid-template-columns:1fr auto;gap:8px;padding:14px;border-radius:14px}.um-offer-title{font-size:22px}.um-offer-details{font-size:10px;max-width:310px}.um-offer-pricebox{flex-direction:column;gap:6px;align-items:center}.um-offer-price{font-size:27px}.um-offer-buttons{min-width:100px}.um-offer-buttons a{padding:8px 7px;font-size:9px}.um-offer-address{font-size:8px}}
   @media(max-width:370px){.um-offer-slide{grid-template-columns:1fr}.um-offer-pricebox{flex-direction:row;justify-content:space-between}.um-offer-buttons{flex-direction:row;min-width:0}.um-offer-buttons a{flex:1}}
  `}</style>
  <div className="um-offer-slide">
   <div><span className="um-offer-tag">Special CCTV Combo Offer</span><h2 className="um-offer-title">4 Camera CCTV Setup <span>• FREE Installation</span></h2><p className="um-offer-details">Mobile View • Day &amp; Night Color • 4CH DVR • Power Supply • 50m Cable • 8 BNC + 4 DC Connectors</p></div>
   <div className="um-offer-pricebox"><div className="um-offer-price">₹13,999/-<small>COMPLETE SETUP</small></div><div className="um-offer-buttons"><a className="um-offer-wa" href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a><a className="um-offer-call" href={`tel:+91${PHONE}`}>Call {PHONE}</a></div></div>
  </div>
  <div className="um-offer-address"><span><strong>UNIQUE MARKET</strong> • CCTV | IT Security | Service &amp; AMC</span><span>{ADDRESS} • salesuniquemarket.com</span></div>
 </section>
}
