import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';
import {
    uploadImageToCloudinary,
    uploadVideoToCloudinary,
    deleteImageFromCloudinary,
} from '../services/cloudinary.service';
import {
    detectFaces,
    verifyLiveness,
} from '../services/rekognition.service';
import https from 'https';
import http from 'http';

/**
 * Upload profile photo for verification
 * POST /api/verification/photo
 * 
 * Step 1 of verification:
 * 1. Validate image (JPG/PNG, < 5MB)
 * 2. AWS Rekognition DetectFaces → Exactly 1 clear face
 * 3. Upload to Cloudinary → Store URL
 * 4. Update user verification status
 */
export const uploadVerificationPhoto = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        // Check if file was uploaded
        if (!req.file) {
            res.status(400).json({
                success: false,
                message: 'No photo provided. Please upload a JPG or PNG image.',
            });
            return;
        }

        const imageBuffer = req.file.buffer;

        // Step 1: Detect face using AWS Rekognition
        const faceDetectionResult = await detectFaces(imageBuffer);

        if (!faceDetectionResult.success) {
            res.status(400).json({
                success: false,
                message: faceDetectionResult.message,
                details: {
                    faceCount: faceDetectionResult.faceCount,
                    qualityScore: faceDetectionResult.qualityScore,
                },
            });
            return;
        }

        // Step 2: Get current profile photo to check for existing
        const existingPhoto = await prisma.userPhoto.findFirst({
            where: { userId, type: 'profile' },
        });

        // Delete old profile photo if exists
        if (existingPhoto?.publicId) {
            await deleteImageFromCloudinary(existingPhoto.publicId);
        }

        // Step 3: Upload to Cloudinary
        const uploadResult = await uploadImageToCloudinary(imageBuffer, userId, 'verification');

        // Step 4: Upsert profile photo in UserPhoto table
        if (existingPhoto) {
            await prisma.userPhoto.update({
                where: { id: existingPhoto.id },
                data: {
                    url: uploadResult.url,
                    publicId: uploadResult.publicId,
                },
            });
        } else {
            await prisma.userPhoto.create({
                data: {
                    userId,
                    url: uploadResult.url,
                    publicId: uploadResult.publicId,
                    type: 'profile',
                    order: 0,
                },
            });
        }

        // Step 5: Update/create verification record
        await prisma.userVerification.upsert({
            where: { userId },
            update: {
                status: 'photo_uploaded',
                score: null,
            },
            create: {
                userId,
                status: 'photo_uploaded',
            },
        });

        // Reset user verification status
        await prisma.user.update({
            where: { id: userId },
            data: { isVerified: false },
        });

        res.status(200).json({
            success: true,
            message: 'Photo uploaded successfully. Face detected with good quality.',
            data: {
                profilePhoto: uploadResult.url,
                verificationStatus: 'photo_uploaded',
                qualityScore: faceDetectionResult.qualityScore,
                nextStep: 'liveness',
            },
        });
    } catch (error: any) {
        console.error('Verification photo upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload verification photo. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Liveness verification with selfie video
 * POST /api/verification/liveness
 * 
 * Step 2 of verification:
 * 1. Validate video (MP4, 3-10 seconds, < 20MB)
 * 2. Extract key frames from video
 * 3. Compare frames with profile photo
 * 4. If similarity >= 95% → Mark as verified
 */
export const verifyLivenessVideo = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        // Check if video was uploaded
        if (!req.file) {
            res.status(400).json({
                success: false,
                message: 'No video provided. Please upload an MP4 video.',
            });
            return;
        }

        // Get profile photo from UserPhoto table
        const profilePhoto = await prisma.userPhoto.findFirst({
            where: { userId, type: 'profile' },
        });

        // Get verification record
        const verification = await prisma.userVerification.findUnique({
            where: { userId },
        });

        if (!profilePhoto) {
            res.status(400).json({
                success: false,
                message: 'Please upload a profile photo first before liveness verification.',
            });
            return;
        }

        const verificationStatus = verification?.status || 'pending';
        if (verificationStatus !== 'photo_uploaded' && verificationStatus !== 'liveness_pending') {
            res.status(400).json({
                success: false,
                message: `Invalid verification status: ${verificationStatus}. Please upload a profile photo first.`,
            });
            return;
        }

        const videoBuffer = req.file.buffer;

        // Download profile photo for comparison
        const profilePhotoBuffer = await downloadImage(profilePhoto.url);

        if (!profilePhotoBuffer) {
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve profile photo for comparison.',
            });
            return;
        }

        // Perform liveness verification
        const livenessResult = await verifyLiveness(profilePhotoBuffer, videoBuffer);

        if (!livenessResult.success) {
            // Update status to pending if failed
            await prisma.userVerification.upsert({
                where: { userId },
                update: { status: 'liveness_pending' },
                create: { userId, status: 'liveness_pending' },
            });

            res.status(400).json({
                success: false,
                message: livenessResult.message,
                data: {
                    similarity: livenessResult.similarity,
                    required: 95,
                },
            });
            return;
        }

        if (!livenessResult.isMatch) {
            // Failed verification due to low similarity
            await prisma.userVerification.upsert({
                where: { userId },
                update: {
                    status: 'failed',
                    score: livenessResult.similarity,
                    verifiedAt: new Date(),
                },
                create: {
                    userId,
                    status: 'failed',
                    score: livenessResult.similarity,
                    verifiedAt: new Date(),
                },
            });

            res.status(400).json({
                success: false,
                message: livenessResult.message,
                data: {
                    similarity: livenessResult.similarity,
                    required: 95,
                    verificationStatus: 'failed',
                },
            });
            return;
        }

        // Upload verification video to Cloudinary (optional - for audit)
        let videoUrl: string | null = null;
        let videoPublicId: string | null = null;
        try {
            const videoUploadResult = await uploadVideoToCloudinary(videoBuffer, userId, 'liveness');
            videoUrl = videoUploadResult.url;
            videoPublicId = videoUploadResult.publicId;
        } catch (uploadError) {
            console.error('Failed to upload verification video:', uploadError);
            // Continue even if video upload fails
        }

        // Update user as verified
        await prisma.user.update({
            where: { id: userId },
            data: { isVerified: true },
        });

        // Update verification record
        const updatedVerification = await prisma.userVerification.upsert({
            where: { userId },
            update: {
                status: 'verified',
                score: livenessResult.similarity,
                verifiedAt: new Date(),
                videoUrl,
                videoPublicId,
            },
            create: {
                userId,
                status: 'verified',
                score: livenessResult.similarity,
                verifiedAt: new Date(),
                videoUrl,
                videoPublicId,
            },
        });

        res.status(200).json({
            success: true,
            message: 'Congratulations! Your identity has been verified.',
            data: {
                isVerified: true,
                verificationStatus: updatedVerification.status,
                verificationScore: updatedVerification.score,
                verificationDate: updatedVerification.verifiedAt,
                videoUrl,
            },
        });
    } catch (error: any) {
        console.error('Liveness verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify liveness. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Get verification status
 * GET /api/verification/status
 */
export const getVerificationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { isVerified: true },
        });

        const profilePhoto = await prisma.userPhoto.findFirst({
            where: { userId, type: 'profile' },
        });

        const verification = await prisma.userVerification.findUnique({
            where: { userId },
        });

        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        const verificationStatus = verification?.status || 'pending';

        // Determine next step based on status
        let nextStep: string | null = null;
        let progress = 0;

        switch (verificationStatus) {
            case 'pending':
                nextStep = 'photo';
                progress = 0;
                break;
            case 'photo_uploaded':
                nextStep = 'liveness';
                progress = 50;
                break;
            case 'liveness_pending':
                nextStep = 'liveness';
                progress = 50;
                break;
            case 'failed':
                nextStep = 'photo'; // Start over
                progress = 0;
                break;
            case 'verified':
                nextStep = null;
                progress = 100;
                break;
        }

        res.status(200).json({
            success: true,
            data: {
                profilePhoto: profilePhoto?.url || null,
                isVerified: user.isVerified,
                verificationStatus,
                verificationScore: verification?.score || null,
                verificationDate: verification?.verifiedAt || null,
                nextStep,
                progress,
            },
        });
    } catch (error: any) {
        console.error('Get verification status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get verification status.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Helper function to download image from URL to buffer
 */
const downloadImage = (url: string): Promise<Buffer | null> => {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                console.error('Failed to download image, status:', response.statusCode);
                resolve(null);
                return;
            }

            const chunks: Buffer[] = [];

            response.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            response.on('end', () => {
                resolve(Buffer.concat(chunks));
            });

            response.on('error', (err) => {
                console.error('Error downloading image:', err);
                resolve(null);
            });
        }).on('error', (err) => {
            console.error('Error downloading image:', err);
            resolve(null);
        });
    });
};
