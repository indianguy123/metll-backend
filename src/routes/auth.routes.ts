import { Router } from 'express';
import {
  register,
  verifyOTP,
  login,
  resendOTP,
  getProfile,
  updateProfile,
  logout,
  forgotPassword,
  resetPassword,
} from '../controller/auth.controller';
import { protect } from '../middleware/auth.middleware';
import {
  uploadProfileImages,
  handleUploadError,
} from '../middleware/upload.middleware';
import {
  otpRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
} from '../middleware/rateLimit.middleware';

const router = Router();

// Public routes with rate limiting
router.post('/register', registerRateLimiter, register);
router.post('/verify-otp', verifyOTP);
router.post('/login', loginRateLimiter, login);
router.post('/resend-otp', otpRateLimiter, resendOTP);
router.post('/forgot-password', otpRateLimiter, forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/profile', protect, getProfile);
router.put(
  '/profile',
  protect,
  uploadProfileImages,
  handleUploadError,
  updateProfile
);
router.post('/logout', protect, logout);

export default router;

