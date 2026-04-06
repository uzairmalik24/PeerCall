# PeerCall

Free peer-to-peer video and audio calling directly in the browser. No backend, no accounts, no downloads. Two people exchange short codes and connect via WebRTC.

**Live:** Deployed on Vercel

## Tech Stack

- React 19 + Vite 8
- WebRTC (native browser API)
- GSAP + ScrollTrigger (animations)
- Lenis (smooth scrolling)
- Lucide React (icons)
- React Router (SPA routing)
- React Helmet Async (SEO meta tags)

## How It Works

PeerCall replaces the signaling server entirely. In a typical WebRTC app, a server exchanges connection details (SDP offers/answers and ICE candidates) between two peers. PeerCall makes the **users themselves** act as the signaling channel — they copy-paste codes through any messaging app.

### Connection Flow

```
Person A (Caller)                    Person B (Receiver)
      |                                      |
      |  1. Creates RTCPeerConnection        |
      |  2. Adds local media tracks          |
      |  3. Creates SDP offer                |
      |  4. Sets offer as localDescription   |
      |  5. Gathers ICE candidates           |
      |  6. Encodes offer → compressed code  |
      |                                      |
      |  -------- sends code via chat -----> |
      |                                      |
      |                 7. Decodes code → SDP offer
      |                 8. Creates RTCPeerConnection
      |                 9. Sets offer as remoteDescription
      |                10. Adds local media tracks
      |                11. Creates SDP answer
      |                12. Sets answer as localDescription
      |                13. Gathers ICE candidates
      |                14. Encodes answer → compressed code
      |                                      |
      | <------- sends code via chat ------  |
      |                                      |
      | 15. Decodes code → SDP answer        |
      | 16. Sets answer as remoteDescription |
      |                                      |
      |  ===== P2P connection established ===|
      |  Audio/video flows directly between  |
      |  browsers. No server involved.       |
```

### SDP Minification

A raw SDP (Session Description Protocol) for a video call is ~5-7KB because browsers advertise every supported codec (VP8, VP9, H.264 x6 profiles, H.265, AV1, opus, G722, PCMU, PCMA, etc.). PeerCall strips it down:

1. **Codec stripping** — Parses the SDP to find the payload type numbers for opus (audio) and VP8 + RTX (video), then removes all other codec lines. This drops ~130 lines and ~80% of the raw SDP.
2. **TCP candidate removal** — Drops TCP ICE candidates since they almost never establish a connection in practice.
3. **Deflate compression** — The stripped SDP is compressed using the browser's native `CompressionStream` API.
4. **Base64 encoding** — The compressed bytes are encoded as base64 for safe text transfer.

Result: **~800-1000 characters** instead of ~7500.

### NAT Traversal

PeerCall uses Google's free STUN servers (`stun.l.google.com:19302`) for NAT traversal. When a browser is behind a router, the STUN server tells it its public-facing IP and port. This is embedded in the ICE candidates within the SDP.

No TURN server is used. If both peers are behind strict symmetric NATs, a direct connection cannot be established.

## Project Structure

```
src/
  hooks/
    useWebRTC.js    — WebRTC connection logic, SDP minification, encoding
    useLenis.js     — Lenis smooth scroll + GSAP ticker integration
  pages/
    Home.jsx/css    — Landing page with scroll animations, guide, FAQ
    Call.jsx/css    — Call interface with signaling UI
  components/
    Logo.jsx        — SVG logo component
  App.jsx           — React Router setup
  main.jsx          — Entry point with HelmetProvider + BrowserRouter
  index.css         — Global styles and CSS variables
```

## Run Locally

```bash
npm install
npm run dev
```

Requires HTTPS or localhost for `getUserMedia` (camera/mic access).

## Deploy

```bash
npm run build
```

The `vercel.json` handles SPA routing (rewrites all paths to `/index.html`).

---

## Interview Questions

### WebRTC Fundamentals

