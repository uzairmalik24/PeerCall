import { useRef, useState, useCallback, useEffect } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

// Extract only the essential fields from SDP (~200 bytes instead of ~5000)
function extractEssentials(type, sdp) {
  const lines = sdp.split('\r\n')
  const data = { t: type === 'offer' ? 0 : 1, c: [] }

  // Session level
  const oLine = lines.find(l => l.startsWith('o='))
  if (oLine) data.o = oLine.slice(2)

  const bundleLine = lines.find(l => l.startsWith('a=group:BUNDLE'))
  if (bundleLine) data.b = bundleLine.slice(14).trim()

  // Parse media sections
  const mediaSections = []
  let current = null
  for (const line of lines) {
    if (line.startsWith('m=')) {
      current = { m: line, lines: [] }
      mediaSections.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }

  data.ms = []
  for (const sec of mediaSections) {
    const s = {}
    // media line: m=audio 55924 UDP/TLS/RTP/SAVPF 111
    const mParts = sec.m.match(/^m=(\w+)\s+(\d+)\s+(\S+)\s+(.+)$/)
    if (!mParts) continue
    s.k = mParts[1] // kind: audio/video
    s.p = parseInt(mParts[2]) // port
    s.pr = mParts[3] // protocol
    s.pt = mParts[4] // payload types

    for (const line of sec.lines) {
      if (line.startsWith('a=ice-ufrag:')) s.u = line.slice(12)
      else if (line.startsWith('a=ice-pwd:')) s.pw = line.slice(10)
      else if (line.startsWith('a=fingerprint:')) s.fp = line.slice(14)
      else if (line.startsWith('a=setup:')) s.su = line.slice(8)
      else if (line.startsWith('a=mid:')) s.mi = line.slice(6)
      else if (line.startsWith('a=sendrecv')) s.d = 'sr'
      else if (line.startsWith('a=sendonly')) s.d = 'so'
      else if (line.startsWith('a=recvonly')) s.d = 'ro'
      else if (line.startsWith('a=inactive')) s.d = 'in'
      else if (line.startsWith('a=rtpmap:')) {
        if (!s.rm) s.rm = []
        s.rm.push(line.slice(9))
      }
      else if (line.startsWith('a=fmtp:')) {
        if (!s.fm) s.fm = []
        s.fm.push(line.slice(7))
      }
      else if (line.startsWith('a=rtcp-fb:')) {
        if (!s.fb) s.fb = []
        s.fb.push(line.slice(10))
      }
      else if (line.startsWith('a=extmap:')) {
        if (!s.em) s.em = []
        s.em.push(line.slice(9))
      }
      else if (line.startsWith('a=ssrc-group:')) {
        if (!s.sg) s.sg = []
        s.sg.push(line.slice(13))
      }
      else if (line.startsWith('a=ssrc:')) {
        if (!s.ss) s.ss = []
        s.ss.push(line.slice(7))
      }
      else if (line.startsWith('a=msid-semantic:')) s.ms = line.slice(16)
      else if (line.startsWith('a=msid:')) s.id = line.slice(7)
      else if (line.startsWith('a=rtcp-mux')) s.mx = 1
      else if (line.startsWith('a=rtcp-rsize')) s.rs = 1
      else if (line.startsWith('a=candidate:')) {
        // Only keep udp candidates
        if (line.includes(' udp ') || line.includes(' UDP ')) {
          if (!data.c) data.c = []
          data.c.push(line.slice(12))
        }
      }
    }
    data.ms.push(s)
  }

  // msid-semantic from session level
  const msidSem = lines.find(l => l.startsWith('a=msid-semantic:'))
  if (msidSem) data.se = msidSem.slice(16).trim()

  // extmap-allow-mixed
  if (lines.some(l => l === 'a=extmap-allow-mixed')) data.ea = 1

  return data
}

// Rebuild full SDP from essential fields
function rebuildSdp(data) {
  const lines = []
  lines.push('v=0')
  lines.push('o=' + (data.o || '- 0 0 IN IP4 127.0.0.1'))
  lines.push('s=-')
  lines.push('t=0 0')
  if (data.b) lines.push('a=group:BUNDLE ' + data.b)
  if (data.ea) lines.push('a=extmap-allow-mixed')
  if (data.se) lines.push('a=msid-semantic: ' + data.se)

  for (const s of (data.ms || [])) {
    lines.push('m=' + s.k + ' ' + s.p + ' ' + s.pr + ' ' + s.pt)
    // Pick IP from first candidate or use 0.0.0.0
    let ip = '0.0.0.0'
    if (data.c && data.c.length) {
      const parts = data.c[0].split(' ')
      ip = parts[4] || '0.0.0.0'
    }
    lines.push('c=IN IP4 ' + ip)
    lines.push('a=rtcp:9 IN IP4 0.0.0.0')

    // ICE candidates for this media section
    if (data.c) {
      for (const c of data.c) lines.push('a=candidate:' + c)
    }

    if (s.u) lines.push('a=ice-ufrag:' + s.u)
    if (s.pw) lines.push('a=ice-pwd:' + s.pw)
    lines.push('a=ice-options:trickle')
    if (s.fp) lines.push('a=fingerprint:' + s.fp)
    if (s.su) lines.push('a=setup:' + s.su)
    if (s.mi !== undefined) lines.push('a=mid:' + s.mi)

    if (s.em) for (const e of s.em) lines.push('a=extmap:' + e)

    const dir = { sr: 'sendrecv', so: 'sendonly', ro: 'recvonly', in: 'inactive' }
    lines.push('a=' + (dir[s.d] || 'sendrecv'))
    if (s.id) lines.push('a=msid:' + s.id)
    if (s.mx) lines.push('a=rtcp-mux')
    if (s.rs) lines.push('a=rtcp-rsize')

    if (s.rm) for (const r of s.rm) lines.push('a=rtpmap:' + r)
    if (s.fb) for (const f of s.fb) lines.push('a=rtcp-fb:' + f)
    if (s.fm) for (const f of s.fm) lines.push('a=fmtp:' + f)
    if (s.sg) for (const g of s.sg) lines.push('a=ssrc-group:' + g)
    if (s.ss) for (const ss of s.ss) lines.push('a=ssrc:' + ss)
  }

  lines.push('')
  return lines.join('\r\n')
}

// Strip SDP to opus + VP8 only before extracting essentials
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

// Encode: SDP → minify → extract essentials → deflate → base64
async function encode(desc) {
  const minified = minifySdp(desc.sdp)
  const essentials = extractEssentials(desc.type, minified)
  const json = JSON.stringify(essentials)
  const blob = new Blob([json])
  const cs = new CompressionStream('deflate')
  const compressed = blob.stream().pipeThrough(cs)
  const buf = await new Response(compressed).arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

// Decode: base64 → inflate → rebuild SDP
async function decode(str) {
  const cleaned = str.trim().replace(/\s/g, '')
  const bin = atob(cleaned)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const blob = new Blob([bytes])
  const ds = new DecompressionStream('deflate')
  const decompressed = blob.stream().pipeThrough(ds)
  const text = await new Response(decompressed).text()
  const data = JSON.parse(text)
  return {
    type: data.t === 0 ? 'offer' : 'answer',
    sdp: rebuildSdp(data),
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
      if (!e.candidate) resolveIceRef.current?.()
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
      // Don't wait forever for STUN — 3s is enough to get host + srflx candidates
      setTimeout(resolve, 3000)
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
