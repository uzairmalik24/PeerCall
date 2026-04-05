import { useRef, useState, useCallback, useEffect } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

// Strip SDP to keep only opus (audio) and VP8 (video) — removes ~80% of codec bloat
function stripSdp(sdp) {
  const lines = sdp.split('\r\n')
  const result = []
  let currentMedia = null
  let keepPayloads = new Set()
  let skipPayload = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('m=audio')) {
      currentMedia = 'audio'
      keepPayloads = new Set(['111']) // opus
      result.push(line.replace(/(\d+\s+)[\d\s]+$/, (m, prefix) => prefix + '111'))
      continue
    }

    if (line.startsWith('m=video')) {
      currentMedia = 'video'
      keepPayloads = new Set(['96', '97']) // VP8 + rtx
      result.push(line.replace(/(\d+\s+)[\d\s]+$/, (m, prefix) => prefix + '96 97'))
      continue
    }

    if (!currentMedia) {
      result.push(line)
      continue
    }

    // Skip codec lines for payloads we don't want
    const rtpmapMatch = line.match(/^a=rtpmap:(\d+)\s/)
    if (rtpmapMatch) {
      if (!keepPayloads.has(rtpmapMatch[1])) {
        skipPayload = rtpmapMatch[1]
        continue
      }
      skipPayload = null
    }

    const fmtpMatch = line.match(/^a=fmtp:(\d+)\s/)
    if (fmtpMatch && !keepPayloads.has(fmtpMatch[1])) continue

    const rtcpFbMatch = line.match(/^a=rtcpfb:(\d+)\s/) || line.match(/^a=rtcp-fb:(\d+)\s/)
    if (rtcpFbMatch && !keepPayloads.has(rtcpFbMatch[1])) continue

    result.push(line)
  }

  return result.join('\r\n')
}

function restoreSdp(sdp) {
  // Stripped SDP works fine — browser ignores missing codecs gracefully
  return sdp
}

// Compress with deflate then base64
async function compress(obj) {
  // Strip SDP before compressing
  const stripped = { ...obj }
  if (stripped.sdp) {
    stripped.sdp = stripSdp(stripped.sdp)
  }
  const json = JSON.stringify(stripped)
  const blob = new Blob([json])
  const cs = new CompressionStream('deflate')
  const stream = blob.stream().pipeThrough(cs)
  const buf = await new Response(stream).arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function decompress(str) {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes])
  const ds = new DecompressionStream('deflate')
  const stream = blob.stream().pipeThrough(ds)
  const text = await new Response(stream).text()
  return JSON.parse(text)
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
      if (state === 'connected') {
        setError(null)
      }
    }

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      if (state === 'failed') {
        setError('Connection failed. Please try again.')
      }
      if (state === 'connected') {
        setError(null)
      }
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

      const code = await compress(pc.localDescription)
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

      const offerDesc = await decompress(offerCode)
      await pc.setRemoteDescription(offerDesc)

      const answerDesc = await pc.createAnswer()
      await pc.setLocalDescription(answerDesc)

      await waitForIceCandidates()

      const code = await compress(pc.localDescription)
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
      const answerDesc = await decompress(answerCode)
      await pcRef.current.setRemoteDescription(answerDesc)
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
