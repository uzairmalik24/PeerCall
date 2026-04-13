import { useRef, useState, useCallback, useEffect } from 'react'

// Enhanced ICE servers with multiple STUN and optional TURN servers for better NAT traversal
const ICE_SERVERS = [
  // Google STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Clockwork STUN servers (alternative option)
  { urls: 'stun:stun.keybrutal.com:3478' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  // Public TURN server (US-based)
  {
    urls: ['turn:turnserver.open-relay.com:80', 'turn:openrelay.metered.ca:80'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

// Strip SDP to opus + VP8 only — safe because we dynamically find the PTs
function minifySdp(sdp) {
  const lines = sdp.split('\r\n')
  let opusPT = null, vp8PT = null, vp8RtxPT = null

  for (const line of lines) {
    const opus = line.match(/^a=rtpmap:(\d+) opus\//)
    if (opus) opusPT = opus[1]
    const vp8 = line.match(/^a=rtpmap:(\d+) VP8\//)
    if (vp8) vp8PT = vp8[1]
  }
  if (vp8PT) {
    for (const line of lines) {
      const m = line.match(/^a=fmtp:(\d+) apt=(\d+)$/)
      if (m && m[2] === vp8PT) { vp8RtxPT = m[1]; break }
    }
  }

  const out = []
  let section = null, keepPTs = null

  for (const line of lines) {
    if (line.startsWith('m=audio ')) {
      section = 'audio'
      keepPTs = opusPT ? new Set([opusPT]) : null
      if (opusPT) {
        const pre = line.match(/^(m=audio \d+ \S+ )/)
        out.push(pre ? pre[1] + opusPT : line)
      } else out.push(line)
      continue
    }
    if (line.startsWith('m=video ')) {
      section = 'video'
      const pts = [vp8PT, vp8RtxPT].filter(Boolean)
      keepPTs = pts.length ? new Set(pts) : null
      if (pts.length) {
        const pre = line.match(/^(m=video \d+ \S+ )/)
        out.push(pre ? pre[1] + pts.join(' ') : line)
      } else out.push(line)
      continue
    }
    if (section && keepPTs) {
      const ptLine = line.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)[ /]/)
      if (ptLine && !keepPTs.has(ptLine[1])) continue
      if (line.startsWith('a=candidate:') && line.includes(' tcp ')) continue
    }
    out.push(line)
  }
  return out.join('\r\n')
}

// URL-safe base64: replace + → - and / → _ to avoid messaging app mangling
function toBase64Url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  return atob(b64)
}

// Encode: minify SDP → type prefix + raw SDP → deflate → URL-safe base64
async function encode(desc) {
  const minified = minifySdp(desc.sdp)
  const raw = (desc.type === 'offer' ? 'O' : 'A') + minified
  const blob = new Blob([raw])
  const cs = new CompressionStream('deflate')
  const compressed = blob.stream().pipeThrough(cs)
  const buf = await new Response(compressed).arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return toBase64Url(bin)
}

// Decode: URL-safe base64 → inflate → type prefix + raw SDP
async function decode(str) {
  // Clean whitespace, newlines, and invisible chars that messaging apps add
  const cleaned = str.trim().replace(/[\s\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u205F-\u206F\uFEFF]/g, '')

  let bin
  try {
    // Try URL-safe base64 first, fall back to standard base64
    bin = fromBase64Url(cleaned)
  } catch {
    try {
      bin = atob(cleaned)
    } catch {
      throw new Error('DECODE_FAILED')
    }
  }

  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const blob = new Blob([bytes])
  const ds = new DecompressionStream('deflate')
  const decompressed = blob.stream().pipeThrough(ds)

  let text
  try {
    text = await new Response(decompressed).text()
  } catch {
    throw new Error('DECOMPRESS_FAILED')
  }

  if (text[0] !== 'O' && text[0] !== 'A') {
    throw new Error('INVALID_FORMAT')
  }

  return {
    type: text[0] === 'O' ? 'offer' : 'answer',
    sdp: text.slice(1),
  }
}

export default function useWebRTC() {
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(new MediaStream())

  const [localStream, setLocalStream] = useState(null)
  const [remoteStream] = useState(remoteStreamRef.current)
  const [connectionState, setConnectionState] = useState('idle')
  const [offer, setOffer] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState(null)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [generating, setGenerating] = useState(false)

  const resolveIceRef = useRef(null)

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ 
      iceServers: ICE_SERVERS,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 10,
    })
    pcRef.current = pc

    // Enhanced ICE candidate handling with filtering
    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        resolveIceRef.current?.()
        return
      }
      // Log successful candidates for debugging
      const cand = e.candidate.candidate
      if (cand.includes('host') || cand.includes('srflx') || cand.includes('relay')) {
        // Candidate is valid, ICE will handle it
      }
    }

    // Better track handling
    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach((track) => {
        track.onended = () => {
          console.warn(`Remote ${track.kind} track ended`)
        }
        remoteStreamRef.current.addTrack(track)
      })
    }

    // Enhanced connection state monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      setConnectionState(state)
      
      switch(state) {
        case 'connected':
          setError(null)
          console.log('✓ Peer connection established')
          break
        case 'disconnected':
          console.warn('⚠ Connection lost, attempting to recover...')
          setError('Connection temporarily lost. Reconnecting...')
          break
        case 'failed':
          console.error('✗ Peer connection failed')
          setError('Connection failed. Trying to reconnect...')
          // Attempt ICE restart
          setTimeout(() => {
            if (pcRef.current?.connectionState === 'failed') {
              pc.restartIce?.()
            }
          }, 2000)
          break
        case 'closed':
          console.log('Connection closed')
          break
      }
    }

    // Enhanced ICE connection state monitoring
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      console.log(`ICE state: ${state}`)
      
      switch(state) {
        case 'failed':
          setError('ICE connection failed. Both users may be behind strict firewalls. Using fallback TURN servers...')
          break
        case 'connected':
        case 'completed':
          setError(null)
          break
        case 'disconnected':
          console.warn('ICE disconnected - may reconnect automatically')
          break
      }
    }

    // Monitor ICE gathering state for better diagnostics
    pc.onicegatheringstatechange = () => {
      console.log(`ICE gathering state: ${pc.iceGatheringState}`)
    }

    // Monitor signaling state
    pc.onsignalingstatechange = () => {
      console.log(`Signaling state: ${pc.signalingState}`)
    }

    return pc
  }, [])

  const startMedia = useCallback(async (video = true) => {
    try {
      // Try optimal constraints first
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: video ? { 
          width: { ideal: 1280, max: 1920 }, 
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        } : false,
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        localStreamRef.current = stream
        setLocalStream(stream)
        return stream
      } catch (err) {
        // Fallback to lower constraints if first attempt fails
        console.warn('Optimal constraints failed, trying fallback...')
        const fallbackConstraints = {
          audio: true,
          video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
        }
        const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
        localStreamRef.current = stream
        setLocalStream(stream)
        return stream
      }
    } catch (err) {
      const errorMsg = err.name === 'NotAllowedError'
        ? 'Camera/microphone access denied. Please allow permissions in browser settings.'
        : err.name === 'NotFoundError'
        ? 'No camera or microphone found on your device.'
        : err.name === 'NotReadableError'
        ? 'Camera/microphone is already in use by another application.'
        : 'Could not access camera/microphone. Please check your device connections and browser permissions.'
      
      console.error('Media error:', err.name, err.message)
      setError(errorMsg)
      throw err
    }
  }, [])

  const waitForIceCandidates = () =>
    new Promise((resolve) => {
      let resolved = false
      const done = () => { if (!resolved) { resolved = true; resolve() } }
      resolveIceRef.current = done
      
      // Wait longer for better candidate gathering, especially for TURN servers
      // First 3s for fast candidates (host/srflx), then 7s more for TURN relay
      setTimeout(done, 12000)
      
      // Early exit if we have enough candidates (after 3s)
      setTimeout(() => {
        if (!resolved && pcRef.current?.iceGatheringState === 'complete') {
          done()
        }
      }, 3000)
    })

  const createOffer = useCallback(async (video = true) => {
    try {
      setError(null)
      setGenerating(true)
      setConnectionState('connecting')
      
      const stream = await startMedia(video)
      const pc = createPeerConnection()
      
      // Add tracks and monitor for quality
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
        
        // Monitor track quality
        track.onended = () => {
          setError(`${track.kind.toUpperCase()} track ended unexpectedly`)
        }
      })
      
      const offerDesc = await pc.createOffer({
        iceRestart: false,
        voiceActivityDetection: true,
      })
      
      await pc.setLocalDescription(offerDesc)
      await waitForIceCandidates()
      
      const desc = pc.localDescription
      const code = await encode({ type: desc.type, sdp: desc.sdp })
      
      setOffer(code)
      setGenerating(false)
      return code
    } catch (err) {
      console.error('Offer creation failed:', err)
      setConnectionState('idle')
      setGenerating(false)
      if (!error) { // Only set if not already set by other handler
        setError('Failed to create connection offer. Check your network and device permissions.')
      }
      throw err
    }
  }, [startMedia, createPeerConnection, error])

  const createAnswer = useCallback(async (offerCode, video = true) => {
    try {
      setError(null)
      setGenerating(true)
      setConnectionState('connecting')
      
      const stream = await startMedia(video)
      const pc = createPeerConnection()
      
      // Add tracks with monitoring
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
        track.onended = () => {
          setError(`${track.kind.toUpperCase()} track ended unexpectedly`)
        }
      })
      
      const offerDesc = await decode(offerCode)
      await pc.setRemoteDescription(new RTCSessionDescription(offerDesc))
      
      const answerDesc = await pc.createAnswer({
        voiceActivityDetection: true,
      })
      
      await pc.setLocalDescription(answerDesc)
      await waitForIceCandidates()
      
      const desc = pc.localDescription
      const code = await encode({ type: desc.type, sdp: desc.sdp })
      
      setAnswer(code)
      setGenerating(false)
      return code
    } catch (err) {
      console.error('Answer creation failed:', err)
      setConnectionState('idle')
      setGenerating(false)
      
      if (err.message === 'DECODE_FAILED') {
        setError('Could not read this code. Make sure you copied the entire code without any missing characters.')
      } else if (err.message === 'DECOMPRESS_FAILED') {
        setError('Code is corrupted. The code may have been truncated or modified during copy-paste. Try copying it again.')
      } else if (err.message === 'INVALID_FORMAT') {
        setError('This doesn\'t look like a valid PeerCall code. Make sure you\'re pasting the correct code.')
      } else {
        setError('Could not process the code. Make sure you copied the complete code from the other person.')
      }
      throw err
    }
  }, [startMedia, createPeerConnection])

  const acceptAnswer = useCallback(async (answerCode) => {
    try {
      setError(null)
      const answerDesc = await decode(answerCode)
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerDesc))
      console.log('✓ Answer accepted, connection should establish shortly...')
    } catch (err) {
      console.error('Answer acceptance failed:', err)
      if (err.message === 'DECODE_FAILED') {
        setError('Could not read this response code. Make sure you copied the entire code without any missing characters.')
      } else if (err.message === 'DECOMPRESS_FAILED') {
        setError('Response code is corrupted. It may have been truncated during copy-paste. Ask the other person to copy it again.')
      } else if (err.message === 'INVALID_FORMAT') {
        setError('This doesn\'t look like a valid response code. Make sure you\'re pasting the response, not the original offer code.')
      } else {
        setError('Could not process the response code. Make sure the other person copied the complete response code.')
      }
    }
  }, [])

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
      setAudioEnabled((prev) => !prev)
    }
  }, [])

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
      setVideoEnabled((prev) => !prev)
    }
  }, [])

  const hangUp = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
      setLocalStream(null)
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    remoteStreamRef.current = new MediaStream()
    setConnectionState('idle')
    setOffer('')
    setAnswer('')
    setError(null)
    setAudioEnabled(true)
    setVideoEnabled(true)
    setGenerating(false)
  }, [])

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (pcRef.current) {
        pcRef.current.close()
      }
    }
  }, [])

  return {
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
  }
}
