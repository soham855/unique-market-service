import React, { useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { motion } from 'motion/react'
import { ArrowRight, ChevronDown } from 'lucide-react'

const VIDEO_SRC = 'https://stream.mux.com/T6oQJQ02cQ6N01TR6iHwZkKFkbepS34dkkIc9iukgy400g.m3u8'
const POSTER = 'https://images.unsplash.com/photo-1647356191320-d7a1f80ca777?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRhcmslMjB0ZWNobm9sb2d5JTIwbmV1cmFsJTIwbmV0d29ya3xlbnwxfHx8fDE3Njg5NzIyNTV8MA&ixlib=rb-4.1.0&q=80&w=1080'

export default function AIHeroSection() {
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let hls
    const play = () => video.play().catch((e) => console.log('Auto-play prevented:', e))

    if (Hls.isSupported()) {
      hls = new Hls()
      hls.loadSource(VIDEO_SRC)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, play)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = VIDEO_SRC
      video.addEventListener('loadedmetadata', play)
    }

    return () => {
      hls?.destroy()
      video.removeEventListener('loadedmetadata', play)
    }
  }, [])

  return (
    <section className="ai-hero">
      <div className="ai-hero-video-wrap" aria-hidden="true">
        <video ref={videoRef} className="ai-hero-video" muted loop playsInline poster={POSTER} />
        <div className="ai-hero-video-overlay" />
        <div className="ai-hero-gradient ai-hero-gradient-top" />
        <div className="ai-hero-gradient ai-hero-gradient-bottom" />
      </div>

      <nav className="ai-hero-nav">
        <a href="/home" className="ai-sunburst" aria-label="Unique Market home">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 1.5l1.1 5.2L16 2.6l.2 5.4 4.4-3.2-2.1 5 5-.2-4.3 3.2 4.3 3.2-5-.2 2.1 5-4.4-3.2-.2 5.4-2.9-4.1-1.1 5.2-1.1-5.2L8 21.4l-.2-5.4-4.4 3.2 2.1-5-5 .2 4.3-3.2-4.3-3.2 5 .2-2.1-5 4.4 3.2L8 2.6l2.9 4.1L12 1.5Z" fill="currentColor" />
          </svg>
        </a>

        <div className="ai-hero-nav-center">
          <a href="#products">Products <ChevronDown size={15} /></a>
          <a href="#customers">Customer Stories</a>
          <a href="#resources">Resources</a>
          <a href="#pricing">Pricing</a>
        </div>

        <div className="ai-hero-nav-right">
          <a href="tel:+918554887026" className="ai-demo-link">Book A Demo</a>
          <a href="https://wa.me/918554887026" className="ai-get-started">Get Started</a>
        </div>
      </nav>

      <div className="ai-hero-content">
        <motion.p
          className="ai-hero-preheadline"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          Design at the speed of thought
        </motion.p>

        <motion.h1
          className="ai-hero-headline"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          Build Faster
        </motion.h1>

        <motion.p
          className="ai-hero-subheadline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          Create fully functional, SEO-optimized websites in seconds with our advanced AI engine.
        </motion.p>

        <motion.div
          className="ai-hero-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <a href="https://wa.me/918554887026" className="ai-primary-cta">
            <span>Start Building Free</span>
            <span className="ai-primary-arrow"><ArrowRight size={20} /></span>
          </a>
          <a href="#products" className="ai-secondary-cta">
            <span>See Examples</span>
            <ArrowRight size={18} />
          </a>
        </motion.div>
      </div>
    </section>
  )
}
