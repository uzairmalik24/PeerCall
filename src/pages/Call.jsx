import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { gsap } from 'gsap'
import {
  ArrowLeft,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Copy,
  Check,
  Link2,
  UserPlus,
  ArrowRight,
  Clipboard,
  Loader2,
} from 'lucide-react'
import useWebRTC from '../hooks/useWebRTC'
import Logo from '../components/Logo'
import './Call.css'

function VideoPlayer({ stream, muted = false, label }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="video-box">
      <video ref={ref} autoPlay playsInline muted={muted} />
      {label && <span className="video-label">{label}</span>}
    </div>
  )
}

export default function Call() {
  const {
    localStream,
    remoteStream,
    connectionState,
    offer,
    answer,
    error,
    audioEnabled,
    videoEnabled,
    generating,
    createOffer,
    createAnswer,
    acceptAnswer,
    toggleAudio,
    toggleVideo,
    hangUp,
  } = useWebRTC()

  const [role, setRole] = useState(null)
  const [peerCode, setPeerCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [withVideo, setWithVideo] = useState(true)
  const panelRef = useRef(null)

  const isConnected =
    connectionState === 'connected' || connectionState === 'completed'

  useEffect(() => {
    if (panelRef.current) {
      gsap.fromTo(
        panelRef.current,
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' }
      )
    }
  }, [role, offer, answer, isConnected, generating])

  const handleCreateOffer = async () => {
    setRole('caller')
    await createOffer(withVideo)
  }

  const handleJoinCall = () => {
    setRole('receiver')
  }

  const handleSubmitOffer = async () => {
    await createAnswer(peerCode.trim(), withVideo)
  }

  const handleSubmitAnswer = async () => {
    await acceptAnswer(peerCode.trim())
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleHangUp = () => {
    hangUp()
    setRole(null)
    setPeerCode('')
  }

  const hasRemoteTracks = remoteStream?.getTracks().length > 0
  const showFullVideo = isConnected && hasRemoteTracks

  return (
    <>
      <Helmet>
        <title>Call - PeerCall</title>
        <meta
          name="description"
          content="Start or join a free peer-to-peer video or audio call. No server needed."
        />
      </Helmet>

      <div className="call-page">
        <nav className="call-nav">
          <Link to="/" className="call-back">
            <ArrowLeft size={18} />
            <Logo size={26} />
            <span>PeerCall</span>
          </Link>
          <div className="status-pill">
            <span
              className={`status-dot ${isConnected ? 'dot-connected' : generating ? 'dot-connecting' : ''}`}
            />
            <span>
              {isConnected
                ? 'Connected'
                : generating
                  ? 'Generating...'
                  : 'Not connected'}
            </span>
          </div>
        </nav>

        <div className="call-body">
          {/* Connected: full video */}
          {showFullVideo && (
            <div className="video-area has-remote">
              <VideoPlayer stream={remoteStream} label="Remote" />
              <VideoPlayer stream={localStream} muted label="You" />
            </div>
          )}

          {/* Connected: just local, no remote yet */}
          {isConnected && !hasRemoteTracks && localStream && (
            <div className="video-area">
              <VideoPlayer stream={localStream} muted label="You" />
            </div>
          )}

          {/* Signaling: small preview + panel */}
          {localStream && !isConnected && (
            <div className="sig-layout">
              <div className="sig-preview">
                <VideoPlayer stream={localStream} muted />
                <div className="sig-controls">
                  <button
                    className={`ctrl-btn ctrl-sm ${!audioEnabled ? 'ctrl-off' : ''}`}
                    onClick={toggleAudio}
                  >
                    {audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}
                  </button>
                  {withVideo && (
                    <button
                      className={`ctrl-btn ctrl-sm ${!videoEnabled ? 'ctrl-off' : ''}`}
                      onClick={toggleVideo}
                    >
                      {videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
                    </button>
                  )}
                  <button className="ctrl-btn ctrl-sm ctrl-hangup" onClick={handleHangUp}>
                    <PhoneOff size={16} />
                  </button>
                </div>
              </div>

              {/* Generating state */}
              {generating && !offer && !answer && (
                <div className="panel" ref={panelRef}>
                  <div className="generating-state">
                    <Loader2 size={20} className="spin" />
                    <div>
                      <h3>Generating connection code...</h3>
                      <p>Waiting for network discovery to complete.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Caller: offer ready */}
              {role === 'caller' && offer && (
                <div className="panel" ref={panelRef}>
                  <div className="panel-step">
                    <span className="step-badge">Step 1</span>
                    <h3>Share This Code</h3>
                    <p>Copy and send this to the person you want to call.</p>
                  </div>
                  <div className="code-area">
                    <textarea
                      readOnly
                      value={offer}
                      rows={4}
                      onClick={(e) => e.target.select()}
                    />
                    <div className="code-actions">
                      <span className="code-len">{offer.length} chars</span>
                      <button
                        className="btn btn-primary"
                        onClick={() => copyToClipboard(offer)}
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? 'Copied!' : 'Copy Code'}
                      </button>
                    </div>
                  </div>

                  <div className="panel-divider" />

                  <div className="panel-step">
                    <span className="step-badge">Step 2</span>
                    <h3>Paste Their Response</h3>
                    <p>Once they send back a response code, paste it here.</p>
                  </div>
                  <div className="code-area">
                    <textarea
                      placeholder="Paste the response code here..."
                      value={peerCode}
                      onChange={(e) => setPeerCode(e.target.value)}
                      rows={3}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={handleSubmitAnswer}
                      disabled={!peerCode.trim()}
                    >
                      <ArrowRight size={16} />
                      Connect
                    </button>
                  </div>
                </div>
              )}

              {/* Receiver: answer ready */}
              {role === 'receiver' && answer && (
                <div className="panel" ref={panelRef}>
                  <div className="panel-step">
                    <h3>Send This Code Back</h3>
                    <p>Copy this response and send it to the caller.</p>
                  </div>
                  <div className="code-area">
                    <textarea
                      readOnly
                      value={answer}
                      rows={4}
                      onClick={(e) => e.target.select()}
                    />
                    <div className="code-actions">
                      <span className="code-len">{answer.length} chars</span>
                      <button
                        className="btn btn-primary"
                        onClick={() => copyToClipboard(answer)}
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? 'Copied!' : 'Copy Response'}
                      </button>
                    </div>
                  </div>
                  <div className="waiting-hint">
                    <Loader2 size={14} className="spin" />
                    <span>Waiting for the caller to enter your code...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Controls for connected state */}
          {isConnected && localStream && (
            <div className="controls">
              <button
                className={`ctrl-btn ${!audioEnabled ? 'ctrl-off' : ''}`}
                onClick={toggleAudio}
              >
                {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              {withVideo && (
                <button
                  className={`ctrl-btn ${!videoEnabled ? 'ctrl-off' : ''}`}
                  onClick={toggleVideo}
                >
                  {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
              )}
              <button className="ctrl-btn ctrl-hangup" onClick={handleHangUp}>
                <PhoneOff size={20} />
              </button>
            </div>
          )}

          {error && <div className="call-error">{error}</div>}

          {/* Initial: no stream */}
          {!localStream && !isConnected && (
            <div className="panel-center">
              {!role && (
                <div className="panel" ref={panelRef}>
                  <div className="panel-header">
                    <h2>Start or Join a Call</h2>
                    <p>Choose to create a new call or join an existing one.</p>
                  </div>
                  <label className="video-toggle">
                    <div className={`toggle-track ${withVideo ? 'active' : ''}`}>
                      <div className="toggle-thumb" />
                    </div>
                    <span>{withVideo ? 'Video call' : 'Audio only'}</span>
                    <input
                      type="checkbox"
                      checked={withVideo}
                      onChange={(e) => setWithVideo(e.target.checked)}
                      className="sr-only"
                    />
                  </label>
                  <div className="panel-buttons">
                    <button className="btn btn-primary btn-lg" onClick={handleCreateOffer}>
                      <Link2 size={18} />
                      Create a Call
                    </button>
                    <button className="btn btn-ghost btn-lg" onClick={handleJoinCall}>
                      <UserPlus size={18} />
                      Join a Call
                    </button>
                  </div>
                </div>
              )}

              {role === 'receiver' && !answer && (
                <div className="panel" ref={panelRef}>
                  <div className="panel-step">
                    <h3>Paste the Caller's Code</h3>
                    <p>Paste the connection code that was shared with you.</p>
                  </div>
                  <label className="video-toggle">
                    <div className={`toggle-track ${withVideo ? 'active' : ''}`}>
                      <div className="toggle-thumb" />
                    </div>
                    <span>{withVideo ? 'Video call' : 'Audio only'}</span>
                    <input
                      type="checkbox"
                      checked={withVideo}
                      onChange={(e) => setWithVideo(e.target.checked)}
                      className="sr-only"
                    />
                  </label>
                  <div className="code-area">
                    <textarea
                      placeholder="Paste the offer code here..."
                      value={peerCode}
                      onChange={(e) => setPeerCode(e.target.value)}
                      rows={3}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={handleSubmitOffer}
                      disabled={!peerCode.trim()}
                    >
                      <Clipboard size={16} />
                      Generate Response
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
