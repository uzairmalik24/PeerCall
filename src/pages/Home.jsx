import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  Shield,
  Zap,
  Globe,
  Heart,
  ArrowRight,
  Link2,
  Send,
  CheckCircle2,
  ChevronDown,
  Monitor,
  Smartphone,
  Lock,
  Wifi,
  ArrowDown,
  MousePointer2,
  Camera,
  Copy,
  Clipboard,
  Check,
} from 'lucide-react'
import Logo from '../components/Logo'
import './Home.css'

gsap.registerPlugin(ScrollTrigger)

const guideSteps = [
  {
    num: '01',
    title: 'Open the Call Page',
    role: 'Caller',
    description:
      'Navigate to the Call page and click "Create a Call". Toggle video on or off before starting. This initiates your side of the peer-to-peer handshake.',
    icon: MousePointer2,
  },
  {
    num: '02',
    title: 'Grant Browser Permissions',
    role: 'Caller',
    description:
      'Your browser will request camera and microphone access. Grant it to proceed. You\'ll see a live preview of your own feed confirming everything works.',
    icon: Camera,
  },
  {
    num: '03',
    title: 'Copy & Share Your Code',
    role: 'Caller',
    description:
      'A connection code appears — click "Copy Code" and send it to your contact through any messaging app. This code is single-use and session-specific.',
    icon: Copy,
  },
  {
    num: '04',
    title: 'Receiver Pastes Your Code',
    role: 'Receiver',
    description:
      'The other person opens PeerCall, clicks "Join a Call", and pastes your code. They click "Generate Response" and allow their own camera/mic access.',
    icon: Clipboard,
  },
  {
    num: '05',
    title: 'Receiver Sends Response Back',
    role: 'Receiver',
    description:
      'A response code is generated on their end. They copy it and send it back to you through the same messaging channel. This completes the signaling handshake.',
    icon: Send,
  },
  {
    num: '06',
    title: 'Connection Established',
    role: 'Both',
    description:
      'Paste the response code and click "Connect". The peer-to-peer link goes live — audio and video flow directly between browsers. No server involved.',
    icon: Check,
  },
]

