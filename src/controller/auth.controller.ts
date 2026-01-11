import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database.config';
import { generateOTP, isOTPExpired } from '../utils/otp.util';
import { generateToken } from '../utils/jwt.util';
import { sendOTPSMS, validatePhoneNumber, normalizePhoneNumber } from '../utils/sms.util';
import { AuthRequest } from '../types';
import {
  uploadImageToCloudinary,
  deleteImagesFromCloudinary,
} from '../services/cloudinary.service';

/**
 * Register new user
 * POST /api/auth/register
 * 
 * Security: Rate limited, phone number validated, password hashed
 */
export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phoneNumber, password, name } = req.body;

    // Validation
    if (!phoneNumber || !password) {
      res.status(400).json({
        success: false,
        message: 'Phone number and password are required',
      });
      return;
    }

    // Validate and normalize phone number
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!validatePhoneNumber(normalizedPhone)) {
      res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Please use E.164 format (e.g., +1234567890)',
      });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (existingUser) {
      res.status(400).json({
        success: false,
        message: 'User with this phone number already exists',
      });
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const user = await prisma.user.create({
      data: {
        phoneNumber: normalizedPhone,
        password: hashedPassword,
        name: name || null,
        otp,
        otpExpiresAt,
        lastOtpSentAt: new Date(),
        otpAttempts: 1,
      },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        isVerified: false,
      },
    });

    // Send OTP via SMS
    try {
      await sendOTPSMS(normalizedPhone, otp);
    } catch (smsError: any) {
      // If SMS fails, delete the user to prevent orphaned records
      await prisma.user.delete({ where: { id: user.id } });
      throw smsError;
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your phone number with the OTP sent via SMS.',
      data: {
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          name: user.name,
        },
      },
    });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Verify OTP and activate account
 * POST /api/auth/verify-otp
 * 
 * Security: OTP expiration check, attempt tracking
 */
export const verifyOTP = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required',
      });
      return;
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phone);

    // Find user
    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      // Don't reveal if user exists (security best practice)
      res.status(400).json({
        success: false,
        message: 'Invalid phone number or OTP',
      });
      return;
    }

    if (user.isVerified) {
      res.status(400).json({
        success: false,
        message: 'Account already verified',
      });
      return;
    }

    // Check OTP attempts (prevent brute force)
    if (user.otpAttempts >= 5) {
      res.status(429).json({
        success: false,
        message: 'Too many OTP attempts. Please request a new OTP.',
      });
      return;
    }

    // Check OTP
    if (!user.otp || user.otp !== otp) {
      // Increment attempt counter
      await prisma.user.update({
        where: { id: user.id },
        data: { otpAttempts: user.otpAttempts + 1 },
      });

      res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
      return;
    }

    // Check if OTP expired
    if (isOTPExpired(user.otpExpiresAt)) {
      res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
      return;
    }

    // Verify user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        otp: null,
        otpExpiresAt: null,
        otpAttempts: 0,
      },
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      phoneNumber: user.phoneNumber,
    });

    res.status(200).json({
      success: true,
      message: 'Account verified successfully',
      data: {
        token,
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          name: user.name,
        },
      },
    });
  } catch (error: any) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'OTP verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Login user
 * POST /api/auth/login
 * 
 * Security: Rate limited, password verification, account verification check
 */
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      res.status(400).json({
        success: false,
        message: 'Phone number and password are required',
      });
      return;
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Find user
    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      // Don't reveal if user exists (security best practice)
      res.status(401).json({
        success: false,
        message: 'Invalid phone number or password',
      });
      return;
    }

    // Check if verified
    if (!user.isVerified) {
      res.status(403).json({
        success: false,
        message: 'Account not verified. Please verify your phone number first.',
      });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid phone number or password',
      });
      return;
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      phoneNumber: user.phoneNumber,
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          bio: user.bio,
          age: user.age,
          gender: user.gender,
          images: user.images,
        },
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Resend OTP
 * POST /api/auth/resend-otp
 * 
 * Security: Rate limited, prevents OTP spam
 */
