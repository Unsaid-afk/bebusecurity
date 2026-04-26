const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on('connection', (socket) => {
  socket.on('join', (roomId) => {
    socket.join(roomId);
    
    // Get room members
    const room = io.sockets.adapter.rooms.get(roomId);
    const numClients = room ? room.size : 0;
    
    if (numClients === 2) {
      // Send initiator command ONLY to the person who just joined
      socket.emit('ready', { initiator: true });
    }
  });

  socket.on('signal', (data) => {
    // Relay to the other peer in the room
    socket.to(data.roomId).emit('signal', {
      sender: socket.id,
      signal: data.signal
    });
  });

  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Relay active on ${PORT}\n`);
});
