import React, { useEffect, useRef, useState } from 'react'

export default function ServicePortalAnimation() {
  const [animating, setAnimating] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [showSignin, setShowSignin] = useState(false)
  const [technician, setTechnician] = useState({ bottom: 0, left: 70 })
  const timers = useRef([])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => () => clearTimers(), [])

  const startAnimation = () => {
    if (animating) return
    clearTimers()
    setAnimating(true)
    setShowCamera(false)
    setShowSignin(false)
    setTechnician({ bottom: 0, left: 70 })

    timers.current.push(setTimeout(() => setTechnician({ bottom: 125, left: 80 }), 100))
    timers.current.push(setTimeout(() => setShowCamera(true), 1600))
    timers.current.push(setTimeout(() => setTechnician({ bottom: 0, left: 80 }), 2200))
    timers.current.push(setTimeout(() => setTechnician({ bottom: 0, left: 205 }), 3500))
    timers.current.push(setTimeout(() => {
      setShowSignin(true)
      setAnimating(false)
    }, 4300))
  }

  return <section className='service-portal-section'>
    <style>{`
      .service-portal-section{position:relative;background:linear-gradient(180deg,#030712 0%,#0f172a 100%);padding:80px 20px;overflow:hidden;color:#f8fafc}
      .service-portal-wrap{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:minmax(280px,340px) 1fr;gap:40px;align-items:center}
      .service-portal-card{background:rgba(30,41,59,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(56,189,248,.2);border-radius:18px;padding:30px;box-shadow:0 15px 40px rgba(0,0,0,.45);transition:.3s ease}
      .service-portal-card:hover{transform:translateY(-5px);border-color:#38bdf8;box-shadow:0 18px 45px rgba(56,189,248,.16)}
      .service-portal-eyebrow{font-size:12px;letter-spacing:2px;color:#38bdf8;font-weight:700;margin:0 0 10px;text-transform:uppercase}
      .service-portal-card h2{font-size:28px;margin:0 0 12px;background:linear-gradient(90deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
      .service-portal-card p{font-size:14px;line-height:1.7;color:#94a3b8;margin:0 0 22px}
      .service-portal-btn{width:100%;border:0;border-radius:10px;padding:12px 18px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:white;font-weight:700;cursor:pointer;box-shadow:0 8px 20px rgba(37,99,235,.25);transition:.2s ease}
      .service-portal-btn:hover{transform:translateY(-2px);filter:brightness(1.08)}
      .service-portal-btn:disabled{opacity:.7;cursor:wait;transform:none}
      .service-scene{position:relative;height:360px;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:#1e293b;box-shadow:0 15px 45px rgba(0,0,0,.45)}
      .service-wall{position:absolute;inset:0;background:radial-gradient(circle at 70% 25%,#334155 0%,#0f172a 75%)}
      .service-grid-light{position:absolute;inset:0;opacity:.16;background-image:linear-gradient(rgba(56,189,248,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.12) 1px,transparent 1px);background-size:36px 36px}
      .service-ladder{position:absolute;left:75px;bottom:0;width:44px;height:275px;border-left:5px solid #64748b;border-right:5px solid #64748b;background:repeating-linear-gradient(0deg,transparent,transparent 22px,#64748b 22px,#64748b 26px)}
      .service-camera-mount{position:absolute;top:52px;left:137px;width:16px;height:16px;border-radius:50%;background:#cbd5e1;opacity:0;transition:.3s}
      .service-camera-body{position:absolute;top:55px;left:148px;width:42px;height:23px;border-radius:5px;background:#f8fafc;transform:rotate(-15deg);opacity:0;transition:.3s}
      .service-camera-lens{position:absolute;top:64px;left:173px;width:9px;height:9px;border-radius:50%;background:#0ea5e9;box-shadow:0 0 12px #0ea5e9;opacity:0;transition:.3s}
      .service-camera-mount.show,.service-camera-body.show,.service-camera-lens.show{opacity:1}
      .service-tech{position:absolute;bottom:0;left:70px;width:62px;height:125px;z-index:3;transition:bottom 1.5s cubic-bezier(.25,1,.5,1),left 1s ease}
      .service-head{position:absolute;top:0;left:21px;width:21px;height:21px;background:#fca5a5;border-radius:50%}
      .service-body{position:absolute;top:21px;left:12px;width:38px;height:53px;background:#2563eb;border-radius:8px}
      .service-legs{position:absolute;top:74px;left:16px;width:30px;height:51px;background:#1e3a8a;border-radius:4px}
      .service-hand-camera{position:absolute;top:36px;left:37px;width:20px;height:13px;background:#e2e8f0;border-radius:3px;transition:.25s}
      .service-signin{position:absolute;right:25px;bottom:25px;width:170px;background:rgba(15,23,42,.94);border:1px solid #38bdf8;padding:18px;border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,.55);transform:scale(0);opacity:0;transition:.4s cubic-bezier(.34,1.56,.64,1)}
      .service-signin.show{transform:scale(1);opacity:1}
      .service-signin h3{font-size:14px;margin:0 0 12px}
      .service-input{height:9px;background:#334155;border-radius:5px;margin-bottom:9px}
      .service-mini-btn{height:20px;background:#38bdf8;border-radius:5px}
      @media(max-width:760px){.service-portal-section{padding:60px 16px}.service-portal-wrap{grid-template-columns:1fr;gap:28px}.service-scene{height:330px}.service-ladder{left:48px}.service-camera-mount{left:110px}.service-camera-body{left:121px}.service-camera-lens{left:146px}.service-tech{left:43px}.service-signin{right:16px;bottom:16px}}
    `}</style>

    <div className='service-portal-wrap'>
      <div className='service-portal-card'>
        <p className='service-portal-eyebrow'>UNIQUE MARKET • INSTANT SERVICES</p>
        <h2>Security Service Portal</h2>
        <p>Initialize your service setup, install security hardware, and access your service control dashboard from one place.</p>
        <button className='service-portal-btn' onClick={startAnimation} disabled={animating}>
          {animating ? 'Setting Up…' : 'Access Service Portal'}
        </button>
      </div>

      <div className='service-scene' aria-label='Animated security camera installation'>
        <div className='service-wall' />
        <div className='service-grid-light' />
        <div className='service-ladder' />
        <div className={`service-camera-mount ${showCamera ? 'show' : ''}`} />
        <div className={`service-camera-body ${showCamera ? 'show' : ''}`} />
        <div className={`service-camera-lens ${showCamera ? 'show' : ''}`} />
        <div className='service-tech' style={{ bottom: `${technician.bottom}px`, left: `${technician.left}px` }}>
          <div className='service-head' />
          <div className='service-body' />
          <div className='service-legs' />
          {!showCamera && <div className='service-hand-camera' />}
        </div>
        <div className={`service-signin ${showSignin ? 'show' : ''}`}>
          <h3>Quick Sign In</h3>
          <div className='service-input' />
          <div className='service-input' style={{width:'70%'}} />
          <div className='service-mini-btn' />
        </div>
      </div>
    </div>
  </section>
}
