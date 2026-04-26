import React, { useState, useEffect } from 'react';
import Camouflage from './components/Camouflage';
import ChatRoom from './components/ChatRoom';

function App() {
  const [showChat, setShowChat] = useState(false);
  const [keystrokeBuffer, setKeystrokeBuffer] = useState('');
  
  // Secret Handshake: BEBU
  const SECRET_KEY = 'BEBU';

  useEffect(() => {
    const handleKeyDown = (e) => {
      const char = e.key.toUpperCase();
      if ('BEBU'.includes(char)) {
        setKeystrokeBuffer(prev => {
          const next = (prev + char).slice(-4);
          if (next === SECRET_KEY) {
            setShowChat(true);
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Stateless requirement: Ensure no persistence is active
  useEffect(() => {
    // Clear everything just in case
    localStorage.clear();
    sessionStorage.clear();
    
    // Disable right click globally to slow down investigation
    const preventContext = (e) => e.preventDefault();
    document.addEventListener('contextmenu', preventContext);
    
    return () => document.removeEventListener('contextmenu', preventContext);
  }, []);

  if (showChat) {
    return <ChatRoom roomId="default-secure-room-1" />;
  }

  return <Camouflage />;
}

export default App;
