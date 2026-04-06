import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { gsap } from 'gsap'
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Link2,
  UserPlus,
  Clipboard,
  Loader2,
  Upload,
  Download,
  File,
  Image,
  Film,
  Music,
  FileText,
  X,
} from 'lucide-react'
import useFileTransfer from '../hooks/useFileTransfer'
import Logo from '../components/Logo'
import './Share.css'

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function fileIcon(type) {
  if (!type) return File
  if (type.startsWith('image/')) return Image
  if (type.startsWith('video/')) return Film
  if (type.startsWith('audio/')) return Music
  if (type.startsWith('text/') || type.includes('pdf') || type.includes('document')) return FileText
  return File
}

export default function Share() {
  const {
    connectionState,
    offer,
    answer,
    error,
    generating,
    channelOpen,
    sending,
    receiving,
    receivedFiles,
    createOffer,
    createAnswer,
    acceptAnswer,
    sendFile,
    disconnect,
  } = useFileTransfer()

  const [role, setRole] = useState(null)
  const [peerCode, setPeerCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
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
  }, [role, offer, answer, isConnected, generating, channelOpen])

  const handleCreateOffer = async () => {
    setRole('sender')
    await createOffer()
  }

  const handleJoinShare = () => {
    setRole('receiver')
  }

  const handleSubmitOffer = async () => {
    await createAnswer(peerCode.trim())
  }

  const handleSubmitAnswer = async () => {
    await acceptAnswer(peerCode.trim())
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDisconnect = () => {
    disconnect()
    setRole(null)
    setPeerCode('')
  }

  const handleFiles = useCallback((files) => {
    for (const file of files) {
      sendFile(file)
    }
  }, [sendFile])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  return (
    <>
      <Helmet>
        <title>Share Files - PeerCall</title>
        <meta
          name="description"
          content="Send files directly between browsers. No upload, no server, no size limit. Peer-to-peer file transfer powered by WebRTC."
        />
      </Helmet>

      <div className="share-page">
        <nav className="call-nav">
          <Link to="/" className="call-back">
            <ArrowLeft size={18} />
            <Logo size={26} />
            <span>PeerCall</span>
          </Link>
          <div className="status-pill">
            <span
              className={`status-dot ${channelOpen ? 'dot-connected' : generating ? 'dot-connecting' : ''}`}
            />
            <span>
              {channelOpen
                ? 'Connected'
                : generating
                  ? 'Generating...'
                  : 'Not connected'}
            </span>
          </div>
        </nav>

        <div className="share-body">
          {error && <div className="call-error">{error}</div>}

          {/* Connected: file transfer UI */}
          {channelOpen && (
            <div className="share-connected" ref={panelRef}>
              <div className="share-header">
                <div>
                  <h2>Connected</h2>
                  <p>Drop files or click to send. Both sides can send and receive.</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={handleDisconnect}>
                  <X size={16} />
                  Disconnect
                </button>
              </div>

              {/* Drop zone */}
              <div
                className={`drop-zone ${dragOver ? 'drop-over' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={24} />
                <p>Drop files here or click to browse</p>
                <span>Any file type, any size</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files.length) handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>

              {/* Transfer progress */}
              {sending && (
                <div className="transfer-item">
                  <Upload size={16} />
                  <div className="transfer-info">
                    <span className="transfer-name">{sending.name}</span>
                    <div className="transfer-bar">
                      <div
                        className="transfer-fill"
                        style={{ width: `${(sending.sent / sending.size) * 100}%` }}
                      />
                    </div>
                    <span className="transfer-meta">
                      Sending {formatSize(sending.sent)} / {formatSize(sending.size)}
                    </span>
                  </div>
                </div>
              )}

              {receiving && (
                <div className="transfer-item">
                  <Download size={16} />
                  <div className="transfer-info">
                    <span className="transfer-name">{receiving.name}</span>
                    <div className="transfer-bar">
                      <div
                        className="transfer-fill"
                        style={{ width: `${(receiving.received / receiving.size) * 100}%` }}
                      />
                    </div>
                    <span className="transfer-meta">
                      Receiving {formatSize(receiving.received)} / {formatSize(receiving.size)}
                    </span>
                  </div>
                </div>
              )}

              {/* Received files */}
              {receivedFiles.length > 0 && (
                <div className="received-section">
                  <h3>Received Files</h3>
                  <div className="received-list">
                    {receivedFiles.map((file, i) => {
                      const Icon = fileIcon(file.type)
                      return (
                        <a
                          key={i}
                          href={file.url}
                          download={file.name}
                          className="received-file"
                        >
                          <Icon size={18} />
                          <div className="received-info">
                            <span className="received-name">{file.name}</span>
                            <span className="received-size">{formatSize(file.size)}</span>
                          </div>
                          <Download size={16} />
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Signaling: generating or code exchange */}
          {role && !channelOpen && (
            <div className="share-signaling">
              {generating && !offer && !answer && (
                <div className="panel" ref={panelRef}>
                  <div className="generating-state">
                    <Loader2 size={20} className="spin" />
                    <div>
                      <h3>Generating connection code...</h3>
                      <p>This will be much shorter than a call code — no media needed.</p>
                    </div>
                  </div>
                </div>
              )}

              {role === 'sender' && offer && (
                <div className="panel" ref={panelRef}>
                  <div className="panel-step">
                    <span className="step-badge">Step 1</span>
                    <h3>Share This Code</h3>
                    <p>Send this to the person you want to share files with.</p>
                  </div>
                  <div className="code-area">
                    <textarea
                      readOnly
                      value={offer}
                      rows={3}
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

              {role === 'receiver' && !answer && !generating && (
                <div className="panel" ref={panelRef}>
                  <div className="panel-step">
                    <h3>Paste the Sender's Code</h3>
                    <p>Paste the code that was shared with you.</p>
                  </div>
                  <div className="code-area">
                    <textarea
                      placeholder="Paste the code here..."
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

              {role === 'receiver' && answer && (
                <div className="panel" ref={panelRef}>
                  <div className="panel-step">
                    <h3>Send This Code Back</h3>
                    <p>Copy this and send it to the other person.</p>
                  </div>
                  <div className="code-area">
                    <textarea
                      readOnly
                      value={answer}
                      rows={3}
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
                    <span>Waiting for them to enter your code...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Initial: choose role */}
          {!role && !channelOpen && (
            <div className="panel-center">
              <div className="panel" ref={panelRef}>
                <div className="panel-header">
                  <h2>Share Files</h2>
                  <p>
                    Send files directly between browsers. No upload limits, no
                    server storage. Files transfer peer-to-peer and are never
                    stored anywhere.
                  </p>
                </div>
                <div className="panel-buttons">
                  <button className="btn btn-primary btn-lg" onClick={handleCreateOffer}>
                    <Link2 size={18} />
                    Create Connection
                  </button>
                  <button className="btn btn-ghost btn-lg" onClick={handleJoinShare}>
                    <UserPlus size={18} />
                    Join Connection
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