function FaqItem({ question, children }) {
  const [open, setOpen] = useState(false)
  const bodyRef = useRef(null)
  const innerRef = useRef(null)

  const toggle = useCallback(() => {
    const body = bodyRef.current
    const inner = innerRef.current
    if (!body || !inner) return

    if (!open) {
      setOpen(true)
      gsap.set(body, { height: 'auto' })
      const h = body.offsetHeight
      gsap.fromTo(body, { height: 0 }, { height: h, duration: 0.35, ease: 'power2.out' })
    } else {
      gsap.to(body, {
        height: 0,
        duration: 0.28,
        ease: 'power2.inOut',
        onComplete: () => setOpen(false),
      })
    }
  }, [open])

  return (
    <div className={`faq-item ${open ? 'faq-open' : ''}`}>
      <button className="faq-trigger" onClick={toggle}>
        <span>{question}</span>
        <ChevronDown size={16} className="faq-chevron" />
      </button>
      <div className="faq-body" ref={bodyRef}>
        <div className="faq-inner" ref={innerRef}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const featuresRef = useRef(null)
  const stepsRef = useRef(null)
  const guideRef = useRef(null)
  const faqRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-anim', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.12,
        ease: 'power3.out',
      })

      gsap.from('.feature-card', {
        scrollTrigger: { trigger: featuresRef.current, start: 'top 80%' },
        y: 40,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power2.out',
      })

      gsap.from('.step-card', {
        scrollTrigger: { trigger: stepsRef.current, start: 'top 80%' },
        y: 40,
        opacity: 0,
        duration: 0.6,
        stagger: 0.12,
        ease: 'power2.out',
      })

      gsap.from('.faq-item', {
        scrollTrigger: { trigger: faqRef.current, start: 'top 80%' },
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power2.out',
      })

      gsap.utils.toArray('.section-title').forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 85%' },
          y: 20,
          opacity: 0,
          duration: 0.6,
          ease: 'power2.out',
        })
      })

      // Guide scroll-based
      const guideItems = gsap.utils.toArray('.guide-step')
      const numDisplay = document.querySelector('.guide-active-num')
      const titleDisplay = document.querySelector('.guide-active-title')
      const roleDisplay = document.querySelector('.guide-active-role')
      const progressFill = document.querySelector('.guide-progress-fill')

      if (guideItems.length && numDisplay) {
        guideItems.forEach((step, i) => {
          ScrollTrigger.create({
            trigger: step,
            start: 'top 55%',
            end: 'bottom 45%',
            onEnter: () => activateStep(i),
            onEnterBack: () => activateStep(i),
          })
        })

        function activateStep(i) {
          const data = guideSteps[i]
          if (!data) return

          guideItems.forEach((el, j) => {
            el.classList.toggle('guide-step-active', j === i)
          })

          gsap.to(numDisplay, {
            opacity: 0,
            y: -6,
            duration: 0.12,
            onComplete: () => {
              numDisplay.textContent = data.num
              gsap.to(numDisplay, { opacity: 1, y: 0, duration: 0.2 })
            },
          })

          gsap.to(titleDisplay, {
            opacity: 0,
            duration: 0.1,
            onComplete: () => {
              titleDisplay.textContent = data.title
              gsap.to(titleDisplay, { opacity: 1, duration: 0.18 })
            },
          })

          roleDisplay.textContent = data.role
          roleDisplay.className =
            'guide-active-role ' +
            (data.role === 'Caller'
              ? 'role-caller'
              : data.role === 'Receiver'
                ? 'role-receiver'
                : 'role-both')

          if (progressFill) {
            gsap.to(progressFill, {
              scaleY: (i + 1) / guideSteps.length,
              duration: 0.4,
              ease: 'power2.out',
            })
          }
        }

        activateStep(0)
      }
    })

    return () => ctx.revert()
  }, [])

  return (
    <>
      <Helmet>
        <title>PeerCall — Free P2P Video & Audio Calls | No Server Needed</title>
        <meta
          name="description"
          content="Make free peer-to-peer video and audio calls directly in your browser using WebRTC. No sign-up, no servers, no downloads required. Share a code and connect instantly."
        />
        <link rel="canonical" href="/" />
      </Helmet>

      <div className="home">
        <nav className="nav">
          <div className="nav-inner">
            <Link to="/" className="nav-brand">
              <Logo size={30} />
              <span>PeerCall</span>
            </Link>
            <div className="nav-links">
              <a href="#features">Features</a>
              <a href="#how-it-works">How It Works</a>
              <a href="#guide">Guide</a>
              <a href="#faq">FAQ</a>
            </div>
            <Link to="/call" className="nav-cta">
              Start Call
              <ArrowRight size={15} />
            </Link>
          </div>
        </nav>

        <header className="hero">
          <div className="hero-bg" />
          <div className="hero-content">
            <div className="hero-badge hero-anim">
              <Lock size={13} />
              <span>End-to-end encrypted by default</span>
            </div>

            <h1 className="hero-anim">
              Video & Audio Calls,<br />
              <span className="gradient-text">Directly Peer-to-Peer</span>
            </h1>

            <p className="hero-sub hero-anim">
              No servers. No sign-ups. No downloads. Connect directly with
              anyone by sharing a simple code. Powered by WebRTC — your
              conversations never leave your devices.
            </p>

            <div className="hero-actions hero-anim">
              <Link to="/call" className="btn btn-primary btn-lg">
                Start a Call
                <ArrowRight size={17} />
              </Link>
              <a href="#how-it-works" className="btn btn-secondary btn-lg">
                How It Works
                <ArrowDown size={17} />
              </a>
            </div>

            <div className="hero-trust hero-anim">
              <div className="trust-item">
                <Shield size={14} />
                <span>Private</span>
              </div>
              <span className="trust-sep" />
              <div className="trust-item">
                <Wifi size={14} />
                <span>No server</span>
              </div>
              <span className="trust-sep" />
              <div className="trust-item">
                <Monitor size={14} />
                <span>Desktop</span>
              </div>
              <span className="trust-sep" />
              <div className="trust-item">
                <Smartphone size={14} />
                <span>Mobile</span>
              </div>
            </div>
          </div>
        </header>

        {/* Features */}
        <section className="features" id="features" ref={featuresRef}>
          <div className="container">
            <h2 className="section-title">Why PeerCall?</h2>
            <p className="section-sub">
              Built for privacy, simplicity, and speed — with nothing between
              you and the person you're calling.
            </p>
            <div className="features-grid">
              <article className="feature-card">
                <div className="feature-top">
                  <Shield size={18} className="feature-ic" />
                  <h3>Fully Private</h3>
                </div>
                <p>
                  Your audio and video travel directly between devices using
                  WebRTC's built-in DTLS-SRTP encryption. No middleman server
                  ever sees, stores, or processes your data.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-top">
                  <Zap size={18} className="feature-ic" />
                  <h3>Zero Setup</h3>
                </div>
                <p>
                  No accounts to create, no apps to install, no plugins to
                  enable. Open PeerCall in your browser, click one button, and
                  you're connected in under 30 seconds.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-top">
                  <Globe size={18} className="feature-ic" />
                  <h3>Works Everywhere</h3>
                </div>
                <p>
                  Runs in Chrome, Firefox, Safari 11+, and Edge on both desktop
                  and mobile. Any browser with WebRTC support works without
                  compatibility issues.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-top">
                  <Heart size={18} className="feature-ic" />
                  <h3>Completely Free</h3>
                </div>
                <p>
                  No premium tiers, no time limits, no hidden fees. Calls go
                  directly between browsers so there are no server costs to
                  maintain. Free for everyone, forever.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="how-it-works" id="how-it-works" ref={stepsRef}>
          <div className="container">
            <h2 className="section-title">How It Works</h2>
            <p className="section-sub">
              Three steps. Two people. One direct connection.
            </p>
            <div className="steps-row">
              <div className="step-card">
                <span className="step-label">Step 1</span>
                <h3>Create a Call</h3>
                <p>
                  Open the call page and click "Create a Call". Choose between
                  video or audio-only. Your browser will ask for camera and
                  microphone permissions — once granted, a unique connection
                  code is generated.
                </p>
              </div>
              <div className="step-connector">
                <ArrowRight size={16} />
              </div>
              <div className="step-card">
                <span className="step-label">Step 2</span>
                <h3>Share the Code</h3>
                <p>
                  Copy your connection code and send it to the person you want
                  to call through any channel — WhatsApp, Telegram, email, or
                  SMS. The code is single-use and session-specific.
                </p>
              </div>
              <div className="step-connector">
                <ArrowRight size={16} />
              </div>
              <div className="step-card">
                <span className="step-label">Step 3</span>
                <h3>Connect</h3>
                <p>
                  The other person pastes your code, generates a response, and
                  sends it back. Once you paste it in, the peer-to-peer
                  connection is established and audio/video flows directly.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Guide */}
        <section className="guide" id="guide" ref={guideRef}>
          <div className="container">
            <h2 className="section-title">Step-by-Step Guide</h2>
            <p className="section-sub">
              Scroll through each step of the connection process.
            </p>

            <div className="guide-layout">
              <div className="guide-sticky">
                <div className="guide-visual">
                  <div className="guide-progress-track">
                    <div className="guide-progress-fill" />
                  </div>
                  <div className="guide-active-num">01</div>
                  <div className="guide-active-title">Open the Call Page</div>
                  <div className="guide-active-role role-caller">Caller</div>
                </div>
              </div>

              <div className="guide-steps">
                {guideSteps.map((step, i) => {
                  const Icon = step.icon
                  return (
                    <div
                      className={`guide-step ${i === 0 ? 'guide-step-active' : ''}`}
                      key={i}
                    >
                      <div className="guide-step-header">
                        <span className="guide-step-num">{step.num}</span>
                        <span
                          className={`guide-step-role ${
                            step.role === 'Caller'
                              ? 'role-caller'
                              : step.role === 'Receiver'
                                ? 'role-receiver'
                                : 'role-both'
                          }`}
                        >
                          {step.role}
                        </span>
                      </div>
                      <h4>{step.title}</h4>
                      <p>{step.description}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="faq" id="faq" ref={faqRef}>
          <div className="container container-sm">
            <h2 className="section-title">Frequently Asked Questions</h2>
            <p className="section-sub">
              Common questions about PeerCall, answered.
            </p>
            <div className="faq-list">
              <FaqItem question="Is this really free? What's the catch?">
                <p>
                  There's no catch. Traditional video calling services need
                  expensive servers to relay your audio and video — that's why
                  they charge money or show ads. PeerCall doesn't use relay
                  servers. Your call goes directly from browser to browser, so
                  the infrastructure cost is essentially zero.
                </p>
              </FaqItem>

              <FaqItem question="Is it secure? Can anyone listen in?">
                <p>
                  WebRTC encrypts all audio and video using DTLS-SRTP
                  encryption, which is mandatory and cannot be disabled. Your
                  media is encrypted end-to-end between the two browsers. No
                  third party — including PeerCall itself — can intercept or
                  listen to your calls.
                </p>
              </FaqItem>

              <FaqItem question="What if I'm behind a firewall or corporate network?">
                <p>
                  PeerCall uses public STUN servers to help your browser
                  discover its public-facing IP address and navigate through
                  NATs and firewalls. This works for the vast majority of
                  network setups. In rare cases where both parties are behind
                  strict symmetric NATs, a direct connection may not be possible.
                </p>
              </FaqItem>

              <FaqItem question="What browsers and devices are supported?">
                <p>
                  PeerCall works in any browser that supports WebRTC: Chrome,
                  Firefox, Safari 11+, Edge, Opera, and Brave — on both desktop
                  and mobile. For the best experience, use the latest version of
                  Chrome or Firefox.
                </p>
              </FaqItem>

              <FaqItem question="Do I need to install anything or create an account?">
                <p>
                  No. PeerCall runs entirely in your browser — nothing to
                  download, no extensions, no account creation. Just open the
                  page and start a call.
                </p>
              </FaqItem>

              <FaqItem question="Why do I have to copy and paste codes manually?">
                <p>
                  The code exchange replaces the signaling server that most
                  video apps use behind the scenes. You manually exchange the
                  codes through any channel you trust, which means no backend
                  infrastructure is needed and no third party ever knows who
                  you're calling.
                </p>
              </FaqItem>

              <FaqItem question="Is there a time limit or participant limit?">
                <p>
                  No time limit — your call can last as long as you want.
                  PeerCall currently supports 1-to-1 calls. Group calling is
                  not currently supported.
                </p>
              </FaqItem>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta-section">
          <div className="container container-sm">
            <div className="cta-card">
              <h2>Ready to make a call?</h2>
              <p>
                Start a free, encrypted, peer-to-peer call in under 30 seconds.
                No sign-up required.
              </p>
              <Link to="/call" className="btn btn-primary btn-lg">
                Start a Call
                <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </section>

        <footer className="footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <Logo size={24} />
              <span>PeerCall</span>
            </div>
            <p>Open-source peer-to-peer calling. Built with WebRTC & React.</p>
          </div>
        </footer>
      </div>
    </>
  )
}
