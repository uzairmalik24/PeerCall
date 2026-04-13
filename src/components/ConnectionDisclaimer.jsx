import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ShieldCheck, AlertTriangle, Info } from 'lucide-react'

export default function ConnectionDisclaimer({ context = 'general' }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' }
      )
    }
  }, [context])

  const icons = {
    general: ShieldCheck,
    receiver: AlertTriangle,
    sender: AlertTriangle,
    generating: Info,
  }

  const disclaimers = {
    general: {
      title: 'Before You Start',
      tips: [
        'P2P connections can work across networks, but strict firewalls or VPNs may still block the session.',
        'If the connection stalls, try audio-only or restart your browser.',
        'Share codes exactly as shown; do not edit, shorten, or reformat them.',
        'Both people must complete every step for the connection to succeed.',
      ],
    },
    receiver: {
      title: 'Connection Tips',
      tips: [
        'Paste the exact code without edits, extra spaces, or line breaks.',
        'Strict firewalls, VPNs, or private networks may block direct P2P traffic.',
        'If the session hangs, try audio-only or refresh the page.',
        'Both people must complete all steps to establish the call.',
      ],
    },
    generating: {
      title: 'What’s happening?',
      tips: [
        'Scanning connection routes and relay options for your browser.',
        'This can take 10–12 seconds while network discovery completes.',
        'If it takes longer, the app may still succeed once discovery finishes.',
      ],
    },
    sender: {
      title: 'Before You Send',
      tips: [
        'Make sure the connection code is complete and pasted exactly.',
        'Strict firewalls or VPNs may interrupt the connection.',
        'If the connection fails, try audio-only or restart your browser.',
        'Both people must complete all steps for success.',
      ],
    },
  }

  const config = disclaimers[context] || disclaimers.general
  const Icon = icons[context] || Info

  return (
    <div className="connection-disclaimer" ref={containerRef}>
      <h4>
        <Icon size={16} />
        {config.title}
      </h4>
      <ul>
        {config.tips.map((tip, i) => (
          <li key={i}>{tip}</li>
        ))}
      </ul>
    </div>
  )
}
