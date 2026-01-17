import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';
import {
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
  deleteImagesFromCloudinary,
  deleteImageFromCloudinary,
} from '../services/cloudinary.service';

// Type definitions for profile data


// SituationResponse type (used for documentation/reference)
// interface SituationResponse {
//   questionId: number;
//   answer: string;
//   answeredAt: string;
// }

/**
 * Update user profile with all profile data
 * PUT /api/user/profile
 * 
 * Now uses normalized tables: UserProfile for profile data
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
      height,
      currentCity,
      pastCity,
      school,
      college,
      office,
      homeLocation,
      situationResponses, // Add situationResponses destructuring
    } = req.body;

    console.log(`[updateUserProfile] User ${userId} payload:`, {
      name, bio, age, gender, school: !!school, college: !!college, office: !!office,
      homeLocation: !!homeLocation, situations: situationResponses?.length
    });

    // Update User table (only name and email)
    const userUpdateData: any = { updatedAt: new Date() };
    if (name !== undefined) userUpdateData.name = name;
    if (email !== undefined) userUpdateData.email = email;

    if (Object.keys(userUpdateData).length > 1) { // 1 because updatedAt is always there
      await prisma.user.update({
        where: { id: userId },
        data: userUpdateData,
      });
    }

    // Update or create UserProfile
    const profileData: any = {};
    if (bio !== undefined) profileData.bio = bio;
    if (age !== undefined) profileData.age = parseInt(age as string) || null;
    if (gender !== undefined) profileData.gender = gender;
    if (height !== undefined) profileData.height = parseInt(height as string) || null;
    if (latitude !== undefined) profileData.latitude = parseFloat(latitude as string) || null;
    if (longitude !== undefined) profileData.longitude = parseFloat(longitude as string) || null;
    if (currentCity !== undefined) profileData.currentCity = currentCity;
    if (pastCity !== undefined) profileData.pastCity = pastCity;

    // Handle homeLocation (current/past addresses)
    if (homeLocation) {
      if (homeLocation.current) {
        profileData.currentCity = homeLocation.current.city || homeLocation.current.address;
      }
      if (homeLocation.past) {
        profileData.pastCity = homeLocation.past.city || homeLocation.past.address;
      }
    }

    // Always upsert UserProfile so the row exists (create with userId if missing)
    await prisma.userProfile.upsert({
      where: { userId },
      update: { ...profileData, updatedAt: new Date() },
      create: { userId, ...profileData },
    });

    // Handle Personality Responses (Situation Responses)
    if (situationResponses && Array.isArray(situationResponses)) {
      // Delete existing responses first (replace all strategy)
      await prisma.personalityResponse.deleteMany({
        where: { userId },
      });

      // Create new responses
      if (situationResponses.length > 0) {
        await Promise.all(
          situationResponses.map((r: any) =>
            prisma.personalityResponse.create({
              data: {
                userId,
                questionId: parseInt(r.questionId) || 0,
                answer: String(r.answer),
              },
            })
          )
        );
      }
    }

    // Update or create UserSchool if provided
    if (school && school.name) {
      await prisma.userSchool.upsert({
        where: { userId },
        update: {
          name: school.name,
          city: school.city || null,
          state: school.state || null,
          class: school.class || null,
          section: school.section || null,
        },
        create: {
          userId,
          name: school.name,
          city: school.city || null,
          state: school.state || null,
          class: school.class || null,
          section: school.section || null,
        },
      });
    }

    // Update or create UserCollege if provided
    if (college && college.name) {
      await prisma.userCollege.upsert({
        where: { userId },
        update: {
          name: college.name,
          department: college.department || null,
          location: college.location || null,
        },
        create: {
          userId,
          name: college.name,
          department: college.department || null,
          location: college.location || null,
        },
      });
    }

    // Update or create UserOffice if provided
    if (office && office.name) {
      await prisma.userOffice.upsert({
        where: { userId },
        update: {
          name: office.name,
          designation: office.designation || null,
          department: office.department || null,
          location: office.location || null,
        },
        create: {
          userId,
          name: office.name,
          designation: office.designation || null,
          department: office.department || null,
          location: office.location || null,
        },
      });
    }

    // Fetch updated user with profile and related data
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        photos: { orderBy: { order: 'asc' } },
        verification: true,
        datingPrefs: true,
        school: true,
        college: true,
        office: true,
        personalityResponses: true,
      },
    });

    // Build response matching frontend expectations
    const userAny = updatedUser as any;
    const profilePhoto = userAny?.photos?.find((p: any) => p.type === 'profile');
    const additionalPhotos = userAny?.photos?.filter((p: any) => p.type === 'additional')?.map((p: any) => p.url) || [];

    const responseUser = {
      id: userAny?.id,
      phoneNumber: userAny?.phoneNumber,
      email: userAny?.email,
      name: userAny?.name,
      bio: userAny?.profile?.bio,
      age: userAny?.profile?.age,
      gender: userAny?.profile?.gender,
      height: userAny?.profile?.height,
      currentCity: userAny?.profile?.currentCity,
      pastCity: userAny?.profile?.pastCity,
      photo: profilePhoto?.url,
      additionalPhotos,
      school: userAny?.school ? {
        name: userAny.school.name,
        city: userAny.school.city,
        state: userAny.school.state,
        class: userAny.school.class,
        section: userAny.school.section,
      } : null,
      college: userAny?.college ? {
        name: userAny.college.name,
        department: userAny.college.department,
        location: userAny.college.location,
      } : null,
      office: userAny?.office ? {
        name: userAny.office.name,
        designation: userAny.office.designation,
        department: userAny.office.department,
        location: userAny.office.location,
      } : null,
      homeLocation: (userAny?.profile?.currentCity || userAny?.profile?.pastCity) ? {
        current: userAny?.profile?.currentCity ? { city: userAny.profile.currentCity } : undefined,
        past: userAny?.profile?.pastCity ? { city: userAny.profile.pastCity } : undefined,
      } : null,
      situationResponses: userAny?.personalityResponses,
      isVerified: userAny?.isVerified,
      isOnboarded: userAny?.isOnboarded,
      isDiscoverOnboarded: userAny?.isDiscoverOnboarded,
      createdAt: userAny?.createdAt,
      updatedAt: userAny?.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: responseUser },
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
 * Upload profile picture (initial profile photo - first step of onboarding)
 * POST /api/user/profile-picture
 * 
 * Now uses UserPhoto table instead of User fields
 */
