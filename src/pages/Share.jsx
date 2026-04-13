import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Clipboard,
  Loader2,
  Upload,
  File,
  Download,
} from 'lucide-react'
import useFileTransfer from '../hooks/useFileTransfer'
import Logo from '../components/Logo'
import ConnectionPanelWrapper from '../components/ConnectionPanelWrapper'
import './Share.css'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

  const isConnected = connectionState === 'connected' || connectionState === 'completed'

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCreateOffer = async () => {
    setRole('sender')
    await createOffer()
  }

  const handleJoin = () => setRole('receiver')

  const handleSubmitOffer = async () => {
    await createAnswer(peerCode.trim())
  }

  const handleSubmitAnswer = async () => {
    await acceptAnswer(peerCode.trim())
  }

  const handleDisconnect = () => {
    disconnect()
    setRole(null)
    setPeerCode('')
  }

  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) sendFile(file)
  }, [sendFile])

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) sendFile(file)
    e.target.value = ''
  }

  return (
    <>
      <Helmet>
        <title>Share Files - PeerCall</title>
        <meta name="description" content="Send files directly to another device with no server. Peer-to-peer file transfer." />
      </Helmet>

      <div className="share-page">
        <nav className="call-nav">
          <Link to="/" className="call-back">
            <ArrowLeft size={18} />
            <Logo size={26} />
            <span>PeerCall</span>
          </Link>
          <div className="status-pill">
            <span className={`status-dot ${isConnected ? 'dot-connected' : generating ? 'dot-connecting' : ''}`} />
            <span>
              {isConnected ? 'Connected' : generating ? 'Generating...' : 'Not connected'}
            </span>
          </div>
        </nav>

        <div className="share-body">
          {/* Connected: file transfer UI */}
          {isConnected && (
            <div className="share-connected">
              <div className="share-header">
                <div>
                  <h2>Transfer Files</h2>
                  <p>Drop a file or click to select. The other device will receive it instantly.</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>

              {sending && (
                <div className="transfer-item">
                  <File size={18} />
                  <div className="transfer-info">
                    <span className="transfer-name">{sending.name}</span>
                    <div className="transfer-bar">
                      <div
                        className="transfer-fill"
                        style={{ width: `${Math.round((sending.sent / sending.size) * 100)}%` }}
                      />
                    </div>
                    <span className="transfer-meta">
                      {formatBytes(sending.sent)} / {formatBytes(sending.size)}
                    </span>
                  </div>
                </div>
              )}

              {receiving && (
                <div className="transfer-item">
                  <Download size={18} />
                  <div className="transfer-info">
                    <span className="transfer-name">{receiving.name}</span>
                    <div className="transfer-bar">
                      <div
                        className="transfer-fill"
                        style={{ width: `${Math.round((receiving.received / receiving.size) * 100)}%` }}
                      />
                    </div>
                    <span className="transfer-meta">
                      {formatBytes(receiving.received)} / {formatBytes(receiving.size)}
                    </span>
                  </div>
                </div>
              )}

              {!sending && (
                <div
                  className={`drop-zone ${dragOver ? 'drop-over' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                >
                  <Upload size={28} />
                  <p>Drop a file here or click to select</p>
                  <span>Any file type · No size limit</span>
                  <input ref={fileInputRef} type="file" className="sr-only" onChange={handleFileSelect} />
                </div>
              )}

              {receivedFiles.length > 0 && (
                <div className="received-section">
                  <h3>Received Files</h3>
                  <div className="received-list">
                    {receivedFiles.map((f, i) => (
                      <a key={i} href={f.url} download={f.name} className="received-file">
                        <File size={16} />
                        <div className="received-info">
                          <span className="received-name">{f.name}</span>
                          <span className="received-size">{formatBytes(f.size)}</span>
                        </div>
                        <Download size={16} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Signaling UI */}
          {!isConnected && (
            <div className="share-signaling">
              {/* Initial choice */}
              {!role && !generating && (
                <ConnectionPanelWrapper context="general">
                  <div className="panel">
                    <div className="panel-header">
                      <h2>Send or Receive Files</h2>
                      <p>Choose your role to establish a direct connection.</p>
                    </div>
                    <div className="panel-buttons">
                      <button className="btn btn-primary btn-lg" onClick={handleCreateOffer}>
                        <Upload size={18} />
                        I'll Send Files
                      </button>
                      <button className="btn btn-ghost btn-lg" onClick={handleJoin}>
                        <Download size={18} />
                        I'll Receive Files
                      </button>
                    </div>
                  </div>
                </ConnectionPanelWrapper>
              )}

              {/* Generating */}
              {generating && (
                <ConnectionPanelWrapper context="generating">
                  <div className="panel">
                    <div className="generating-state">
                      <Loader2 size={20} className="spin" />
                      <div>
                        <h3>Generating connection code...</h3>
                        <p>Waiting for network discovery to complete.</p>
                      </div>
                    </div>
                  </div>
                </ConnectionPanelWrapper>
              )}

              {/* Sender: offer ready */}
              {role === 'sender' && offer && (
                <ConnectionPanelWrapper context="sender">
                  <div className="panel">
                    <div className="panel-step">
                      <span className="step-badge">Step 1 of 2</span>
                      <h3>Send This Code to the Other Device</h3>
                      <p>Copy the code and send it via any messaging app. Don't edit or shorten it.</p>
                    </div>
                    <div className="code-area">
                      <textarea readOnly value={offer} rows={4} onClick={(e) => e.target.select()} />
                      <div className="code-actions">
                        <span className="code-len">{offer.length} chars</span>
                        <button className="btn btn-primary" onClick={() => copyToClipboard(offer)}>
                          {copied ? <Check size={16} /> : <Copy size={16} />}
                          {copied ? 'Copied!' : 'Copy Code'}
                        </button>
                      </div>
                    </div>

                    <div className="panel-divider" />

                    <div className="panel-step">
                      <span className="step-badge">Step 2 of 2</span>
                      <h3>Paste Their Response Code</h3>
                      <p>The other device will generate a response code. Paste it below to connect.</p>
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
                </ConnectionPanelWrapper>
              )}

              {/* Receiver: paste offer */}
              {role === 'receiver' && !answer && !generating && (
                <ConnectionPanelWrapper context="receiver">
                  <div className="panel">
                    <div className="panel-step">
                      <h3>Paste the Code You Received</h3>
                      <p>Paste the entire code from the other device, then click Generate Response.</p>
                    </div>
                    <div className="code-area">
                      <textarea
                        placeholder="Paste the code you received here..."
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
                </ConnectionPanelWrapper>
              )}

              {/* Receiver: answer ready */}
              {role === 'receiver' && answer && (
                <ConnectionPanelWrapper context="receiver">
                  <div className="panel">
                    <div className="panel-step">
                      <h3>Send This Response Code Back</h3>
                      <p>Copy this code and send it back to the other device to complete the connection.</p>
                    </div>
                    <div className="code-area">
                      <textarea readOnly value={answer} rows={4} onClick={(e) => e.target.select()} />
                      <div className="code-actions">
                        <span className="code-len">{answer.length} chars</span>
                        <button className="btn btn-primary" onClick={() => copyToClipboard(answer)}>
                          {copied ? <Check size={16} /> : <Copy size={16} />}
                          {copied ? 'Copied!' : 'Copy Response'}
                        </button>
                      </div>
                    </div>
                    <div className="waiting-hint">
                      <Loader2 size={14} className="spin" />
                      <span>Waiting for the other device to enter your code...</span>
                    </div>
                  </div>
                </ConnectionPanelWrapper>
              )}
            </div>
          )}

          {error && <div className="call-error">{error}</div>}
        </div>
      </div>
    </>
  )
}
