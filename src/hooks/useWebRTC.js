import { useRef, useState, useCallback, useEffect } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
]

function encode(obj) {
  return btoa(JSON.stringify(obj))
}

function decode(str) {
  return JSON.parse(atob(str))
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

  const iceCandidatesRef = useRef([])
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
      setConnectionState(pc.connectionState)
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        setError('Connection failed. Please try again.')
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
      setConnectionState('connecting')
      const stream = await startMedia(video)
      const pc = createPeerConnection()

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      const offerDesc = await pc.createOffer()
      await pc.setLocalDescription(offerDesc)

      await waitForIceCandidates()

      const code = encode(pc.localDescription)
      setOffer(code)
      return code
    } catch (err) {
      setConnectionState('idle')
      throw err
    }
  }, [startMedia, createPeerConnection])

  const createAnswer = useCallback(async (offerCode, video = true) => {
    try {
      setError(null)
      setConnectionState('connecting')
      const stream = await startMedia(video)
      const pc = createPeerConnection()

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      const offerDesc = decode(offerCode)
      await pc.setRemoteDescription(offerDesc)

      const answerDesc = await pc.createAnswer()
      await pc.setLocalDescription(answerDesc)

      await waitForIceCandidates()

      const code = encode(pc.localDescription)
      setAnswer(code)
      return code
    } catch (err) {
      setConnectionState('idle')
      setError('Invalid offer code. Please check and try again.')
      throw err
    }
  }, [startMedia, createPeerConnection])

  const acceptAnswer = useCallback(async (answerCode) => {
    try {
      setError(null)
      const answerDesc = decode(answerCode)
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
    createOffer,
    createAnswer,
    acceptAnswer,
    toggleAudio,
    toggleVideo,
    hangUp,
  }
}
