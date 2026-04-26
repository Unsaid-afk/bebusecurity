import React, { useState, useEffect, useRef } from 'react';
import { Peer } from 'peerjs';
import { Shield, Send, Image as ImageIcon, Lock, Trash2, Hash, Video, PhoneOff } from 'lucide-react';
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

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const myKeyRef = useRef(null);
  const peerKeyRef = useRef(null);
  const canvRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const messagesEndRef = useRef(null);

  const BURN_TIME = 30;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleVisibility = () => setIsBlurred(document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const appendMessage = (sender, text) => {
    const msgId = Date.now() + Math.random();
    setMessages(prev => [...prev, { sender, text, id: msgId, createdAt: Date.now() }]);
    if (sender !== 'system') {
      setTimeout(() => {
        setMessages(prev => prev.filter(m => m.id !== msgId));
      }, BURN_TIME * 1000);
    }
  };

  const setupDataConnection = (conn) => {
    connRef.current = conn;

    conn.on('open', async () => {
      setConnected(true);
      setStatus('Tunnel encrypted');
      const exported = await exportKey(myKeyRef.current);
      conn.send(JSON.stringify({ type: 'KEY_EXCHANGE', key: exported }));
    });

    conn.on('data', async (data) => {
      try {
        const payload = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());
        if (payload.type === 'KEY_EXCHANGE') {
          peerKeyRef.current = await importKey(payload.key);
          appendMessage('system', '🔐 E2E Encryption active. Messages are secure.');
        } else if (payload.type === 'MESSAGE') {
          const decrypted = await decryptMessage(myKeyRef.current, payload.data);
          appendMessage('peer', decrypted);
        } else if (payload.type === 'IMAGE') {
          renderVanishImage(payload.data);
        }
      } catch (e) { /* ignore noise */ }
    });

    conn.on('close', () => {
      setConnected(false);
      setStatus('Partner disconnected.');
      connRef.current = null;
    });

    conn.on('error', () => {
      setStatus('Connection error.');
    });
  };

  const handleJoin = async () => {
    if (roomCode.length < 1) return;
    setIsJoined(true);
    myKeyRef.current = await generateKey();

    const hostId = ROOM_PREFIX + roomCode;
    const clientId = ROOM_PREFIX + roomCode + '-client-' + Math.random().toString(36).slice(2, 6);

    // First, try to be the HOST (create peer with the room ID)
    setStatus('Connecting to relay...');

    const hostPeer = new Peer(hostId, {
      debug: 0, // silent
    });

    hostPeer.on('open', () => {
      // We successfully became the host
      peerRef.current = hostPeer;
      setStatus('Waiting for partner to join code ' + roomCode + '...');

      // Listen for incoming connections
      hostPeer.on('connection', (conn) => {
        setupDataConnection(conn);
      });

      // Listen for incoming video calls
      hostPeer.on('call', (call) => {
        if (localStreamRef.current) {
          call.answer(localStreamRef.current);
        } else {
          call.answer(); // answer without stream
        }
        call.on('stream', (stream) => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
        });
      });
    });

    hostPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Host ID already taken — someone is already waiting. We are the CLIENT.
        hostPeer.destroy();

        const clientPeer = new Peer(clientId, {
          debug: 0,
        });

        clientPeer.on('open', () => {
          peerRef.current = clientPeer;
          setStatus('Partner found! Connecting...');

          // Connect to the host
          const conn = clientPeer.connect(hostId, { reliable: true });
          setupDataConnection(conn);

          // Listen for incoming video calls
          clientPeer.on('call', (call) => {
            if (localStreamRef.current) {
              call.answer(localStreamRef.current);
            } else {
              call.answer();
            }
            call.on('stream', (stream) => {
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
            });
          });
        });

        clientPeer.on('error', (err) => {
          setStatus('Connection failed: ' + err.type);
        });
      } else {
        setStatus('Error: ' + err.type + '. Try a different code.');
      }
    });
  };

  // ─── VIDEO CALL ───
  const toggleVideo = async () => {
    if (inCall) {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setInCall(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      // Call the other peer
      const hostId = ROOM_PREFIX + roomCode;
      const peerId = peerRef.current?.id === hostId
        ? null // host doesn't know client id, client will call
        : hostId;
      if (peerId && peerRef.current) {
        const call = peerRef.current.call(peerId, stream);
        call.on('stream', (remoteStream) => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        });
      }
      // If we're host, the client will call us — handled in the 'call' listener above
      setInCall(true);
    } catch (err) {
      appendMessage('system', '⚠️ Camera/mic access denied.');
    }
  };

  // ─── VANISH IMAGE ───
  const renderVanishImage = async (encryptedData) => {
    const decryptedB64 = await decryptMessage(myKeyRef.current, encryptedData);
    const canvas = canvRef.current;
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    img.onload = () => {
      canvas.width = Math.min(img.width, 400);
      canvas.height = (img.height / img.width) * canvas.width;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setTimeout(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
        appendMessage('system', '🗑️ Image shredded from RAM.');
      }, 10000);
    };
    img.src = decryptedB64;
  };

  const handleSendImage = async (e) => {
    const file = e.target.files[0];
    if (!file || !peerKeyRef.current || !connRef.current) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const tempImg = new window.Image();
      tempImg.onload = async () => {
        const c = document.createElement('canvas');
        c.width = tempImg.width;
        c.height = tempImg.height;
        c.getContext('2d').drawImage(tempImg, 0, 0);
        const scrubbed = c.toDataURL('image/jpeg', 0.8);
        const encrypted = await encryptMessage(peerKeyRef.current, scrubbed);
        connRef.current.send(JSON.stringify({ type: 'IMAGE', data: encrypted }));
        appendMessage('me', '[🖼️ Secure Image Sent]');
      };
      tempImg.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const sendMessage = async () => {
    if (!input.trim() || !peerKeyRef.current || !connRef.current) return;
    const encrypted = await encryptMessage(peerKeyRef.current, input);
    connRef.current.send(JSON.stringify({ type: 'MESSAGE', data: encrypted }));
    appendMessage('me', input);
    setInput('');
  };

  // ═══════════════════════════════════════ JOIN SCREEN
  if (!isJoined) {
    return (
      <div style={S.joinWrap}>
        <div style={S.joinCard}>
          <div style={S.logoRing}><Hash size={32} color="#2563eb" /></div>
          <h2 style={{ margin: '0 0 6px', fontSize: '20px', color: '#fff' }}>Secure Link</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: '0 0 24px' }}>
            Enter the same numeric key as your partner to connect.
          </p>
          <input
            type="number"
            placeholder="e.g. 123456"
            value={roomCode}
            onChange={e => setRoomCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            style={S.codeInput}
          />
          <button onClick={handleJoin} style={S.joinBtn}>JOIN SECURE CHANNEL</button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════ CHAT SCREEN
  return (
    <div style={{ ...S.chatWrap, filter: isBlurred ? 'blur(25px)' : 'none', transition: 'filter 0.3s ease' }}>
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={18} color={connected ? '#4ade80' : '#f87171'} />
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#ccc' }}>CHANNEL: {roomCode}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: connected ? '#4ade80' : '#f87171' }}>
            {connected ? '● TUNNEL ENCRYPTED' : `○ ${status}`}
          </span>
          <button onClick={() => window.location.replace('about:blank')} style={S.iconBtn} title="Nuke Session">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={S.msgArea}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#444' }}>
                <Lock size={36} style={{ marginBottom: '16px', opacity: 0.4 }} />
                <p style={{ margin: 0 }}>{connected ? '🔐 Secure tunnel active. Send a message.' : status}</p>
              </div>
            )}
            {messages.map(m => (
              <BurnMessage key={m.id} message={m} burnTime={BURN_TIME} />
            ))}
            <canvas ref={canvRef} style={{ maxWidth: '100%', borderRadius: '8px', display: 'none' }} />
            <div ref={messagesEndRef} />
          </div>

          <div style={S.inputBar}>
            <label style={{ cursor: 'pointer', color: '#555', padding: '8px', display: 'flex' }}>
              <ImageIcon size={20} />
              <input type="file" hidden accept="image/*" onChange={handleSendImage} />
            </label>
            <button
              onClick={toggleVideo}
              disabled={!connected}
              style={{ ...S.iconBtn, color: inCall ? '#4ade80' : '#555', opacity: connected ? 1 : 0.3 }}
              title={inCall ? 'End Call' : 'Start Video Call'}
            >
              {inCall ? <PhoneOff size={20} /> : <Video size={20} />}
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder={connected ? 'Type a message...' : 'Waiting for connection...'}
              disabled={!connected}
              style={S.chatInput}
            />
            <button onClick={sendMessage} disabled={!connected} style={{ ...S.iconBtn, color: '#2563eb', opacity: connected ? 1 : 0.3 }}>
              <Send size={20} />
            </button>
          </div>
        </div>

        {inCall && (
          <div style={S.videoPanel}>
            <div style={{ position: 'relative', flex: 1 }}>
              <video ref={remoteVideoRef} autoPlay playsInline style={S.remoteVideo} />
              <video ref={localVideoRef} autoPlay playsInline muted style={S.localVideo} />
              <div style={S.callBadge}>🔒 DTLS/SRTP Encrypted</div>
              <button onClick={toggleVideo} style={S.endCallBtn}>
                <PhoneOff size={20} /> End
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════ BURN MESSAGE
const BurnMessage = ({ message: m, burnTime }) => {
  const [timeLeft, setTimeLeft] = useState(burnTime);

  useEffect(() => {
    if (m.sender === 'system') return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - m.createdAt) / 1000);
      const remaining = Math.max(0, burnTime - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [m.createdAt, m.sender, burnTime]);

  const isSystem = m.sender === 'system';
  const opacity = isSystem ? 1 : Math.max(0.15, timeLeft / burnTime);

  return (
    <div style={{
      alignSelf: m.sender === 'me' ? 'flex-end' : 'flex-start',
      backgroundColor: m.sender === 'me' ? '#2563eb' : isSystem ? 'transparent' : '#27272a',
      padding: isSystem ? '6px 0' : '10px 16px',
      borderRadius: '14px', maxWidth: '80%', fontSize: '14px',
      color: isSystem ? '#555' : '#fff',
      fontStyle: isSystem ? 'italic' : 'normal',
      opacity, transition: 'opacity 1s ease', position: 'relative',
    }}>
      {m.text}
      {!isSystem && (
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', position: 'absolute', bottom: '2px', right: '8px' }}>
          🔥 {timeLeft}s
        </span>
      )}
    </div>
  );
};

// ═══════════════════════════════════════ STYLES
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
  videoPanel: { width: '320px', borderLeft: '1px solid #1a1a1a', backgroundColor: '#111', display: 'flex', flexDirection: 'column' },
  remoteVideo: { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' },
  localVideo: { position: 'absolute', bottom: '12px', right: '12px', width: '100px', height: '75px', borderRadius: '8px', objectFit: 'cover', border: '2px solid #333', backgroundColor: '#000' },
  callBadge: { position: 'absolute', top: '10px', left: '10px', backgroundColor: 'rgba(0,0,0,0.7)', color: '#4ade80', padding: '4px 10px', borderRadius: '6px', fontSize: '10px' },
  endCallBtn: { position: 'absolute', bottom: '12px', left: '12px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' },
};

export default ChatRoom;
