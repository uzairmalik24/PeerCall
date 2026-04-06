import { useRef, useState, useCallback, useEffect } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const CHUNK_SIZE = 64 * 1024 // 64KB chunks

// Data-channel SDP is tiny — no media codecs. Just deflate + base64.
async function encode(desc) {
  const raw = (desc.type === 'offer' ? 'O' : 'A') + desc.sdp
  const blob = new Blob([raw])
  const cs = new CompressionStream('deflate')
  const compressed = blob.stream().pipeThrough(cs)
  const buf = await new Response(compressed).arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

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

export default function useFileTransfer() {
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const resolveIceRef = useRef(null)

  const [connectionState, setConnectionState] = useState('idle')
  const [offer, setOffer] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)

  // Transfer state
  const [sending, setSending] = useState(null) // { name, size, sent }
  const [receiving, setReceiving] = useState(null) // { name, size, received }
  const [receivedFiles, setReceivedFiles] = useState([]) // [{ name, size, url, type }]
  const [sendQueue, setSendQueue] = useState([]) // files waiting
  const [channelOpen, setChannelOpen] = useState(false)

  const receiveBufferRef = useRef([])
  const receiveMetaRef = useRef(null)

  const setupDataChannel = useCallback((dc) => {
    dcRef.current = dc
    dc.binaryType = 'arraybuffer'

    dc.onopen = () => {
      setChannelOpen(true)
      setError(null)
    }

    dc.onclose = () => {
      setChannelOpen(false)
    }

    dc.onmessage = (e) => {
      if (typeof e.data === 'string') {
        // Metadata message
        const meta = JSON.parse(e.data)
        if (meta.type === 'file-start') {
          receiveMetaRef.current = { name: meta.name, size: meta.size, mimeType: meta.mimeType }
          receiveBufferRef.current = []
          setReceiving({ name: meta.name, size: meta.size, received: 0 })
        } else if (meta.type === 'file-end') {
          const blob = new Blob(receiveBufferRef.current, {
            type: receiveMetaRef.current?.mimeType || 'application/octet-stream'
          })
          const url = URL.createObjectURL(blob)
          const fileMeta = receiveMetaRef.current
          setReceivedFiles((prev) => [
            ...prev,
            { name: fileMeta.name, size: fileMeta.size, url, type: fileMeta.mimeType },
          ])
          setReceiving(null)
          receiveBufferRef.current = []
          receiveMetaRef.current = null
        }
      } else {
        // Binary chunk
        receiveBufferRef.current.push(e.data)
        const totalReceived = receiveBufferRef.current.reduce((s, b) => s + b.byteLength, 0)
        setReceiving((prev) => prev ? { ...prev, received: totalReceived } : null)
      }
    }
  }, [])

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    pc.onicecandidate = (e) => {
      if (!e.candidate) resolveIceRef.current?.()
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

  const waitForIce = () =>
    new Promise((resolve) => {
      resolveIceRef.current = resolve
      // Don't hang forever waiting for STUN — 2s is enough for data channels
      setTimeout(resolve, 2000)
    })

  const createOffer = useCallback(async () => {
    try {
      setError(null)
      setGenerating(true)
      setConnectionState('connecting')
      const pc = createPeerConnection()
      const dc = pc.createDataChannel('files', { ordered: true })
      setupDataChannel(dc)

      const offerDesc = await pc.createOffer()
      await pc.setLocalDescription(offerDesc)
      await waitForIce()

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
  }, [createPeerConnection, setupDataChannel])

  const createAnswer = useCallback(async (offerCode) => {
    try {
      setError(null)
      setGenerating(true)
      setConnectionState('connecting')
      const pc = createPeerConnection()

      pc.ondatachannel = (e) => {
        setupDataChannel(e.channel)
      }

      const offerDesc = await decode(offerCode)
      await pc.setRemoteDescription(new RTCSessionDescription(offerDesc))

      const answerDesc = await pc.createAnswer()
      await pc.setLocalDescription(answerDesc)
      await waitForIce()

      const desc = pc.localDescription
      const code = await encode({ type: desc.type, sdp: desc.sdp })
      setAnswer(code)
      setGenerating(false)
      return code
    } catch (err) {
      setConnectionState('idle')
      setGenerating(false)
      setError('Invalid code. Please check and try again.')
      throw err
    }
  }, [createPeerConnection, setupDataChannel])

  const acceptAnswer = useCallback(async (answerCode) => {
    try {
      setError(null)
      const answerDesc = await decode(answerCode)
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerDesc))
    } catch (err) {
      setError('Invalid response code. Please check and try again.')
    }
  }, [])

  const sendFile = useCallback(async (file) => {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') {
      setError('Not connected. Establish connection first.')
      return
    }

    // Send metadata
    dc.send(JSON.stringify({
      type: 'file-start',
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
    }))

    setSending({ name: file.name, size: file.size, sent: 0 })

    const buffer = await file.arrayBuffer()
    let offset = 0

    const sendChunk = () => {
      while (offset < buffer.byteLength) {
        if (dc.bufferedAmount > CHUNK_SIZE * 8) {
          // Backpressure — wait for buffer to drain
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null
            sendChunk()
          }
          dc.bufferedAmountLowThreshold = CHUNK_SIZE * 2
          return
        }
        const chunk = buffer.slice(offset, offset + CHUNK_SIZE)
        dc.send(chunk)
        offset += chunk.byteLength
        setSending({ name: file.name, size: file.size, sent: offset })
      }

      // Done
      dc.send(JSON.stringify({ type: 'file-end' }))
      setSending(null)
    }

    sendChunk()
  }, [])

  const disconnect = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    setConnectionState('idle')
    setOffer('')
    setAnswer('')
    setError(null)
    setGenerating(false)
    setSending(null)
    setReceiving(null)
    setChannelOpen(false)
  }, [])

  useEffect(() => {
    return () => {
      if (dcRef.current) dcRef.current.close()
      if (pcRef.current) pcRef.current.close()
    }
  }, [])

  return {
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
  }
}
