import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import referralRoutes from './routes/referral.routes';
import confessionRoutes from './routes/confession.routes';
import verificationRoutes from './routes/verification.routes';
import swipeRoutes from './routes/swipe.routes';
import chatRoutes from './routes/chat.routes';
import userRoutes from './routes/user.routes';
import callRoutes from './routes/call.routes';
import hostRoutes from './routes/host.routes';
import mediaRoutes from './routes/media.routes';
import reportRoutes from './routes/report.routes';
import notificationRoutes from './routes/notification.routes';

dotenv.config();

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Metll API is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/referrals', referralRoutes); // Add referral routes
app.use('/api/confessions', confessionRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/swipe', swipeRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/user', userRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/host', hostRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/report', reportRoutes); // Add report routes
app.use('/api/notifications', notificationRoutes); // Add notification routes

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

export default app;
