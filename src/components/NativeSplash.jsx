import React from 'react'

export default function NativeSplash() {
  return <main
    aria-label="Unique Market app loading"
    style={{
      minHeight: '100dvh',
      width: '100%',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      boxSizing: 'border-box',
      background: 'radial-gradient(circle at 50% 35%, #173b70 0%, #0b1730 48%, #07101f 100%)',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      textAlign: 'center'
    }}
  >
    <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div style={{
        width: 126,
        height: 126,
        borderRadius: 30,
        padding: 8,
        boxSizing: 'border-box',
        background: '#fff',
        boxShadow: '0 18px 60px rgba(0,0,0,.28)'
      }}>
        <img
          src="/unique-market-logo.svg"
          alt="Unique Market"
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '.28em', fontWeight: 700, color: '#a9c9ff' }}>UNIQUE MARKET</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 'clamp(24px, 6vw, 31px)', lineHeight: 1.2, fontWeight: 700, letterSpacing: '-.035em' }}>Instant Services</h1>
        <p style={{ margin: '7px 0 0', fontSize: 14, color: '#d4deed' }}>for your security</p>
      </div>
      <div aria-hidden="true" style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        {[0, 1, 2].map(n => <span key={n} style={{ width: 6, height: 6, borderRadius: '50%', background: '#9dc5ff', opacity: .55 + n * .2 }} />)}
      </div>
    </section>
  </main>
}
