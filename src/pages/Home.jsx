import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  Shield,
  Zap,
  Globe,
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
  FileUp,
  FileDown,
  Upload,
  Download,
} from 'lucide-react'
import Logo from '../components/Logo'
import './Home.css'

gsap.registerPlugin(ScrollTrigger)

const callGuideSteps = [
  { num: '01', title: 'Open the Call Page', role: 'Caller', description: 'Navigate to the Call page and click "Create a Call". Toggle video on or off before starting. This initiates your side of the peer-to-peer handshake.', icon: MousePointer2 },
  { num: '02', title: 'Grant Browser Permissions', role: 'Caller', description: 'Your browser will request camera and microphone access. Grant it to proceed. You\'ll see a live preview of your own feed confirming everything works.', icon: Camera },
  { num: '03', title: 'Copy & Share Your Code', role: 'Caller', description: 'A connection code appears — click "Copy Code" and send it to your contact through any messaging app. This code is single-use and session-specific.', icon: Copy },
  { num: '04', title: 'Receiver Pastes Your Code', role: 'Receiver', description: 'The other person opens PeerCall, clicks "Join a Call", and pastes your code. They click "Generate Response" and allow their own camera/mic access.', icon: Clipboard },
  { num: '05', title: 'Receiver Sends Response Back', role: 'Receiver', description: 'A response code is generated on their end. They copy it and send it back to you through the same messaging channel. This completes the signaling handshake.', icon: Send },
  { num: '06', title: 'Connection Established', role: 'Both', description: 'Paste the response code and click "Connect". The peer-to-peer link goes live — audio and video flow directly between browsers. No server involved.', icon: Check },
]

