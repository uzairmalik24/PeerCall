import { useRef, useState, useCallback, useEffect } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

// Strip SDP down to opus + VP8 only. Removes ~80% of bloat safely.
// Dynamically finds the correct payload types from the SDP itself.
function minifySdp(sdp) {
  const lines = sdp.split('\r\n')

  // Pass 1: discover payload types
  let opusPT = null
  let vp8PT = null
  let vp8RtxPT = null

  for (const line of lines) {
    const opus = line.match(/^a=rtpmap:(\d+) opus\//)
    if (opus) opusPT = opus[1]
    const vp8 = line.match(/^a=rtpmap:(\d+) VP8\//)
    if (vp8) vp8PT = vp8[1]
  }

  // Find RTX paired with VP8
  if (vp8PT) {
    for (const line of lines) {
      const m = line.match(/^a=fmtp:(\d+) apt=(\d+)$/)
      if (m && m[2] === vp8PT) { vp8RtxPT = m[1]; break }
    }
  }

  // Pass 2: filter lines
  const out = []
  let section = null // null | 'audio' | 'video'
  let keepPTs = null

  for (const line of lines) {
    // Media section start — rewrite with only kept PTs
    if (line.startsWith('m=audio ')) {
      section = 'audio'
      keepPTs = opusPT ? new Set([opusPT]) : null
      if (opusPT) {
        const pre = line.match(/^(m=audio \d+ \S+ )/)
        out.push(pre ? pre[1] + opusPT : line)
      } else {
        out.push(line)
      }
      continue
    }
    if (line.startsWith('m=video ')) {
      section = 'video'
      const pts = [vp8PT, vp8RtxPT].filter(Boolean)
      keepPTs = pts.length ? new Set(pts) : null
      if (pts.length) {
        const pre = line.match(/^(m=video \d+ \S+ )/)
        out.push(pre ? pre[1] + pts.join(' ') : line)
      } else {
        out.push(line)
      }
      continue
    }

    // Inside a media section with codec filtering active
    if (section && keepPTs) {
      // Drop rtpmap / fmtp / rtcp-fb for payload types we don't keep
      const ptLine = line.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)[ /]/)
      if (ptLine && !keepPTs.has(ptLine[1])) continue

      // Drop tcp candidates (never connect in practice)
      if (line.startsWith('a=candidate:') && line.includes(' tcp ')) continue
    }

    out.push(line)
  }

  return out.join('\r\n')
}

// Encode: minify SDP → prepend type char → deflate → base64
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
  return btoa(bin)
}

// Decode: base64 → inflate → split type char + SDP
async function decode(str) {
  const cleaned = str.trim().replace(/\s/g, '')
  const bin = atob(cleaned)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const blob = new Blob([bytes])
  const ds = new DecompressionStream('deflate')
  const decompressed = blob.stream().pipeThrough(ds)
  const text = await new Response(decompressed).text()
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
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        resolveIceRef.current?.()
      }
    }

    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach((track) => {
        remoteStreamRef.current.addTrack(track)
      })
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      setConnectionState(state)
      if (state === 'connected') setError(null)
    }

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      if (state === 'failed') setError('Connection failed. Please try again.')
      if (state === 'connected') setError(null)
    }

    return pc
  }, [])

  const startMedia = useCallback(async (video = true) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      })
      localStreamRef.current = stream
      setLocalStream(stream)
      return stream
    } catch (err) {
      setError('Could not access camera/microphone. Please allow permissions.')
      throw err
    }
  }, [])

  const waitForIceCandidates = () =>
    new Promise((resolve) => {
      resolveIceRef.current = resolve
    })

  const createOffer = useCallback(async (video = true) => {
    try {
      setError(null)
      setGenerating(true)
      setConnectionState('connecting')
      const stream = await startMedia(video)
      const pc = createPeerConnection()

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      const offerDesc = await pc.createOffer()
      await pc.setLocalDescription(offerDesc)
      await waitForIceCandidates()

      const desc = pc.localDescription
      const code = await encode({ type: desc.type, sdp: desc.sdp })
      setOffer(code)
      setGenerating(false)
      return code
    } catch (err) {
      setConnectionState('idle')
      setGenerating(false)
      throw err
    }
  }, [startMedia, createPeerConnection])

  const createAnswer = useCallback(async (offerCode, video = true) => {
    try {
      setError(null)
      setGenerating(true)
      setConnectionState('connecting')
      const stream = await startMedia(video)
      const pc = createPeerConnection()

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      const offerDesc = await decode(offerCode)
      await pc.setRemoteDescription(new RTCSessionDescription(offerDesc))

      const answerDesc = await pc.createAnswer()
      await pc.setLocalDescription(answerDesc)
      await waitForIceCandidates()

      const desc = pc.localDescription
      const code = await encode({ type: desc.type, sdp: desc.sdp })
      setAnswer(code)
      setGenerating(false)
      return code
    } catch (err) {
      setConnectionState('idle')
      setGenerating(false)
      setError('Invalid offer code. Please check and try again.')
      throw err
    }
  }, [startMedia, createPeerConnection])

  const acceptAnswer = useCallback(async (answerCode) => {
    try {
      setError(null)
      const answerDesc = await decode(answerCode)
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerDesc))
    } catch (err) {
      setError('Invalid answer code. Please check and try again.')
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
