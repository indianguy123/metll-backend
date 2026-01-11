import app from './app';
import { createServer } from 'http';
import { initializeSocketIO } from './config/socket.config';

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all interfaces for React Native access

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io
const io = initializeSocketIO(httpServer);

// Make io accessible in app (for notifications from controllers)
app.set('io', io);

httpServer.listen(Number(PORT), HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`🔌 Socket.io ready for connections`);
  console.log(`📱 For Android emulator use: http://10.0.2.2:${PORT}`);
  console.log(`📱 For physical device use your local IP: http://YOUR_IP:${PORT}`);
});
