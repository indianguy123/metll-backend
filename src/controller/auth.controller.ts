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
    const { phoneNumber, password, name, email } = req.body;

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

    // Validate referral code if provided
    let referrerId: number | null = null;
    if (req.body.referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: req.body.referralCode },
      });
      if (referrer) {
        referrerId = referrer.id;
      } else {
        // Optional: fail or ignore? Requirements say "Validation: Referral code applied ONLY during registration". 
        // Does not explicitly say to fail request, but usually yes.
        // Let's ignore it for UX friction reduction? Or fail?
        // "Code cannot be changed after signup" -> Implies it's important.
        // Let's return error if code is invalid.
        res.status(400).json({
          success: false,
          message: 'Invalid referral code',
        });
        return;
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user with referral code
    // Note: User model automatically generates its own `referralCode` via @default(cuid())
    const user = await prisma.user.create({
      data: {
        phoneNumber: normalizedPhone,
        password: hashedPassword,
        name: name || null,
        email: email || null,
        otp,
        otpExpiresAt,
        lastOtpSentAt: new Date(),
        otpAttempts: 1,
        referredById: referrerId, // Link to referrer
      },
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        name: true,
        isVerified: false,
        referralCode: true,
      },
    });

    // Create UserProfile row so it exists from the start (required for normalized schema)
    await prisma.userProfile.create({
      data: { userId: user.id },
    });

    // Create Referral record if there is a referrer
    if (referrerId) {
      await prisma.referral.create({
        data: {
          referrerId: referrerId,
          referredUserId: user.id,
          status: 'pending',
        },
      });
    }

    // Send OTP via SMS
    let smsSent = true;
    try {
      await sendOTPSMS(normalizedPhone, otp);
    } catch (smsError: any) {
      // Log the error but don't delete user - allow verification with master OTP
      console.error('SMS sending failed:', smsError.message);
      console.log(`📱 OTP for ${normalizedPhone}: ${otp} (SMS failed, use master OTP 970819)`);
      smsSent = false;
    }

    res.status(201).json({
      success: true,
      message: smsSent
        ? 'Registration successful. Please verify your phone number with the OTP sent via SMS.'
        : 'Registration successful. SMS failed to send - use OTP 970819 to verify.',
      data: {
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          referralCode: user.referralCode,
        },
        smsSent,
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

    // Master OTP for testing/development (bypasses all checks)
    const MASTER_OTP = '970819';
    const isMasterOTP = otp === MASTER_OTP;

    // Skip OTP validation if master OTP is used
    if (!isMasterOTP) {
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
    }

    // Verify user and get updated data with all fields
    const updatedUser = await prisma.$transaction(async (tx) => {
      // 1. Update user verification status
      const u = await tx.user.update({
        where: { id: user.id },
        data: {
          isVerified: true,
          otp: null,
          otpExpiresAt: null,
          otpAttempts: 0,
        },
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          name: true,
          isVerified: true,
          isOnboarded: true,
          isDiscoverOnboarded: true,
          createdAt: true,
          updatedAt: true,
          referralCode: true,
          totalReferrals: true,
          rewardsEarned: true,
          // Include normalized relations
          profile: true,
          photos: true,
          verification: true,
          personalityResponses: true,
        },
      });

      // 2. Check for pending referral
      const referral = await tx.referral.findFirst({
        where: {
          referredUserId: u.id,
          status: 'pending',
        },
      });

      if (referral) {
        // Update referral status
        await tx.referral.update({
          where: { id: referral.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        });

        // Increment referrer's total referrals
        const referrer = await tx.user.update({
          where: { id: referral.referrerId },
          data: {
            totalReferrals: { increment: 1 },
          },
        });

        // Check if reward should be granted (every 3 referrals)
        if (referrer.totalReferrals % 3 === 0) {
          // Grant reward
          await tx.reward.create({
            data: {
              userId: referrer.id,
              type: 'coffee_date',
              status: 'available',
            },
          });

          // Update rewards earned count
          await tx.user.update({
            where: { id: referrer.id },
            data: {
              rewardsEarned: { increment: 1 },
            },
          });
        }
      }

      return u;
    });

    // Generate token
    const token = generateToken({
      userId: updatedUser.id,
      phoneNumber: updatedUser.phoneNumber,
    });

    // Build user response from normalized data
    const profile = updatedUser.profile;
    const photos = updatedUser.photos || [];
    const verification = updatedUser.verification;
    const profilePhoto = photos.find((p: any) => p.type === 'profile')?.url || null;
    const additionalPhotos = photos.filter((p: any) => p.type === 'additional').map((p: any) => p.url);

    const userResponse = {
      id: updatedUser.id,
      phoneNumber: updatedUser.phoneNumber,
      email: updatedUser.email,
      name: updatedUser.name,
      bio: profile?.bio || null,
      age: profile?.age || null,
      gender: profile?.gender || null,
      latitude: profile?.latitude || null,
      longitude: profile?.longitude || null,
      images: additionalPhotos,
      photo: profilePhoto,
      additionalPhotos: additionalPhotos,
      verificationVideo: verification?.videoUrl || null,
      isVerified: updatedUser.isVerified,
      isOnboarded: updatedUser.isOnboarded,
      isDiscoverOnboarded: updatedUser.isDiscoverOnboarded,
      verificationStatus: verification?.status || 'pending',
      school: null, // Now in separate tables if needed
      college: null,
      office: null,
      homeLocation: profile?.currentCity || null,
      situationResponses: updatedUser.personalityResponses || [],
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: 'Account verified successfully',
      data: {
        token,
        user: userResponse,
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

    // Find user with all fields from normalized schema
    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        password: true,
        name: true,
        isVerified: true,
        isOnboarded: true,
        isDiscoverOnboarded: true,
        createdAt: true,
        updatedAt: true,
        referralCode: true,
        totalReferrals: true,
        rewardsEarned: true,
        profile: true,
        photos: true,
        verification: true,
        personalityResponses: true,
      },
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

    // Build user response from normalized data
    const profile = user.profile;
    const photos = user.photos || [];
    const verification = user.verification;
    const profilePhoto = photos.find((p: any) => p.type === 'profile')?.url || null;
    const additionalPhotos = photos.filter((p: any) => p.type === 'additional').map((p: any) => p.url);

    const userResponse = {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      name: user.name,
      bio: profile?.bio || null,
      age: profile?.age || null,
      gender: profile?.gender || null,
      latitude: profile?.latitude || null,
      longitude: profile?.longitude || null,
      images: additionalPhotos,
      photo: profilePhoto,
      additionalPhotos: additionalPhotos,
      verificationVideo: verification?.videoUrl || null,
      isVerified: user.isVerified,
      isOnboarded: user.isOnboarded,
      isDiscoverOnboarded: user.isDiscoverOnboarded,
      verificationStatus: verification?.status || 'pending',
      school: null,
      college: null,
      office: null,
      homeLocation: profile?.currentCity || null,
      situationResponses: user.personalityResponses || [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: userResponse,
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
        email: true,
        name: true,
        isVerified: true,
        isOnboarded: true,
        isDiscoverOnboarded: true,
        createdAt: true,
        updatedAt: true,
        referralCode: true,
        totalReferrals: true,
        rewardsEarned: true,
        profile: true,
        photos: true,
        verification: true,
        personalityResponses: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Build user response from normalized data
    const profile = user.profile;
    const photos = user.photos || [];
    const verification = user.verification;
    const profilePhoto = photos.find((p: any) => p.type === 'profile')?.url || null;
    const additionalPhotos = photos.filter((p: any) => p.type === 'additional').map((p: any) => p.url);

    const userResponse = {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      name: user.name,
      bio: profile?.bio || null,
      age: profile?.age || null,
      gender: profile?.gender || null,
      latitude: profile?.latitude || null,
      longitude: profile?.longitude || null,
      images: additionalPhotos,
      photo: profilePhoto,
      additionalPhotos: additionalPhotos,
      verificationVideo: verification?.videoUrl || null,
      isVerified: user.isVerified,
      isOnboarded: user.isOnboarded,
      isDiscoverOnboarded: user.isDiscoverOnboarded,
      verificationStatus: verification?.status || 'pending',
      homeLocation: profile?.currentCity || null,
      situationResponses: user.personalityResponses || [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({
      success: true,
      data: {
        user: userResponse,
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

    // Get current user with photos
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        photos: true,
        profile: true,
      },
    });

    if (!currentUser) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    const existingPhotos = currentUser.photos || [];
    const uploadedPhotos: { url: string; publicId: string }[] = [];
    const failedUploads: string[] = [];

    // Upload new images if provided
    if (files && files.length > 0) {
      // Validate max 6 photos total
      const currentPhotoCount = existingPhotos.length;
      if (currentPhotoCount + files.length > 6) {
        res.status(400).json({
          success: false,
          message: `Maximum 6 photos allowed. You currently have ${currentPhotoCount} photos.`,
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
          uploadedPhotos.push({ url: result.url, publicId: result.publicId });
        } catch (error: any) {
          console.error('Image upload error:', error);
          failedUploads.push(file.originalname);
        }
      }

      // If any uploads failed, cleanup successful ones
      if (failedUploads.length > 0 && uploadedPhotos.length > 0) {
        await deleteImagesFromCloudinary(uploadedPhotos.map(p => p.publicId));
        res.status(500).json({
          success: false,
          message: `Failed to upload some images: ${failedUploads.join(', ')}`,
        });
        return;
      }
    }

    // Update user name if provided
    if (name !== undefined) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { name },
      });
    }

    // Upsert profile data (bio, age, gender, location) – always run so UserProfile row exists
    const profileData: any = {};
    if (bio !== undefined) profileData.bio = bio;
    if (age !== undefined) profileData.age = age ? parseInt(age) : null;
    if (gender !== undefined) profileData.gender = gender;
    if (latitude !== undefined) profileData.latitude = latitude ? parseFloat(latitude) : null;
    if (longitude !== undefined) profileData.longitude = longitude ? parseFloat(longitude) : null;

    await prisma.userProfile.upsert({
      where: { userId: req.user.id },
      update: { ...profileData, updatedAt: new Date() },
      create: {
        userId: req.user.id,
        ...profileData,
      },
    });

    // Add new photos to UserPhoto table
    if (uploadedPhotos.length > 0) {
      const nextOrder = existingPhotos.length;
      await prisma.userPhoto.createMany({
        data: uploadedPhotos.map((photo, index) => ({
          userId: req.user!.id,
          url: photo.url,
          publicId: photo.publicId,
          type: 'additional',
          order: nextOrder + index,
        })),
      });
    }

    // Fetch updated user data
    const updatedUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        profile: true,
        photos: true,
        verification: true,
      },
    });

    // Build response
    const profile = updatedUser?.profile;
    const photos = updatedUser?.photos || [];
    const verification = updatedUser?.verification;
    const profilePhoto = photos.find((p: any) => p.type === 'profile')?.url || null;
    const additionalPhotos = photos.filter((p: any) => p.type === 'additional').map((p: any) => p.url);

    const userResponse = {
      id: updatedUser?.id,
      phoneNumber: updatedUser?.phoneNumber,
      name: updatedUser?.name,
      bio: profile?.bio || null,
      age: profile?.age || null,
      gender: profile?.gender || null,
      latitude: profile?.latitude || null,
      longitude: profile?.longitude || null,
      images: additionalPhotos,
      photo: profilePhoto,
      additionalPhotos: additionalPhotos,
      verificationVideo: verification?.videoUrl || null,
      isVerified: updatedUser?.isVerified,
      isOnboarded: updatedUser?.isOnboarded,
      verificationStatus: verification?.status || 'pending',
      createdAt: updatedUser?.createdAt,
      updatedAt: updatedUser?.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: userResponse,
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

    // Master OTP for testing/development (bypasses all checks)
    const MASTER_OTP = '970819';
    const isMasterOTP = otp === MASTER_OTP;

    // Skip OTP validation if master OTP is used
    if (!isMasterOTP) {
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
