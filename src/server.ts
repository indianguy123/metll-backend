import app from './app';
import { createServer } from 'http';
import { initializeSocketIO } from './config/socket.config';

const PORT = process.env.PORT || 3000;

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io
const io = initializeSocketIO(httpServer);

// Make io accessible in app (for notifications from controllers)
app.set('io', io);

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 Socket.io ready for connections`);
});
