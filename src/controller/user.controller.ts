import { Response } from 'express';
import prisma from '../config/database.config';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../types';
import {
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
  deleteImagesFromCloudinary,
} from '../services/cloudinary.service';

// Type definitions for profile data
interface SchoolInfo {
  name?: string;
  location?: string;
  city?: string;
  state?: string;
  class?: string;
  section?: string;
}

interface CollegeInfo {
  name?: string;
  department?: string;
  location?: string;
}

interface OfficeInfo {
  name?: string;
  department?: string;
  designation?: string;
  location?: string;
}

interface LocationInfo {
  address?: string;
  city?: string;
  state?: string;
}

interface HomeLocation {
  current?: LocationInfo;
  past?: LocationInfo;
}

interface SituationResponse {
  questionId: number;
  answer: string;
  answeredAt: string;
}

/**
 * Update user profile with all profile data
 * PUT /api/user/profile
 */
export const updateUserProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const {
      name,
      bio,
      age,
      gender,
      email,
      latitude,
      longitude,
      school,
      college,
      office,
      homeLocation,
      situationResponses,
      additionalPhotos,
      verificationVideo,
    } = req.body;

    // Build update data object
    const updateData: any = {
      updatedAt: new Date(),
    };

    // Basic profile fields
    if (name !== undefined) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    if (age !== undefined) updateData.age = parseInt(age) || null;
    if (gender !== undefined) updateData.gender = gender;
    if (email !== undefined) updateData.email = email;
    if (latitude !== undefined) updateData.latitude = parseFloat(latitude) || null;
    if (longitude !== undefined) updateData.longitude = parseFloat(longitude) || null;

    // JSON fields (school, college, office, homeLocation)
    if (school !== undefined) updateData.school = school;
    if (college !== undefined) updateData.college = college;
    if (office !== undefined) updateData.office = office;
    if (homeLocation !== undefined) updateData.homeLocation = homeLocation;
    if (situationResponses !== undefined) updateData.situationResponses = situationResponses;

    // Additional photos (Cloudinary URLs)
    if (additionalPhotos !== undefined) {
      if (Array.isArray(additionalPhotos)) {
        updateData.additionalPhotos = additionalPhotos;
      }
    }

    // Verification video (Cloudinary URL)
    if (verificationVideo !== undefined) {
      updateData.verificationVideo = verificationVideo;
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        name: true,
        bio: true,
        age: true,
        gender: true,
        latitude: true,
        longitude: true,
        images: true,
        additionalPhotos: true,
        verificationVideo: true,
        isVerified: true,
        verificationStatus: true,
        school: true,
        college: true,
        office: true,
        homeLocation: true,
        situationResponses: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser },
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
 * Upload additional photos
 * POST /api/user/photos
 */