export const resendOTP = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
      return;
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Find user
    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      // Don't reveal if user exists (security best practice)
      res.status(200).json({
        success: true,
        message: 'If the phone number exists, an OTP has been sent.',
      });
      return;
    }

    if (user.isVerified) {
      res.status(400).json({
        success: false,
        message: 'Account already verified',
      });
      return;
    }

    // Check rate limiting (prevent spam)
    const now = new Date();
    const lastSent = user.lastOtpSentAt;
    if (lastSent && now.getTime() - lastSent.getTime() < 60000) {
      // Less than 1 minute since last OTP
      res.status(429).json({
        success: false,
        message: 'Please wait before requesting a new OTP.',
      });
      return;
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with new OTP
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otp,
        otpExpiresAt,
        lastOtpSentAt: new Date(),
        otpAttempts: 0, // Reset attempts on new OTP
      },
    });

    // Send OTP via SMS
    try {
      await sendOTPSMS(normalizedPhone, otp);
    } catch (smsError: any) {
      console.error('SMS send error:', smsError);
      res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'OTP resent successfully',
    });
  } catch (error: any) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get authenticated user profile
 * GET /api/auth/profile
 */
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        bio: true,
        age: true,
        gender: true,
        latitude: true,
        longitude: true,
        images: true,
        imagePublicIds: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error: any) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update user profile with image upload
 * PUT /api/auth/profile
 */
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const { name, bio, age, gender, latitude, longitude } = req.body;
    const files = req.files as Express.Multer.File[];

    // Get current user to access old images
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        images: true,
        imagePublicIds: true,
      },
    });

    if (!currentUser) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    const existingImages = currentUser.images || [];
    const existingPublicIds = currentUser.imagePublicIds || [];
    const uploadedImages: string[] = [];
    const uploadedPublicIds: string[] = [];
    const failedUploads: string[] = [];

    // Upload new images if provided
    if (files && files.length > 0) {
      // Validate max 6 images total
      const currentImageCount = existingImages.length;
      if (currentImageCount + files.length > 6) {
        res.status(400).json({
          success: false,
          message: `Maximum 6 images allowed. You currently have ${currentImageCount} images.`,
        });
        return;
      }

      // Upload images to Cloudinary
      for (const file of files) {
        try {
          const result = await uploadImageToCloudinary(
            file.buffer,
            req.user.id,
            'profile'
          );
          uploadedImages.push(result.url);
          uploadedPublicIds.push(result.publicId);
        } catch (error: any) {
          console.error('Image upload error:', error);
          failedUploads.push(file.originalname);
        }
      }

      // If any uploads failed, cleanup successful ones
      if (failedUploads.length > 0 && uploadedPublicIds.length > 0) {
        await deleteImagesFromCloudinary(uploadedPublicIds);
        res.status(500).json({
          success: false,
          message: `Failed to upload some images: ${failedUploads.join(', ')}`,
        });
        return;
      }
    }

    // Prepare update data
    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    if (age !== undefined) updateData.age = age ? parseInt(age) : null;
    if (gender !== undefined) updateData.gender = gender;
    if (latitude !== undefined) updateData.latitude = latitude ? parseFloat(latitude) : null;
    if (longitude !== undefined) updateData.longitude = longitude ? parseFloat(longitude) : null;

    // If new images uploaded, add them to existing ones
    if (uploadedImages.length > 0) {
      updateData.images = [...existingImages, ...uploadedImages];
      updateData.imagePublicIds = [...existingPublicIds, ...uploadedPublicIds];
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        bio: true,
        age: true,
        gender: true,
        latitude: true,
        longitude: true,
        images: true,
        imagePublicIds: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser,
      },
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Logout user (client-side token removal)
 * POST /api/auth/logout
 */
export const logout = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Since we're using JWT, logout is handled client-side by removing the token
    // This endpoint is for consistency and can be used for logging/logout events
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Forgot Password - Send OTP for password reset
 * POST /api/auth/forgot-password
 * 
 * Security: Rate limited, sends OTP to registered phone
 */
export const forgotPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
      return;
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Find user
    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      // Don't reveal if user exists (security best practice)
      // Still return success to prevent phone enumeration
      res.status(200).json({
        success: true,
        message: 'If this phone number is registered, you will receive an OTP.',
      });
      return;
    }

    // Check OTP cooldown (1 minute between requests)
    if (user.lastOtpSentAt) {
      const timeSinceLastOTP = Date.now() - user.lastOtpSentAt.getTime();
      const cooldownMs = 60 * 1000; // 1 minute

      if (timeSinceLastOTP < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastOTP) / 1000);
        res.status(429).json({
          success: false,
          message: `Please wait ${remainingSeconds} seconds before requesting another OTP`,
        });
        return;
      }
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with new OTP
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otp,
        otpExpiresAt,
        lastOtpSentAt: new Date(),
        otpAttempts: 0, // Reset attempts for new OTP
      },
    });

    // Send OTP via SMS
    await sendOTPSMS(normalizedPhone, otp);

    res.status(200).json({
      success: true,
      message: 'OTP sent to your phone number for password reset.',
    });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process forgot password request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Reset Password - Verify OTP and set new password
 * POST /api/auth/reset-password
 * 
 * Security: OTP verification required, password hashed
 */
export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phoneNumber, otp, newPassword } = req.body;

    if (!phoneNumber || !otp || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Phone number, OTP, and new password are required',
      });
      return;
    }

    // Validate password strength
    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
      return;
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Find user
    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      res.status(400).json({
        success: false,
        message: 'Invalid phone number or OTP',
      });
      return;
    }

    // Check OTP attempts (prevent brute force)
    if (user.otpAttempts >= 5) {
      res.status(429).json({
        success: false,
        message: 'Too many OTP attempts. Please request a new OTP.',
      });
      return;
    }

    // Check if OTP expired
    if (!user.otp || !user.otpExpiresAt || isOTPExpired(user.otpExpiresAt)) {
      res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
      return;
    }

    // Verify OTP
    if (user.otp !== otp) {
      // Increment attempts
      await prisma.user.update({
        where: { id: user.id },
        data: { otpAttempts: { increment: 1 } },
      });

      res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear OTP
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        otp: null,
        otpExpiresAt: null,
        otpAttempts: 0,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.',
    });
  } catch (error: any) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
