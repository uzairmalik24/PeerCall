import { useRef, useState, useCallback, useEffect } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const CHUNK_SIZE = 64 * 1024

function toBase64Url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  return atob(b64)
}

async function encode(desc) {
  const raw = (desc.type === 'offer' ? 'O' : 'A') + desc.sdp
  const blob = new Blob([raw])
  const cs = new CompressionStream('deflate')
  const compressed = blob.stream().pipeThrough(cs)
  const buf = await new Response(compressed).arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return toBase64Url(bin)
}

async function decode(str) {
  const cleaned = str.trim().replace(/[\s\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u205F-\u206F\uFEFF]/g, '')

  let bin
  try {
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

function getDecodeError(err, context) {
  if (err.message === 'DECODE_FAILED') {
    return `Could not read this ${context}. Make sure you copied the entire code without any missing characters.`
  }
  if (err.message === 'DECOMPRESS_FAILED') {
    return `${context.charAt(0).toUpperCase() + context.slice(1)} is corrupted. It may have been truncated during copy-paste. Try copying it again.`
  }
  if (err.message === 'INVALID_FORMAT') {
    return `This doesn't look like a valid PeerCall ${context}. Make sure you're pasting the correct code.`
  }
  return `Could not process the ${context}. Make sure the complete code was copied.`
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

  const [sending, setSending] = useState(null)
  const [receiving, setReceiving] = useState(null)
  const [receivedFiles, setReceivedFiles] = useState([])
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
      if (state === 'failed') setError('Connection failed. Both users may be behind strict firewalls that block direct connections.')
      if (state === 'connected') setError(null)
    }

    return pc
  }, [])

  const waitForIce = () =>
    new Promise((resolve) => {
      let resolved = false
      const done = () => { if (!resolved) { resolved = true; resolve() } }
      resolveIceRef.current = done
      setTimeout(done, 5000)
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
      if (offerDesc.type !== 'offer') {
        throw new Error('UNEXPECTED_ANSWER_CODE')
      }
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
      if (err.message === 'UNEXPECTED_ANSWER_CODE') {
        setError('It looks like you pasted the response code instead of the original connection code. Paste the first code shared by the other laptop.')
      } else {
        setError(getDecodeError(err, 'code'))
      }
      throw err
    }
  }, [createPeerConnection, setupDataChannel])

  const acceptAnswer = useCallback(async (answerCode) => {
    try {
      setError(null)
      if (!pcRef.current) {
        throw new Error('NO_PEER_CONNECTION')
      }

      const answerDesc = await decode(answerCode)
      if (answerDesc.type !== 'answer') {
        throw new Error('UNEXPECTED_OFFER_CODE')
      }

      const pc = pcRef.current
      if (!pc.localDescription || pc.signalingState === 'stable') {
        throw new Error('WRONG_CONNECTION_STATE')
      }

      await pc.setRemoteDescription(new RTCSessionDescription(answerDesc))
    } catch (err) {
      console.error('Error accepting answer:', err)
      if (err.message === 'UNEXPECTED_OFFER_CODE') {
        setError('It looks like you pasted the initial code instead of the response code. Paste the response code sent by the other laptop.')
      } else if (err.message === 'NO_PEER_CONNECTION') {
        setError('Connection was not initialized properly. Start again by creating a new connection code on the first laptop.')
      } else if (err.message === 'WRONG_CONNECTION_STATE') {
        setError('The response could not be applied because the original offer is no longer active. Please start again by generating a new offer and response.')
      } else {
        setError(getDecodeError(err, 'response code'))
      }
    }
  }, [])

  const sendFile = useCallback(async (file) => {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') {
      setError('Not connected. Establish connection first.')
      return
    }

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