export const uploadAdditionalPhotos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No photos provided',
      });
      return;
    }

    // Get current user's photos
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { additionalPhotos: true, additionalPhotoIds: true },
    });

    const currentPhotos = user?.additionalPhotos || [];
    const currentPhotoIds = user?.additionalPhotoIds || [];

    // Check photo limit (max 10 additional photos)
    if (currentPhotos.length + files.length > 10) {
      res.status(400).json({
        success: false,
        message: `Cannot upload more than 10 additional photos. You have ${currentPhotos.length} photos.`,
      });
      return;
    }

    // Upload to Cloudinary
    const uploadedPhotos: string[] = [];
    const uploadedPhotoIds: string[] = [];

    for (const file of files) {
      const result = await uploadImageToCloudinary(
        file.buffer,
        userId,
        'additional'
      );
      uploadedPhotos.push(result.url);
      uploadedPhotoIds.push(result.publicId);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        additionalPhotos: [...currentPhotos, ...uploadedPhotos],
        additionalPhotoIds: [...currentPhotoIds, ...uploadedPhotoIds],
      },
      select: {
        id: true,
        additionalPhotos: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Photos uploaded successfully',
      data: {
        uploadedUrls: uploadedPhotos,
        allPhotos: updatedUser.additionalPhotos,
      },
    });
  } catch (error: any) {
    console.error('Upload photos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload photos',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete an additional photo
 * DELETE /api/user/photos/:index
 */
export const deleteAdditionalPhoto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const photoIndex = parseInt(req.params.index);

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    if (isNaN(photoIndex) || photoIndex < 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid photo index',
      });
      return;
    }

    // Get current photos
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { additionalPhotos: true, additionalPhotoIds: true },
    });

    if (!user || photoIndex >= (user.additionalPhotos?.length || 0)) {
      res.status(404).json({
        success: false,
        message: 'Photo not found',
      });
      return;
    }

    // Delete from Cloudinary
    const photoIdToDelete = user.additionalPhotoIds?.[photoIndex];
    if (photoIdToDelete) {
      await deleteImagesFromCloudinary([photoIdToDelete]);
    }

    // Remove from arrays
    const newPhotos = user.additionalPhotos.filter((_, i) => i !== photoIndex);
    const newPhotoIds = (user.additionalPhotoIds || []).filter((_, i) => i !== photoIndex);

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        additionalPhotos: newPhotos,
        additionalPhotoIds: newPhotoIds,
      },
      select: {
        id: true,
        additionalPhotos: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Photo deleted successfully',
      data: { photos: updatedUser.additionalPhotos },
    });
  } catch (error: any) {
    console.error('Delete photo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete photo',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Upload verification video
 * POST /api/user/verification-video
 */
export const uploadVerificationVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const file = req.file as Express.Multer.File;

    if (!file) {
      res.status(400).json({
        success: false,
        message: 'No video provided',
      });
      return;
    }

    // Get current verification video to delete
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { verificationVideoId: true },
    });

    // Delete old video if exists
    if (user?.verificationVideoId) {
      await deleteImagesFromCloudinary([user.verificationVideoId]);
    }

    // Upload to Cloudinary
    const result = await uploadVideoToCloudinary(
      file.buffer,
      userId,
      'verification'
    );

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        verificationVideo: result.url,
        verificationVideoId: result.publicId,
      },
      select: {
        id: true,
        verificationVideo: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Verification video uploaded successfully',
      data: { videoUrl: updatedUser.verificationVideo },
    });
  } catch (error: any) {
    console.error('Upload verification video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload verification video',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update situation responses (personality questions)
 * PUT /api/user/situation-responses
 */
export const updateSituationResponses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const { responses } = req.body;

    if (!responses || !Array.isArray(responses)) {
      res.status(400).json({
        success: false,
        message: 'Invalid responses format. Expected array of responses.',
      });
      return;
    }

    // Validate response structure
    const validatedResponses = responses.map((r: any) => ({
      questionId: parseInt(r.questionId),
      answer: String(r.answer),
      answeredAt: r.answeredAt || new Date().toISOString(),
    }));

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        situationResponses: validatedResponses as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        situationResponses: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Situation responses updated successfully',
      data: { situationResponses: updatedUser.situationResponses },
    });
  } catch (error: any) {
    console.error('Update situation responses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update situation responses',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get user profile
 * GET /api/user/profile
 */
export const getUserProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        name: true,
        bio: true,
        age: true,
        gender: true,
        latitude: true,
        longitude: true,
        images: true,
        profilePhoto: true,
        additionalPhotos: true,
        verificationVideo: true,
        isVerified: true,
        verificationStatus: true,
        school: true,
        college: true,
        office: true,
        homeLocation: true,
        situationResponses: true,
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
      data: { user },
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
 * Update school info
 * PUT /api/user/school
 */
export const updateSchool = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const schoolData = req.body as SchoolInfo;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { school: schoolData as Prisma.InputJsonValue },
      select: { id: true, school: true },
    });

    res.status(200).json({
      success: true,
      message: 'School info updated successfully',
      data: { school: updatedUser.school },
    });
  } catch (error: any) {
    console.error('Update school error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update school info',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update college info
 * PUT /api/user/college
 */
export const updateCollege = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const collegeData = req.body as CollegeInfo;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { college: collegeData as Prisma.InputJsonValue },
      select: { id: true, college: true },
    });

    res.status(200).json({
      success: true,
      message: 'College info updated successfully',
      data: { college: updatedUser.college },
    });
  } catch (error: any) {
    console.error('Update college error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update college info',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update office info
 * PUT /api/user/office
 */
export const updateOffice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const officeData = req.body as OfficeInfo;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { office: officeData as Prisma.InputJsonValue },
      select: { id: true, office: true },
    });

    res.status(200).json({
      success: true,
      message: 'Office info updated successfully',
      data: { office: updatedUser.office },
    });
  } catch (error: any) {
    console.error('Update office error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update office info',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update home location
 * PUT /api/user/home-location
 */
export const updateHomeLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const homeLocationData = req.body as HomeLocation;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { homeLocation: homeLocationData as Prisma.InputJsonValue },
      select: { id: true, homeLocation: true },
    });

    res.status(200).json({
      success: true,
      message: 'Home location updated successfully',
      data: { homeLocation: updatedUser.homeLocation },
    });
  } catch (error: any) {
    console.error('Update home location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update home location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

