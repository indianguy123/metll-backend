import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * Rate limiter for OTP requests
 * Prevents abuse and phone number enumeration attacks
 * 
 * Security: Limits to 3 OTP requests per phone number per 15 minutes
 */
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per window
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use phone number as key for rate limiting
  keyGenerator: (req: Request) => {
    const phoneNumber = req.body.phoneNumber || req.body.phone;
    return phoneNumber || req.ip; // Fallback to IP if no phone number
  },
});

/**
 * Rate limiter for login attempts
 * Prevents brute force attacks
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const phoneNumber = req.body.phoneNumber || req.body.phone;
    return phoneNumber || req.ip;
  },
});

/**
 * Rate limiter for registration
 * Prevents spam registrations
 */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: {
    success: false,
    message: 'Too many registration attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