export const uploadProfilePicture = async (req: AuthRequest, res: Response): Promise<void> => {
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
        message: 'No image provided. Please upload a profile picture.',
      });
      return;
    }

    // Get current profile photo to delete later
    const existingPhoto = await prisma.userPhoto.findFirst({
      where: { userId, type: 'profile' },
    });

    // Step 1: Upload to Cloudinary
    let uploadResult;
    try {
      uploadResult = await uploadImageToCloudinary(
        file.buffer,
        userId,
        'profile'
      );
    } catch (uploadError: any) {
      console.error('Cloudinary upload failed:', uploadError);
      res.status(500).json({
        success: false,
        message: 'Failed to upload image. Please try again.',
        error: process.env.NODE_ENV === 'development' ? uploadError.message : undefined,
      });
      return;
    }

    // Step 2: Create or update photo in UserPhoto table
    try {
      let photoRecord;
      if (existingPhoto) {
        // Update existing profile photo
        photoRecord = await prisma.userPhoto.update({
          where: { id: existingPhoto.id },
          data: {
            url: uploadResult.url,
            publicId: uploadResult.publicId,
          },
        });
        // Delete old photo from Cloudinary - non-blocking
        if (existingPhoto.publicId) {
          deleteImageFromCloudinary(existingPhoto.publicId).catch(err => {
            console.error('Failed to delete old profile photo:', err);
          });
        }
      } else {
        // Create new profile photo
        photoRecord = await prisma.userPhoto.create({
          data: {
            userId,
            url: uploadResult.url,
            publicId: uploadResult.publicId,
            type: 'profile',
            order: 0,
          },
        });
      }

      res.status(200).json({
        success: true,
        message: 'Profile picture uploaded successfully',
        data: {
          photo: photoRecord.url,
          userId,
        },
      });
    } catch (dbError: any) {
      console.error('Database update failed:', dbError);
      deleteImageFromCloudinary(uploadResult.publicId).catch(err => {
        console.error('Failed to cleanup uploaded image:', err);
      });

      res.status(500).json({
        success: false,
        message: 'Failed to save profile picture. Please try again.',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined,
      });
      return;
    }
  } catch (error: any) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile picture',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Upload additional photos
 * POST /api/user/photos
 * 
 * Now uses UserPhoto table
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

    // Get current photos count
    const existingPhotos = await prisma.userPhoto.findMany({
      where: { userId, type: 'additional' },
    });

    // Check photo limit (max 10 additional photos)
    if (existingPhotos.length + files.length > 10) {
      res.status(400).json({
        success: false,
        message: `Cannot upload more than 10 additional photos. You have ${existingPhotos.length} photos.`,
      });
      return;
    }

    // Upload to Cloudinary and create UserPhoto records
    const uploadedPhotos: string[] = [];
    let nextOrder = existingPhotos.length > 0 ? Math.max(...existingPhotos.map(p => p.order)) + 1 : 1;

    for (const file of files) {
      const result = await uploadImageToCloudinary(
        file.buffer,
        userId,
        'additional'
      );

      await prisma.userPhoto.create({
        data: {
          userId,
          url: result.url,
          publicId: result.publicId,
          type: 'additional',
          order: nextOrder++,
        },
      });

      uploadedPhotos.push(result.url);
    }

    // Get all photos for response
    const allPhotos = await prisma.userPhoto.findMany({
      where: { userId, type: 'additional' },
      orderBy: { order: 'asc' },
    });

    res.status(200).json({
      success: true,
      message: 'Photos uploaded successfully',
      data: {
        uploadedUrls: uploadedPhotos,
        allPhotos: allPhotos.map(p => p.url),
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
 * 
 * Now uses UserPhoto table
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

    // Get photos sorted by order
    const photos = await prisma.userPhoto.findMany({
      where: { userId, type: 'additional' },
      orderBy: { order: 'asc' },
    });

    if (photoIndex >= photos.length) {
      res.status(404).json({
        success: false,
        message: 'Photo not found',
      });
      return;
    }

    const photoToDelete = photos[photoIndex];

    // Delete from Cloudinary
    if (photoToDelete.publicId) {
      await deleteImagesFromCloudinary([photoToDelete.publicId]);
    }

    // Delete from database
    await prisma.userPhoto.delete({
      where: { id: photoToDelete.id },
    });

    // Get remaining photos
    const remainingPhotos = await prisma.userPhoto.findMany({
      where: { userId, type: 'additional' },
      orderBy: { order: 'asc' },
    });

    res.status(200).json({
      success: true,
      message: 'Photo deleted successfully',
      data: { photos: remainingPhotos.map(p => p.url) },
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
 * 
 * Now uses UserVerification table
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

    // Get current verification record
    const existingVerification = await prisma.userVerification.findUnique({
      where: { userId },
    });

    // Delete old video if exists
    if (existingVerification?.videoPublicId) {
      await deleteImagesFromCloudinary([existingVerification.videoPublicId]);
    }

    // Upload to Cloudinary
    const result = await uploadVideoToCloudinary(
      file.buffer,
      userId,
      'verification'
    );

    // Create or update verification record
    await prisma.userVerification.upsert({
      where: { userId },
      update: {
        videoUrl: result.url,
        videoPublicId: result.publicId,
        status: 'pending',
        updatedAt: new Date(),
      },
      create: {
        userId,
        videoUrl: result.url,
        videoPublicId: result.publicId,
        status: 'pending',
      },
    });

    // Mark user as onboarded (verification video is the final onboarding step)
    await prisma.user.update({
      where: { id: userId },
      data: { isOnboarded: true },
    });

    res.status(200).json({
      success: true,
      message: 'Verification video uploaded successfully',
      data: { videoUrl: result.url },
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
 * 
 * Now uses PersonalityResponse table
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

    // Delete existing responses and insert new ones
    await prisma.personalityResponse.deleteMany({
      where: { userId },
    });

    // Create new responses
    const createdResponses = await Promise.all(
      responses.map((r: any) =>
        prisma.personalityResponse.create({
          data: {
            userId,
            questionId: parseInt(r.questionId) || 0,
            answer: String(r.answer),
          },
        })
      )
    );

    res.status(200).json({
      success: true,
      message: 'Situation responses updated successfully',
      data: { situationResponses: createdResponses },
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
 * 
 * Now builds from normalized tables
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

    // Fetch user with all related data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        photos: { orderBy: { order: 'asc' } },
        verification: true,
        datingPrefs: true,
        school: true,
        college: true,
        office: true,
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

    // Build response matching frontend expectations
    const userAny = user as any;
    const profilePhoto = userAny.photos?.find((p: any) => p.type === 'profile');
    const additionalPhotos = userAny.photos?.filter((p: any) => p.type === 'additional')?.map((p: any) => p.url) || [];

    const responseUser = {
      id: userAny.id,
      phoneNumber: userAny.phoneNumber,
      email: userAny.email,
      name: userAny.name,
      bio: userAny.profile?.bio,
      age: userAny.profile?.age,
      gender: userAny.profile?.gender,
      height: userAny.profile?.height,
      currentCity: userAny.profile?.currentCity,
      pastCity: userAny.profile?.pastCity,
      latitude: userAny.profile?.latitude,
      longitude: userAny.profile?.longitude,
      photo: profilePhoto?.url,
      additionalPhotos,
      verificationVideo: userAny.verification?.videoUrl,
      isVerified: userAny.isVerified,
      isOnboarded: userAny.isOnboarded,
      isDiscoverOnboarded: userAny.isDiscoverOnboarded,
      school: userAny.school,
      college: userAny.college,
      office: userAny.office,
      homeLocation: (userAny.profile?.currentCity || userAny.profile?.pastCity) ? {
        current: userAny.profile?.currentCity ? { city: userAny.profile.currentCity } : undefined,
        past: userAny.profile?.pastCity ? { city: userAny.profile.pastCity } : undefined,
      } : null,
      situationResponses: userAny.personalityResponses,
      datingPrefs: userAny.datingPrefs,
      createdAt: userAny.createdAt,
      updatedAt: userAny.updatedAt,
    };

    res.status(200).json({
      success: true,
      data: { user: responseUser },
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
 * 
 * Now uses UserSchool table
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

    const { name, city, state, class: schoolClass, section } = req.body;

    const school = await prisma.userSchool.upsert({
      where: { userId },
      update: { name, city, state, class: schoolClass, section },
      create: { userId, name, city, state, class: schoolClass, section },
    });

    res.status(200).json({
      success: true,
      message: 'School info updated successfully',
      data: { school },
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
 * 
 * Now uses UserCollege table
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

    const { name, department, location } = req.body;

    const college = await prisma.userCollege.upsert({
      where: { userId },
      update: { name, department, location },
      create: { userId, name, department, location },
    });

    res.status(200).json({
      success: true,
      message: 'College info updated successfully',
      data: { college },
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
 * 
 * Now uses UserOffice table
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

    const { name, designation, department, location } = req.body;

    const office = await prisma.userOffice.upsert({
      where: { userId },
      update: { name, designation, department, location },
      create: { userId, name, designation, department, location },
    });

    res.status(200).json({
      success: true,
      message: 'Office info updated successfully',
      data: { office },
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
 * 
 * Now uses UserProfile table
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

    const { city, country: _country, latitude, longitude } = req.body;

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: {
        currentCity: city,
        latitude: parseFloat(latitude) || null,
        longitude: parseFloat(longitude) || null,
        updatedAt: new Date(),
      },
      create: {
        userId,
        currentCity: city,
        latitude: parseFloat(latitude) || null,
        longitude: parseFloat(longitude) || null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Home location updated successfully',
      data: { homeLocation: { city: profile.currentCity, latitude: profile.latitude, longitude: profile.longitude } },
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

/**
 * Delete user account
 * DELETE /api/user/account
 * 
 * This will:
 * 1. Delete all user's data (messages, matches, swipes, confessions, etc.)
 * 2. Delete user's images/videos from Cloudinary
 * 3. Delete the user record
 */
export const deleteAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    // Get user photos and verification to delete from Cloudinary
    const photos = await prisma.userPhoto.findMany({
      where: { userId },
      select: { publicId: true },
    });

    const verification = await prisma.userVerification.findUnique({
      where: { userId },
      select: { videoPublicId: true },
    });

    // Collect all Cloudinary public IDs to delete
    const publicIdsToDelete: string[] = [];

    for (const photo of photos) {
      if (photo.publicId) {
        publicIdsToDelete.push(photo.publicId);
      }
    }

    if (verification?.videoPublicId) {
      publicIdsToDelete.push(verification.videoPublicId);
    }

    // Delete images/videos from Cloudinary
    if (publicIdsToDelete.length > 0) {
      try {
        await deleteImagesFromCloudinary(publicIdsToDelete);
        console.log(`Deleted ${publicIdsToDelete.length} media files from Cloudinary for user ${userId}`);
      } catch (cloudinaryError) {
        console.error('Error deleting media from Cloudinary:', cloudinaryError);
        // Continue with account deletion even if Cloudinary deletion fails
      }
    }

    // Delete user and all related data (cascade deletes will handle related records)
    // Prisma will automatically delete:
    // - Messages (via chatRoom relation)
    // - Matches (via user relations)
    // - Swipes (via user relations)
    // - Confessions (via userId)
    // - ChatRooms (via match relation)
    // - Calls (via chatRoom relation)
    // - Referrals (via referrer/referred relations)
    // - Rewards (via userId)
    await prisma.user.delete({
      where: { id: userId },
    });

    console.log(`Account deleted successfully for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Save dating preferences (for discover onboarding)
 * POST /api/user/dating-preferences
 */
export const saveDatingPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
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
      relationshipType,
      datingIntention,
      genderPreference,
      ageMin,
      ageMax,
      distanceMax,
      children,
      familyPlans,
      smoking,
      drinking,
      drugs,
      politics,
      education,
    } = req.body;

    // Check if preferences already exist
    const existingPrefs = await prisma.datingPreferences.findUnique({
      where: { userId },
    });

    let preferences;
    if (existingPrefs) {
      // Update existing preferences
      preferences = await prisma.datingPreferences.update({
        where: { userId },
        data: {
          relationshipType: relationshipType || 'open_to_all',
          datingIntention: datingIntention || 'open_to_all',
          genderPreference: genderPreference || ['all'],
          ageMin: ageMin || 18,
          ageMax: ageMax || 50,
          distanceMax: distanceMax || 50,
          children,
          familyPlans,
          smoking,
          drinking,
          drugs,
          politics,
          education,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new preferences
      preferences = await prisma.datingPreferences.create({
        data: {
          userId,
          relationshipType: relationshipType || 'open_to_all',
          datingIntention: datingIntention || 'open_to_all',
          genderPreference: genderPreference || ['all'],
          ageMin: ageMin || 18,
          ageMax: ageMax || 50,
          distanceMax: distanceMax || 50,
          children,
          familyPlans,
          smoking,
          drinking,
          drugs,
          politics,
          education,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Dating preferences saved successfully',
      data: { preferences },
    });
  } catch (error: any) {
    console.error('Save dating preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save dating preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Complete discover onboarding
 * POST /api/user/complete-discover-onboarding
 * 
 * Marks the user as having completed the discover section onboarding
 */
export const completeDiscoverOnboarding = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    // Update user to mark discover onboarding as complete
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isDiscoverOnboarded: true,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        isDiscoverOnboarded: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Discover onboarding completed',
      data: { isDiscoverOnboarded: updatedUser.isDiscoverOnboarded },
    });
  } catch (error: any) {
    console.error('Complete discover onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete discover onboarding',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get dating preferences
 * GET /api/user/dating-preferences
 */
export const getDatingPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const preferences = await prisma.datingPreferences.findUnique({
      where: { userId },
    });

    res.status(200).json({
      success: true,
      data: { preferences },
    });
  } catch (error: any) {
    console.error('Get dating preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dating preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
