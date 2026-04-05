import { useRef, useState, useCallback, useEffect } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

// Compress with deflate then base64
async function compress(obj) {
  const json = JSON.stringify(obj)
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
