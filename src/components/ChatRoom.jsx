import React, { useState, useEffect, useRef } from 'react';
import { Peer } from 'peerjs';
import {
  Shield, Send, Image as ImageIcon, Lock, Trash2, Hash,
  Video, Mic, MicOff, PhoneOff, Maximize, Minimize,
  Camera, CameraOff
} from 'lucide-react';
import { generateKey, encryptMessage, decryptMessage, exportKey, importKey } from '../utils/crypto';

const ROOM_PREFIX = 'bebu-secure-';

const ChatRoom = () => {
  const [roomCode, setRoomCode] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [status, setStatus] = useState('Enter a code to join');

  const [inCall, setInCall] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const myKeyRef = useRef(null);
  const peerKeyRef = useRef(null);
  const canvRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const messagesEndRef = useRef(null);
  const videoContainerRef = useRef(null);
  const callTimerRef = useRef(null);
  const activeCallRef = useRef(null);

  const BURN_TIME = 30;

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Visual privacy
  useEffect(() => {
    const h = () => setIsBlurred(document.hidden);
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);

  // Call timer
  useEffect(() => {
    if (inCall && hasRemoteStream) {
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      clearInterval(callTimerRef.current);
      if (!inCall) setCallDuration(0);
    }
    return () => clearInterval(callTimerRef.current);
  }, [inCall, hasRemoteStream]);

  // Fullscreen exit listener
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const fmt = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${m}:${String(sec).padStart(2,'0')}`;
  };

  const appendMessage = (sender, text) => {
    const id = Date.now() + Math.random();
    setMessages(prev => [...prev, { sender, text, id, createdAt: Date.now() }]);
    if (sender !== 'system') setTimeout(() => setMessages(p => p.filter(m => m.id !== id)), BURN_TIME * 1000);
  };

  // ─── Data Channel ───
  const setupDataConnection = (conn) => {
    connRef.current = conn;
    conn.on('open', async () => {
      setConnected(true);
      setStatus('Tunnel encrypted');
      const exp = await exportKey(myKeyRef.current);
      conn.send(JSON.stringify({ type: 'KEY_EXCHANGE', key: exp }));
    });
    conn.on('data', async (data) => {
      try {
        const p = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());
        if (p.type === 'KEY_EXCHANGE') { peerKeyRef.current = await importKey(p.key); appendMessage('system', '🔐 E2E Encryption active.'); }
        else if (p.type === 'MESSAGE') { appendMessage('peer', await decryptMessage(myKeyRef.current, p.data)); }
        else if (p.type === 'IMAGE') { renderVanishImage(p.data); }
      } catch (e) {}
    });
    conn.on('close', () => { setConnected(false); setStatus('Partner disconnected.'); connRef.current = null; endCall(); });
    conn.on('error', () => setStatus('Connection error.'));
  };

  // ─── Incoming Call Handler ───
  const handleIncomingCall = (call) => {
    activeCallRef.current = call;
    // Get our camera to answer with
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      call.answer(stream);
      setInCall(true);
      setIsMuted(false);
      setIsCamOff(false);
    }).catch(() => {
      call.answer();
      setInCall(true);
    });
    call.on('stream', (stream) => {
      setHasRemoteStream(true);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
    });
    call.on('close', () => endCall());
  };

  // ─── Join Room ───
  const handleJoin = async () => {
    if (roomCode.length < 1) return;
    setIsJoined(true);
    myKeyRef.current = await generateKey();
    const hostId = ROOM_PREFIX + roomCode;
    const clientId = ROOM_PREFIX + roomCode + '-c-' + Math.random().toString(36).slice(2, 6);
    setStatus('Connecting to relay...');

    const hostPeer = new Peer(hostId, { debug: 0 });
    hostPeer.on('open', () => {
      peerRef.current = hostPeer;
      setStatus('Waiting for partner to join code ' + roomCode + '...');
      hostPeer.on('connection', conn => setupDataConnection(conn));
      hostPeer.on('call', call => handleIncomingCall(call));
    });
    hostPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        hostPeer.destroy();
        const clientPeer = new Peer(clientId, { debug: 0 });
        clientPeer.on('open', () => {
          peerRef.current = clientPeer;
          setStatus('Partner found! Connecting...');
          setupDataConnection(clientPeer.connect(hostId, { reliable: true }));
          clientPeer.on('call', call => handleIncomingCall(call));
        });
        clientPeer.on('error', e => setStatus('Error: ' + e.type));
      } else {
        setStatus('Error: ' + err.type);
      }
    });
  };

  // ─── Video Call Controls ───
  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const hostId = ROOM_PREFIX + roomCode;
      const targetId = peerRef.current?.id === hostId ? null : hostId;
      if (targetId && peerRef.current) {
        const call = peerRef.current.call(targetId, stream);
        activeCallRef.current = call;
        call.on('stream', (rs) => { setHasRemoteStream(true); if (remoteVideoRef.current) remoteVideoRef.current.srcObject = rs; });
        call.on('close', () => endCall());
      }
      setInCall(true);
      setIsMuted(false);
      setIsCamOff(false);
    } catch { appendMessage('system', '⚠️ Camera/mic access denied.'); }
  };

  const endCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    activeCallRef.current?.close();
    activeCallRef.current = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setInCall(false);
    setHasRemoteStream(false);
    setIsFullscreen(false);
    setIsMuted(false);
    setIsCamOff(false);
  };

  const toggleMic = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); }
  };

  const toggleCam = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsCamOff(!t.enabled); }
  };

  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      try { await videoContainerRef.current?.requestFullscreen(); setIsFullscreen(true); } catch {}
    } else {
      try { await document.exitFullscreen(); } catch {}
      setIsFullscreen(false);
    }
  };

  // ─── Image ───
  const renderVanishImage = async (enc) => {
    const b64 = await decryptMessage(myKeyRef.current, enc);
    const canvas = canvRef.current; if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    img.onload = () => {
      canvas.width = Math.min(img.width, 400);
      canvas.height = (img.height / img.width) * canvas.width;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setTimeout(() => { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none'; appendMessage('system', '🗑️ Image shredded.'); }, 10000);
    };
    img.src = b64;
  };

  const handleSendImage = async (e) => {
    const f = e.target.files[0]; if (!f || !peerKeyRef.current || !connRef.current) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const ti = new window.Image();
      ti.onload = async () => {
        const c = document.createElement('canvas'); c.width = ti.width; c.height = ti.height;
        c.getContext('2d').drawImage(ti, 0, 0);
        const enc = await encryptMessage(peerKeyRef.current, c.toDataURL('image/jpeg', 0.8));
        connRef.current.send(JSON.stringify({ type: 'IMAGE', data: enc }));
        appendMessage('me', '[🖼️ Secure Image Sent]');
      };
      ti.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  };

  const sendMessage = async () => {
    if (!input.trim() || !peerKeyRef.current || !connRef.current) return;
    connRef.current.send(JSON.stringify({ type: 'MESSAGE', data: await encryptMessage(peerKeyRef.current, input) }));
    appendMessage('me', input);
    setInput('');
  };

  // ═══════════════════════════════════════
  //  JOIN SCREEN
  // ═══════════════════════════════════════
  if (!isJoined) {
    return (
      <div style={S.joinWrap}>
        <div style={S.joinCard}>
          <div style={S.logoRing}><Hash size={32} color="#2563eb" /></div>
          <h2 style={{ margin: '0 0 6px', fontSize: '20px', color: '#fff' }}>Secure Link</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: '0 0 24px' }}>Enter the same numeric key as your partner.</p>
          <input type="number" placeholder="e.g. 123456" value={roomCode} onChange={e => setRoomCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJoin()} style={S.codeInput} />
          <button onClick={handleJoin} style={S.joinBtn}>JOIN SECURE CHANNEL</button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  //  MAIN SCREEN (Chat + Video)
  // ═══════════════════════════════════════
  return (
    <div style={{ ...S.chatWrap, filter: isBlurred ? 'blur(25px)' : 'none', transition: 'filter 0.3s ease' }}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={18} color={connected ? '#4ade80' : '#f87171'} />
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#ccc' }}>CHANNEL: {roomCode}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: connected ? '#4ade80' : '#f87171' }}>
            {connected ? '● TUNNEL ENCRYPTED' : `○ ${status}`}
          </span>
          <button onClick={() => window.location.replace('about:blank')} style={S.iconBtn} title="Nuke"><Trash2 size={15} /></button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Chat Column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', display: isFullscreen ? 'none' : 'flex' }}>
          <div style={S.msgArea}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#444' }}>
                <Lock size={36} style={{ marginBottom: '16px', opacity: 0.4 }} />
                <p style={{ margin: 0 }}>{connected ? '🔐 Secure tunnel active. Send a message.' : status}</p>
              </div>
            )}
            {messages.map(m => <BurnMessage key={m.id} message={m} burnTime={BURN_TIME} />)}
            <canvas ref={canvRef} style={{ maxWidth: '100%', borderRadius: '8px', display: 'none' }} />
            <div ref={messagesEndRef} />
          </div>
          <div style={S.inputBar}>
            <label style={{ cursor: 'pointer', color: '#555', padding: '8px', display: 'flex' }}>
              <ImageIcon size={20} /><input type="file" hidden accept="image/*" onChange={handleSendImage} />
            </label>
            <button onClick={inCall ? endCall : startCall} disabled={!connected}
              style={{ ...S.iconBtn, color: inCall ? '#ef4444' : '#4ade80', opacity: connected ? 1 : 0.3 }}
              title={inCall ? 'End Call' : 'Video Call'}>
              {inCall ? <PhoneOff size={20} /> : <Video size={20} />}
            </button>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder={connected ? 'Type a message...' : 'Waiting...'} disabled={!connected} style={S.chatInput} />
            <button onClick={sendMessage} disabled={!connected} style={{ ...S.iconBtn, color: '#2563eb', opacity: connected ? 1 : 0.3 }}>
              <Send size={20} />
            </button>
          </div>
        </div>

        {/* ═══ VIDEO PANEL — ONE instance, styles change for fullscreen ═══ */}
        {inCall && (
          <div
            ref={videoContainerRef}
            style={isFullscreen ? S.videoFull : S.videoSide}
          >
            {/* Remote video */}
            <div style={{ flex: 1, position: 'relative', backgroundColor: '#000', borderRadius: isFullscreen ? '0' : '12px', overflow: 'hidden', margin: isFullscreen ? '0' : '8px' }}>
              <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

              {!hasRemoteStream && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', flexDirection: 'column', gap: '10px' }}>
                  <Phone size={32} />
                  <p style={{ margin: 0 }}>Calling partner...</p>
                </div>
              )}

              {/* Local PiP */}
              <video ref={localVideoRef} autoPlay playsInline muted
                style={{
                  position: 'absolute',
                  bottom: isFullscreen ? '100px' : '10px',
                  right: isFullscreen ? '24px' : '10px',
                  width: isFullscreen ? '200px' : '120px',
                  height: isFullscreen ? '150px' : '90px',
                  borderRadius: '12px', objectFit: 'cover',
                  border: '2px solid rgba(255,255,255,0.2)',
                  backgroundColor: '#111', zIndex: 2,
                }}
              />

              {/* Badge */}
              <div style={{
                position: 'absolute', top: isFullscreen ? '20px' : '10px', left: isFullscreen ? '20px' : '10px',
                backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                color: '#4ade80', padding: isFullscreen ? '8px 16px' : '5px 12px',
                borderRadius: '10px', fontSize: isFullscreen ? '13px' : '11px',
                display: 'flex', alignItems: 'center', gap: '6px', zIndex: 2,
              }}>
                <Shield size={isFullscreen ? 14 : 12} color="#4ade80" />
                <span>Encrypted</span>
                <span style={{ marginLeft: '8px', color: '#aaa' }}>⏱ {fmt(callDuration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div style={{
              display: 'flex', gap: isFullscreen ? '12px' : '6px',
              padding: isFullscreen ? '16px' : '8px',
              justifyContent: 'center',
              ...(isFullscreen ? {
                position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)',
                borderRadius: '20px', padding: '14px 24px', zIndex: 3,
              } : {}),
            }}>
              <button onClick={toggleMic} style={{
                ...S.ctrlBtn,
                backgroundColor: isMuted ? '#ef4444' : '#27272a',
                ...(isFullscreen ? { width: '52px', height: '52px', borderRadius: '50%' } : {}),
              }}>
                {isMuted ? <MicOff size={isFullscreen ? 22 : 18} /> : <Mic size={isFullscreen ? 22 : 18} />}
              </button>
              <button onClick={toggleCam} style={{
                ...S.ctrlBtn,
                backgroundColor: isCamOff ? '#ef4444' : '#27272a',
                ...(isFullscreen ? { width: '52px', height: '52px', borderRadius: '50%' } : {}),
              }}>
                {isCamOff ? <CameraOff size={isFullscreen ? 22 : 18} /> : <Camera size={isFullscreen ? 22 : 18} />}
              </button>
              <button onClick={endCall} style={{
                ...S.ctrlBtn, backgroundColor: '#ef4444', flex: isFullscreen ? 'none' : 1,
                ...(isFullscreen ? { width: '64px', height: '52px', borderRadius: '50%' } : {}),
              }}>
                <PhoneOff size={isFullscreen ? 24 : 18} />
              </button>
              <button onClick={toggleFullscreen} style={{
                ...S.ctrlBtn, backgroundColor: '#27272a',
                ...(isFullscreen ? { width: '52px', height: '52px', borderRadius: '50%' } : {}),
              }}>
                {isFullscreen ? <Minimize size={isFullscreen ? 22 : 18} /> : <Maximize size={isFullscreen ? 22 : 18} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════
//  BURN MESSAGE
// ═══════════════════════════════════════
const BurnMessage = ({ message: m, burnTime }) => {
  const [tl, setTl] = useState(burnTime);
  useEffect(() => {
    if (m.sender === 'system') return;
    const i = setInterval(() => {
      const r = Math.max(0, burnTime - Math.floor((Date.now() - m.createdAt) / 1000));
      setTl(r); if (r <= 0) clearInterval(i);
    }, 1000);
    return () => clearInterval(i);
  }, [m.createdAt, m.sender, burnTime]);
  const sys = m.sender === 'system';
  return (
    <div style={{
      alignSelf: m.sender === 'me' ? 'flex-end' : 'flex-start',
      backgroundColor: m.sender === 'me' ? '#2563eb' : sys ? 'transparent' : '#27272a',
      padding: sys ? '6px 0' : '10px 16px', borderRadius: '14px', maxWidth: '80%', fontSize: '14px',
      color: sys ? '#555' : '#fff', fontStyle: sys ? 'italic' : 'normal',
      opacity: sys ? 1 : Math.max(0.15, tl / burnTime),
      transition: 'opacity 1s ease', position: 'relative',
    }}>
      {m.text}
      {!sys && <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', position: 'absolute', bottom: '2px', right: '8px' }}>🔥 {tl}s</span>}
    </div>
  );
};

// ═══════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════
const S = {
  joinWrap: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' },
  joinCard: { width: '340px', padding: '36px', backgroundColor: '#141414', borderRadius: '20px', textAlign: 'center', border: '1px solid #222' },
  logoRing: { width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' },
  codeInput: { width: '100%', padding: '14px', backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '10px', color: '#fff', textAlign: 'center', fontSize: '20px', letterSpacing: '6px', marginBottom: '16px', outline: 'none', boxSizing: 'border-box' },
  joinBtn: { width: '100%', padding: '14px', backgroundColor: '#2563eb', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: '700', cursor: 'pointer', fontSize: '14px', letterSpacing: '1px' },
  chatWrap: { height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a', color: '#e0e0e0' },
  header: { padding: '12px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  msgArea: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' },
  inputBar: { display: 'flex', gap: '8px', alignItems: 'center', padding: '12px 16px', backgroundColor: '#141414', borderTop: '1px solid #1a1a1a' },
  chatInput: { flex: 1, background: 'none', border: 'none', color: '#fff', outline: 'none', fontSize: '14px' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', color: '#555' },
  // Video side panel
  videoSide: { width: '340px', borderLeft: '1px solid #1a1a1a', backgroundColor: '#0a0a0a', display: 'flex', flexDirection: 'column' },
  // Video fullscreen — fills entire viewport
  videoFull: { position: 'fixed', inset: 0, backgroundColor: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column' },
  ctrlBtn: { border: 'none', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};

export default ChatRoom;
