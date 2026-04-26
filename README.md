# BebuSecurity — Stateless Stealth Communication Node

A zero-trace, peer-to-peer encrypted communication platform. No databases, no logs, no persistence. All data lives exclusively in RAM.

## Features
- 🔐 **AES-GCM 256-bit E2EE** via Web Crypto API
- 📹 **Encrypted Video Calls** via WebRTC (DTLS/SRTP)
- 🖼️ **Vanish Images** — EXIF stripped, canvas-rendered, auto-shredded in 10s
- 🎭 **Dual-UI Camouflage** — looks like a Google ToS page until you type `BEBU`
- 🔗 **Numeric Room Sync** — enter the same code as your partner to connect
- 👁️ **Visual Privacy** — auto-blur when you switch tabs
- 🗑️ **Nuke Button** — wipes RAM and redirects to `about:blank`

## Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Start the signaling relay
node server.cjs

# 3. Start the frontend
npm run dev
```

## How to Use
1. Open `http://localhost:5173` in **Incognito mode**
2. Type **BEBU** to unlock the hidden interface
3. Enter a numeric code and click **Join**
4. Tell your partner the same code — they join too
5. Chat, send images, or start a video call

## Architecture
- **Frontend**: React (Vite) — deployed on Vercel
- **Signaling**: Minimal Node.js Socket.io relay — no logs, no storage
- **P2P**: WebRTC via simple-peer — media never touches a server
- **Encryption**: Web Crypto API — keys generated per-session, exchanged via P2P data channel