const fileGuideSteps = [
  { num: '01', title: 'Open the Share Page', role: 'Sender', description: 'Go to the Share Files page and click "Create Connection". No permissions needed — file sharing only uses a data channel, no camera or mic.', icon: MousePointer2 },
  { num: '02', title: 'Send Your Code', role: 'Sender', description: 'A short connection code is generated. Copy it and send it to the person you want to share files with. The code is much shorter than a call code since there are no media codecs.', icon: Copy },
  { num: '03', title: 'Receiver Joins', role: 'Receiver', description: 'The other person clicks "Join Connection", pastes your code, and clicks "Generate Response". A response code appears on their end.', icon: Clipboard },
  { num: '04', title: 'Exchange Response', role: 'Both', description: 'The receiver sends their response code back. The sender pastes it and clicks "Connect". The peer-to-peer data channel opens.', icon: Send },
  { num: '05', title: 'Drop Files to Send', role: 'Both', description: 'Drag and drop any file into the drop zone or click to browse. Files are chunked into 64KB pieces and sent directly — both sides can send and receive simultaneously.', icon: Upload },
  { num: '06', title: 'Download Received Files', role: 'Both', description: 'Received files appear instantly with a download button. Files arrive bit-for-bit identical — zero quality loss, no compression, no re-encoding. Just raw bytes.', icon: Download },
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
  const fileSectionRef = useRef(null)
  const faqRef = useRef(null)
  const [guideMode, setGuideMode] = useState('call') // 'call' | 'file'

  const activeGuideSteps = guideMode === 'call' ? callGuideSteps : fileGuideSteps

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-anim', {
        y: 30, opacity: 0, duration: 0.8, stagger: 0.12, ease: 'power3.out',
      })

      gsap.from('.feature-card', {
        scrollTrigger: { trigger: featuresRef.current, start: 'top 80%' },
        y: 40, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out',
      })

      gsap.from('.step-card', {
        scrollTrigger: { trigger: stepsRef.current, start: 'top 80%' },
        y: 40, opacity: 0, duration: 0.6, stagger: 0.12, ease: 'power2.out',
      })

      // File highlight section
      gsap.from('.file-highlight-content', {
        scrollTrigger: { trigger: fileSectionRef.current, start: 'top 80%' },
        y: 40, opacity: 0, duration: 0.7, ease: 'power2.out',
      })

      gsap.from('.faq-item', {
        scrollTrigger: { trigger: faqRef.current, start: 'top 80%' },
        y: 20, opacity: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out',
      })

      gsap.utils.toArray('.section-title').forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 85%' },
          y: 20, opacity: 0, duration: 0.6, ease: 'power2.out',
        })
      })
    })

    return () => ctx.revert()
  }, [])

  // Guide scroll-based activation
  useEffect(() => {
    const ctx = gsap.context(() => {
      const guideItems = gsap.utils.toArray('.guide-step')
      const numDisplay = document.querySelector('.guide-active-num')
      const titleDisplay = document.querySelector('.guide-active-title')
      const roleDisplay = document.querySelector('.guide-active-role')
      const progressFill = document.querySelector('.guide-progress-fill')

      if (guideItems.length && numDisplay) {
        const triggers = []

        guideItems.forEach((step, i) => {
          triggers.push(ScrollTrigger.create({
            trigger: step,
            start: 'top 55%',
            end: 'bottom 45%',
            onEnter: () => activateStep(i),
            onEnterBack: () => activateStep(i),
          }))
        })

        function activateStep(i) {
          const data = activeGuideSteps[i]
          if (!data) return

          guideItems.forEach((el, j) => {
            el.classList.toggle('guide-step-active', j === i)
          })

          gsap.to(numDisplay, {
            opacity: 0, y: -6, duration: 0.12,
            onComplete: () => {
              numDisplay.textContent = data.num
              gsap.to(numDisplay, { opacity: 1, y: 0, duration: 0.2 })
            },
          })

          gsap.to(titleDisplay, {
            opacity: 0, duration: 0.1,
            onComplete: () => {
              titleDisplay.textContent = data.title
              gsap.to(titleDisplay, { opacity: 1, duration: 0.18 })
            },
          })

          roleDisplay.textContent = data.role
          roleDisplay.className =
            'guide-active-role ' +
            (data.role === 'Caller' || data.role === 'Sender'
              ? 'role-caller'
              : data.role === 'Receiver'
                ? 'role-receiver'
                : 'role-both')

          if (progressFill) {
            gsap.to(progressFill, {
              scaleY: (i + 1) / activeGuideSteps.length,
              duration: 0.4, ease: 'power2.out',
            })
          }
        }

        activateStep(0)

        return () => triggers.forEach((t) => t.kill())
      }
    })

    return () => ctx.revert()
  }, [guideMode, activeGuideSteps])

  return (
    <>
      <Helmet>
        <title>PeerCall — Free P2P Video Calls & File Sharing | No Server Needed</title>
        <meta
          name="description"
          content="Make free peer-to-peer video calls and share files directly in your browser using WebRTC. No sign-up, no servers, no downloads. Zero quality loss on file transfers."
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
              <a href="#file-sharing">File Sharing</a>
              <a href="#guide">Guide</a>
              <a href="#faq">FAQ</a>
              <Link to="/share">Share Files</Link>
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
              Calls & File Sharing,<br />
              <span className="gradient-text">Directly Peer-to-Peer</span>
            </h1>

            <p className="hero-sub hero-anim">
              No servers. No sign-ups. No downloads. Make video calls and share
              files directly between browsers by exchanging a simple code.
              Powered by WebRTC — nothing leaves your devices.
            </p>

            <div className="hero-actions hero-anim">
              <Link to="/call" className="btn btn-primary btn-lg">
                Start a Call
                <ArrowRight size={17} />
              </Link>
              <Link to="/share" className="btn btn-secondary btn-lg">
                Share Files
                <FileUp size={17} />
              </Link>
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
              you and the person on the other end.
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
                  <FileUp size={18} className="feature-ic" />
                  <h3>Lossless File Sharing</h3>
                </div>
                <p>
                  Send any file directly to another browser with zero quality
                  loss. Files transfer bit-for-bit over a dedicated data channel
                  — no compression, no upload limits, no server storage.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* How it works — tabbed for Call / File */}
        <section className="how-it-works" id="how-it-works" ref={stepsRef}>
          <div className="container">
            <h2 className="section-title">How It Works</h2>
            <p className="section-sub">
              Three steps. Two people. One direct connection.
            </p>
            <div className="steps-row">
              <div className="step-card">
                <span className="step-label">Step 1</span>
                <h3>Create a Connection</h3>
                <p>
                  Open the Call or Share page and click "Create". For calls,
                  grant camera/mic permissions. For files, no permissions
                  needed. A unique connection code is generated.
                </p>
              </div>
              <div className="step-connector">
                <ArrowRight size={16} />
              </div>
              <div className="step-card">
                <span className="step-label">Step 2</span>
                <h3>Exchange Codes</h3>
                <p>
                  Send your code to the other person via any channel. They
                  paste it to generate a response code. They send that back
                  to you. This two-way exchange replaces a signaling server.
                </p>
              </div>
              <div className="step-connector">
                <ArrowRight size={16} />
              </div>
              <div className="step-card">
                <span className="step-label">Step 3</span>
                <h3>Connected</h3>
                <p>
                  Paste the response and click "Connect". For calls, audio and
                  video flow directly. For file sharing, drag and drop any file
                  — it transfers bit-for-bit with zero quality loss.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* File Sharing Highlight */}
        <section className="file-highlight" id="file-sharing" ref={fileSectionRef}>
          <div className="container">
            <div className="file-highlight-content">
              <div className="file-highlight-text">
                <span className="file-highlight-badge">Zero Quality Loss</span>
                <h2>File Sharing,<br />Without the Middleman</h2>
                <p>
                  Unlike cloud services that compress your images, re-encode
                  your videos, and scan your documents — PeerCall sends files as
                  raw bytes directly from one browser to another. What you send
                  is exactly what arrives. No thumbnailing, no transcoding, no
                  lossy optimization.
                </p>
                <ul className="file-highlight-list">
                  <li>
                    <CheckCircle2 size={16} />
                    <span>Bit-for-bit identical — verified by checksum</span>
                  </li>
                  <li>
                    <CheckCircle2 size={16} />
                    <span>No file size limits — send GBs if your connection holds</span>
                  </li>
                  <li>
                    <CheckCircle2 size={16} />
                    <span>No server storage — files are never uploaded anywhere</span>
                  </li>
                  <li>
                    <CheckCircle2 size={16} />
                    <span>Both sides can send and receive simultaneously</span>
                  </li>
                  <li>
                    <CheckCircle2 size={16} />
                    <span>Encrypted in transit via DTLS — same as calls</span>
                  </li>
                </ul>
                <Link to="/share" className="btn btn-primary btn-lg">
                  Share Files Now
                  <ArrowRight size={17} />
                </Link>
              </div>
              <div className="file-highlight-visual">
                <div className="file-visual-card">
                  <div className="file-visual-row">
                    <Upload size={18} />
                    <div>
                      <span className="file-visual-name">photo_original.png</span>
                      <span className="file-visual-size">24.8 MB</span>
                    </div>
                  </div>
                  <div className="file-visual-arrow">
                    <ArrowDown size={16} />
                    <span>Direct P2P transfer</span>
                    <ArrowDown size={16} />
                  </div>
                  <div className="file-visual-row">
                    <Download size={18} />
                    <div>
                      <span className="file-visual-name">photo_original.png</span>
                      <span className="file-visual-size">24.8 MB — identical</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Guide — tabbed Call / File */}
        <section className="guide" id="guide" ref={guideRef}>
          <div className="container">
            <h2 className="section-title">Step-by-Step Guide</h2>
            <p className="section-sub">
              Scroll through each step of the connection process.
            </p>

            <div className="guide-tabs">
              <button
                className={`guide-tab ${guideMode === 'call' ? 'guide-tab-active' : ''}`}
                onClick={() => setGuideMode('call')}
              >
                Video Call
              </button>
              <button
                className={`guide-tab ${guideMode === 'file' ? 'guide-tab-active' : ''}`}
                onClick={() => setGuideMode('file')}
              >
                File Sharing
              </button>
            </div>

            <div className="guide-layout">
              <div className="guide-sticky">
                <div className="guide-visual">
                  <div className="guide-progress-track">
                    <div className="guide-progress-fill" />
                  </div>
                  <div className="guide-active-num">01</div>
                  <div className="guide-active-title">{activeGuideSteps[0].title}</div>
                  <div className="guide-active-role role-caller">{activeGuideSteps[0].role}</div>
                </div>
              </div>

              <div className="guide-steps" key={guideMode}>
                {activeGuideSteps.map((step, i) => (
                  <div
                    className={`guide-step ${i === 0 ? 'guide-step-active' : ''}`}
                    key={`${guideMode}-${i}`}
                  >
                    <div className="guide-step-header">
                      <span className="guide-step-num">{step.num}</span>
                      <span
                        className={`guide-step-role ${
                          step.role === 'Caller' || step.role === 'Sender'
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
                ))}
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
                  listen to your calls. File transfers use the same encryption.
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
                  page and start a call or share files.
                </p>
              </FaqItem>

              <FaqItem question="Why do I have to copy and paste codes manually?">
                <p>
                  The code exchange replaces the signaling server that most
                  apps use behind the scenes. You manually exchange the codes
                  through any channel you trust, which means no backend
                  infrastructure is needed and no third party ever knows who
                  you're connecting with.
                </p>
              </FaqItem>

              <FaqItem question="Does file sharing reduce quality or compress my files?">
                <p>
                  No. Files are sent as raw bytes through a dedicated
                  RTCDataChannel — a binary pipe separate from audio/video
                  streams. There is zero quality loss. Files arrive bit-for-bit
                  identical to the original. No compression, no re-encoding, no
                  thumbnailing. Unlike cloud services like WhatsApp or Google
                  Drive, PeerCall never touches your files.
                </p>
              </FaqItem>

              <FaqItem question="Is there a file size limit?">
                <p>
                  There's no server-imposed size limit. Files are chunked into
                  64KB pieces and streamed directly between browsers. The only
                  constraint is your browser's available memory and the
                  stability of the P2P connection. In practice, multi-GB
                  transfers work fine on stable connections.
                </p>
              </FaqItem>

              <FaqItem question="Is there a time limit or participant limit?">
                <p>
                  No time limit — your call or file sharing session can last as
                  long as you want. PeerCall currently supports 1-to-1
                  connections. Group calls and multi-party file sharing are not
                  currently supported.
                </p>
              </FaqItem>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta-section">
          <div className="container container-sm">
            <div className="cta-card">
              <h2>Ready to connect?</h2>
              <p>
                Start a free, encrypted, peer-to-peer call or share files in
                seconds. No sign-up required.
              </p>
              <div className="cta-actions">
                <Link to="/call" className="btn btn-primary btn-lg">
                  Start a Call
                  <ArrowRight size={17} />
                </Link>
                <Link to="/share" className="btn btn-secondary btn-lg">
                  Share Files
                  <FileUp size={17} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <Logo size={24} />
              <span>PeerCall</span>
            </div>
            <p>Open-source peer-to-peer calling & file sharing. Built with WebRTC & React.</p>
          </div>
        </footer>
      </div>
    </>
  )
}