**Q: What is WebRTC and what problem does it solve?**
WebRTC (Web Real-Time Communication) is a browser API that enables peer-to-peer audio, video, and data transfer without plugins or servers relaying the media. It solves the problem of real-time communication by allowing browsers to talk directly to each other, reducing latency and eliminating server bandwidth costs.

**Q: What are the three main APIs that WebRTC provides?**
1. `RTCPeerConnection` — manages the peer-to-peer connection, ICE negotiation, and media streaming
2. `MediaStream` / `getUserMedia` — captures audio/video from the user's camera and microphone
3. `RTCDataChannel` — enables arbitrary peer-to-peer data transfer (not used in this project)

**Q: What is an SDP offer and answer? Why do we need both?**
SDP (Session Description Protocol) describes a peer's media capabilities — what codecs it supports, what media types it wants to send/receive, its network addresses, and encryption fingerprints. The **offer** is created by the caller describing what they can do. The **answer** is created by the receiver, selecting the compatible subset. Both are needed because WebRTC uses an offer/answer model — the two peers must agree on codecs, encryption, and transport before media can flow. This is the same negotiation model used by SIP in traditional telephony.

**Q: What happens if the two browsers support different codecs?**
The answerer's browser picks from the codecs listed in the offer. If there's no overlap, the media section fails. In practice, all modern browsers support opus for audio and VP8 for video, so this doesn't happen. PeerCall strips the SDP to only offer opus + VP8, which are universally supported.

### Signaling

**Q: What is signaling in WebRTC and why is it needed?**
Signaling is the process of exchanging connection metadata (SDP offers/answers and ICE candidates) between two peers before the actual P2P connection is established. WebRTC doesn't define how signaling happens — it could be a WebSocket server, HTTP polling, or even copy-pasting codes manually like PeerCall does. It's needed because two browsers can't find each other on the internet without first exchanging their network addresses and media capabilities.

**Q: Why does PeerCall not use a signaling server?**
To be truly serverless. Most WebRTC apps use a signaling server (often WebSocket) to relay the SDP exchange. PeerCall replaces that server with the users themselves — they copy-paste the encoded SDP through any external channel (WhatsApp, email, etc.). This means zero backend infrastructure, zero server costs, and no third party ever sees who's calling whom.

**Q: Why do we need TWO codes (offer AND answer)? Why can't Person A just share one code and Person B clicks "connect"?**
Because WebRTC requires a two-way handshake. The offer contains Person A's network addresses, codecs, and encryption keys. Person B's browser needs to respond with its OWN network addresses, codecs, and encryption keys in the answer. Without the answer, Person A doesn't know how to reach Person B or which encryption parameters to use. It's like a phone call — one person dials (offer), the other picks up (answer). Both sides need to know each other's address.

**Q: Why does Person A need Person B's response code back?**
Person A has already set their local SDP (the offer) and is waiting. Person B's response code contains: (1) Person B's ICE candidates (IP addresses and ports where B can be reached), (2) Person B's DTLS fingerprint (for encryption), and (3) the codec selection B chose from A's offer. Without this, A's `RTCPeerConnection` can't complete the handshake — it has no idea where to send media or how to encrypt it.

### ICE and NAT Traversal

**Q: What is ICE and why is it needed?**
ICE (Interactive Connectivity Establishment) is the protocol WebRTC uses to find the best network path between two peers. It's needed because most devices are behind NATs (routers that hide internal IPs). ICE gathers multiple candidate addresses (local IP, public IP via STUN, relay via TURN) and systematically tries them to find a working path.

**Q: What's the difference between STUN and TURN servers?**
- **STUN** (Session Traversal Utilities for NAT) — a lightweight server that tells your browser its public IP and port. It's only used during connection setup, not during the call. Free to run, minimal bandwidth.
- **TURN** (Traversal Using Relays around NAT) — a relay server that forwards all media when direct P2P fails (e.g., both peers behind symmetric NATs). Expensive because all audio/video flows through it. PeerCall doesn't use TURN.

