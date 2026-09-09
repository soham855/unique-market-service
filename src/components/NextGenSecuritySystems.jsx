import React, { useEffect, useRef } from 'react'

const systems = [
  { icon: '🔒', title: 'Biometric Access', text: 'Advanced fingerprint and face recognition attendance & entry systems.' },
  { icon: '📹', title: '4K Surveillance', text: 'High-definition night-vision cameras with remote mobile monitoring.' },
  { icon: '⚡', title: 'Power Backup', text: 'Uninterrupted power supply integration for 24/7 security uptime.' }
]

export default function NextGenSecuritySystems() {
  const sectionRef = useRef(null)
  const spotlightRef = useRef(null)

  useEffect(() => {
    const section = sectionRef.current
    const spotlight = spotlightRef.current
    if (!section || !spotlight) return

    const move = (e) => {
      const rect = section.getBoundingClientRect()
      spotlight.style.left = `${e.clientX - rect.left}px`
      spotlight.style.top = `${e.clientY - rect.top}px`
    }
    const enter = () => { spotlight.style.opacity = '1' }
    const leave = () => { spotlight.style.opacity = '0' }

    section.addEventListener('mousemove', move)
    section.addEventListener('mouseenter', enter)
    section.addEventListener('mouseleave', leave)
    return () => {
      section.removeEventListener('mousemove', move)
      section.removeEventListener('mouseenter', enter)
      section.removeEventListener('mouseleave', leave)
    }
  }, [])

  return <section className='tech-section' ref={sectionRef}>
    <div className='cursor-spotlight' ref={spotlightRef} />
    <style>{`
      .tech-section{position:relative;background:#030712;padding:80px 20px;overflow:hidden;color:#fff;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif}
      .tech-section .container{max-width:1100px;margin:0 auto;position:relative;z-index:2}
      .tech-section .section-heading{text-align:center;font-size:36px;margin:0 0 50px;background:linear-gradient(45deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
      .tech-section .cards-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:30px}
      .tech-section .tech-card{background:rgba(15,23,42,.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(56,189,248,.2);border-radius:16px;padding:35px;transition:transform .4s cubic-bezier(.175,.885,.32,1.275),border-color .3s ease,box-shadow .3s ease;box-shadow:0 10px 30px rgba(0,0,0,.5);transform-style:preserve-3d;perspective:1000px}
      .tech-section .tech-card:hover{transform:translateY(-10px) rotateX(5deg) rotateY(5deg);border-color:rgba(56,189,248,.8);box-shadow:0 20px 40px rgba(56,189,248,.2)}
      .tech-section .tech-card h3{color:#38bdf8;font-size:22px;margin:0 0 15px}
      .tech-section .tech-card p{color:#94a3b8;font-size:15px;line-height:1.6;margin:0}
      .tech-section .cursor-spotlight{position:absolute;width:400px;height:400px;left:0;top:0;background:radial-gradient(circle,rgba(56,189,248,.15) 0%,rgba(3,7,18,0) 70%);border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);transition:width .2s,height .2s,opacity .2s;opacity:0;z-index:1}
      @media(max-width:600px){.tech-section{padding:60px 16px}.tech-section .section-heading{font-size:30px;margin-bottom:35px}.tech-section .cards-grid{grid-template-columns:1fr}.tech-section .tech-card{padding:28px}}
    `}</style>
    <div className='container'>
      <h2 className='section-heading'>Next-Gen Security Systems</h2>
      <div className='cards-grid'>
        {systems.map(system => <div className='tech-card' key={system.title}>
          <h3>{system.icon} {system.title}</h3>
          <p>{system.text}</p>
        </div>)}
      </div>
    </div>
  </section>
}
