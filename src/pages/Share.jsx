import { useRef, useState, useCallback, useEffect } from 'react'

// Reliable STUN servers only — public TURN credentials are almost always broken
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
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
    dc.bufferedAmountLowThreshold = 256 * 1024

    dc.onopen = () => {
      console.log('✓ Data channel opened')
      setChannelOpen(true)
      setError(null)
    }

    dc.onclose = () => {
      console.warn('Data channel closed')
      setChannelOpen(false)
    }

    dc.onerror = (event) => {
      console.error('Data channel error:', event)
      setError(`Data channel error: ${event.error?.message || 'Unknown error'}. Try reconnecting.`)
    }

    dc.onmessage = (e) => {
      try {
        if (typeof e.data === 'string') {
          const meta = JSON.parse(e.data)
          if (meta.type === 'file-start') {
            receiveMetaRef.current = { name: meta.name, size: meta.size, mimeType: meta.mimeType }
            receiveBufferRef.current = []
            setReceiving({ name: meta.name, size: meta.size, received: 0 })
            console.log(`Receiving: ${meta.name} (${meta.size} bytes)`)
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
            console.log(`✓ Finished receiving: ${fileMeta.name}`)
            setReceiving(null)
            receiveBufferRef.current = []
            receiveMetaRef.current = null
          }
        } else {
          receiveBufferRef.current.push(e.data)
          const totalReceived = receiveBufferRef.current.reduce((s, b) => s + b.byteLength, 0)
          setReceiving((prev) => prev ? { ...prev, received: totalReceived } : null)
        }
      } catch (err) {
        console.error('Error processing received data:', err)
        setError('Error receiving data. File transfer may be incomplete.')
      }
    }
  }, [])

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    })
    pcRef.current = pc

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        console.log('✓ ICE candidate gathering complete')
        resolveIceRef.current?.()
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      setConnectionState(state)
      console.log(`Connection state: ${state}`)

      if (state === 'connected') {
        setError(null)
      } else if (state === 'failed') {
        // Don't show misleading TURN message — just report failure clearly
        setError('Connection failed. Both peers may be behind strict NAT/firewalls. Try on the same network or use a VPN.')
      }
    }

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      console.log(`ICE connection state: ${state}`)
      if (state === 'connected' || state === 'completed') {
        setError(null)
      }
    }

    // NOTE: ondatachannel is intentionally NOT set here.
    // createOffer sets up the channel directly via pc.createDataChannel().
    // createAnswer sets ondatachannel after calling this function,
    // so setting it here would be overwritten anyway and could cause
    // a race condition where setupDataChannel is called twice.

    return pc
  }, [setupDataChannel])

  const waitForIce = () =>
    new Promise((resolve) => {
      let resolved = false
      const done = () => { if (!resolved) { resolved = true; resolve() } }
      resolveIceRef.current = done

      // Check if already complete (can happen when peers are on same network)
      if (pcRef.current?.iceGatheringState === 'complete') {
        done()
        return
      }

      // Timeout: 8s is enough for STUN-only; TURN needs more but we removed bad TURN
      setTimeout(done, 8000)
    })

  const createOffer = useCallback(async () => {
    try {
      setError(null)
      setGenerating(true)
      setConnectionState('connecting')

      const pc = createPeerConnection()

      // Sender creates the data channel
      const dc = pc.createDataChannel('files', {
        ordered: true,
        // Do NOT set maxPacketLifeTime — 0 means "expire immediately" and breaks reliability.
        // Omitting it gives you the default reliable (TCP-like) mode.
      })
      setupDataChannel(dc)

      const offerDesc = await pc.createOffer()
      await pc.setLocalDescription(offerDesc)
      await waitForIce()

      const desc = pc.localDescription
      const code = await encode({ type: desc.type, sdp: desc.sdp })

      setOffer(code)
      setGenerating(false)
      console.log('✓ File transfer offer created')
      return code
    } catch (err) {
      console.error('File transfer offer creation failed:', err)
      setConnectionState('idle')
      setGenerating(false)
      setError('Failed to create file transfer connection. Please try again.')
      throw err
    }
  }, [createPeerConnection, setupDataChannel])

  const createAnswer = useCallback(async (offerCode) => {
    try {
      setError(null)
      setGenerating(true)
      setConnectionState('connecting')

      const pc = createPeerConnection()

      // Receiver waits for the data channel created by the sender
      // Set ondatachannel here (not in createPeerConnection) to avoid duplication
      pc.ondatachannel = (e) => {
        console.log('Received data channel:', e.channel.label)
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
      console.log('✓ File transfer answer created')
      return code
    } catch (err) {
      console.error('File transfer answer creation failed:', err)
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

  const resetConnection = useCallback((preserveError = false) => {
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
    if (!preserveError) setError(null)
    setGenerating(false)
    setSending(null)
    setReceiving(null)
    setChannelOpen(false)
  }, [])

  const isConnectionHealthy = useCallback(() => {
    const pc = pcRef.current
    if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
      return false
    }
    if (!pc.localDescription) return false
    return true
  }, [])

  const disconnect = useCallback(() => {
    resetConnection(false)
  }, [resetConnection])

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

      if (!isConnectionHealthy()) {
        throw new Error('WRONG_CONNECTION_STATE')
      }

      const pc = pcRef.current
      await pc.setRemoteDescription(new RTCSessionDescription(answerDesc))
    } catch (err) {
      console.error('Error accepting answer:', err)
      if (err.message === 'UNEXPECTED_OFFER_CODE') {
        setError('It looks like you pasted the initial code instead of the response code. Paste the response code sent by the other laptop.')
      } else if (err.message === 'NO_PEER_CONNECTION') {
        resetConnection(true)
        setError('Connection was not initialized properly. Start again by creating a new connection code on the first laptop.')
      } else if (err.message === 'WRONG_CONNECTION_STATE') {
        resetConnection(true)
        setError('The response could not be applied because the original offer is no longer active. This can happen if you switched tabs, the browser suspended the page, or took too long to paste the response. Please start again by generating a new offer and response.')
      } else {
        setError(getDecodeError(err, 'response code'))
      }
    }
  }, [isConnectionHealthy, resetConnection])

  const sendFile = useCallback(async (file) => {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') {
      setError('Not connected. Establish connection first.')
      return
    }

    try {
      dc.send(JSON.stringify({
        type: 'file-start',
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
      }))

      setSending({ name: file.name, size: file.size, sent: 0 })
      console.log(`Sending file: ${file.name}`)

      const buffer = await file.arrayBuffer()
      let offset = 0
      let retries = 0
      const maxRetries = 3

      const sendChunk = () => {
        while (offset < buffer.byteLength) {
          if (dc.bufferedAmount > CHUNK_SIZE * 8) {
            console.log(`Buffer full (${dc.bufferedAmount} bytes), waiting...`)
            dc.onbufferedamountlow = () => {
              dc.onbufferedamountlow = null
              sendChunk()
            }
            dc.bufferedAmountLowThreshold = CHUNK_SIZE * 2
            return
          }

          const chunk = buffer.slice(offset, offset + CHUNK_SIZE)

          try {
            dc.send(chunk)
            offset += chunk.byteLength
            retries = 0
            setSending({ name: file.name, size: file.size, sent: offset })
          } catch (err) {
            if (retries < maxRetries && err.message.includes('buffered')) {
              retries++
              console.warn(`Send error (retry ${retries}/${maxRetries}):`, err.message)
              setTimeout(sendChunk, 100 * retries)
              return
            }
            throw err
          }
        }

        dc.send(JSON.stringify({ type: 'file-end' }))
        console.log(`✓ Finished sending: ${file.name}`)
        setSending(null)
      }

      sendChunk()
    } catch (err) {
      console.error('File send error:', err)
      setSending(null)
      setError(`Failed to send file: ${err.message}. Connection may have been interrupted.`)
    }
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) return
      const pc = pcRef.current
      if (pc && offer && !channelOpen) {
        if (pc.signalingState !== 'have-local-offer' || !pc.localDescription) {
          console.warn('Connection became stale while tab was inactive')
          resetConnection(true)
          setError('The connection was lost while the tab was inactive. Please generate a new offer and response to reconnect.')
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [offer, channelOpen, resetConnection])

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