**Q: What are the different types of ICE candidates?**
1. **host** — the device's local/private IP (e.g., `192.168.1.5:55924`). Works when both peers are on the same LAN.
2. **srflx** (server reflexive) — the public IP discovered via STUN. Works when at least one peer has a non-symmetric NAT.
3. **relay** — a TURN server address. Works in all cases but adds latency. PeerCall doesn't generate these since no TURN is configured.

**Q: Why does PeerCall wait for ICE gathering to complete before generating the code?**
PeerCall uses "ICE gathering complete" signaling — it waits until `onicecandidate` fires with a `null` candidate, meaning all candidates have been discovered. Only then is the SDP encoded. This bundles all candidates into the code so the receiver gets everything in one paste. The alternative (trickle ICE) would send candidates one by one, requiring a persistent signaling channel.

### Security and Encryption

**Q: How is the call encrypted?**
WebRTC mandates DTLS-SRTP encryption. DTLS (Datagram Transport Layer Security) is used to negotiate encryption keys during connection setup. SRTP (Secure Real-time Transport Protocol) encrypts the actual audio/video packets. The encryption is end-to-end between the two browsers — not even the STUN server can decrypt it. The DTLS fingerprint in the SDP allows each peer to verify the other's identity.

**Q: Is the connection code itself sensitive?**
Yes, to some extent. It contains the peer's ICE candidates (IP addresses) and DTLS fingerprint. An attacker with the code could potentially learn the peer's public IP. However, the code is single-use and session-specific — it can't be reused for a different call or replayed later. The actual media encryption keys are negotiated separately via DTLS after the connection is established.

### SDP Minification

**Q: Why is the SDP so large and how does PeerCall reduce it?**
A Chrome video call SDP lists ~30 codec options (VP8, VP9, H264 in 6 profiles, H265, AV1, etc.) with their parameters, feedback mechanisms, and RTX retransmission mappings. Each codec adds 3-6 lines. PeerCall's `minifySdp()` function:
1. Scans the SDP to find the payload type numbers for opus and VP8 (these vary between browsers)
2. Rewrites the `m=` lines to list only those payload types
3. Drops all `a=rtpmap`, `a=fmtp`, and `a=rtcp-fb` lines for other codecs
4. Removes TCP candidates

This is safe because opus and VP8 are universally supported across all browsers. The stripped SDP is still a valid SDP — just with fewer codec options.

**Q: Why use CompressionStream instead of a JS compression library?**
`CompressionStream` is a native browser API (supported in all modern browsers) that implements deflate/gzip compression with zero bundle size cost. A JS library like pako would add ~25KB to the bundle for the same result. Since PeerCall targets modern browsers (required for WebRTC anyway), native compression is the right choice.

### Architecture Decisions

**Q: What are the limitations of this serverless approach?**
1. **No group calls** — P2P requires a full mesh for groups, and signaling gets exponentially complex without a server
2. **No call history or persistence** — no server means no state storage
3. **Manual code exchange** — less convenient than auto-discovery via a server
4. **No TURN fallback** — if both peers are behind symmetric NATs, the call fails
5. **Both peers must be online simultaneously** — there's no server to queue the offer

**Q: Why does PeerCall use `RTCSessionDescription` explicitly when setting remote descriptions?**
Browser implementations differ. Some accept a plain `{ type, sdp }` object directly in `setRemoteDescription()`, while others (especially older Safari versions) require a formal `RTCSessionDescription` instance. Wrapping it explicitly ensures cross-browser compatibility.

**Q: Why gather all ICE candidates before encoding instead of using trickle ICE?**
Trickle ICE sends candidates as they're discovered, which requires a persistent two-way signaling channel (WebSocket, etc.). Since PeerCall uses copy-paste as the signaling channel, it needs to bundle everything into a single code. Waiting for ICE gathering to complete (`onicecandidate` with `null`) ensures all candidates are in the SDP before encoding.
