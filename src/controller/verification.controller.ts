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

        // Step 2: Get current user to check for existing profile photo
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { profilePhotoPublicId: true },
        });

        // Delete old profile photo if exists
        if (currentUser?.profilePhotoPublicId) {
            await deleteImageFromCloudinary(currentUser.profilePhotoPublicId);
        }

        // Step 3: Upload to Cloudinary
        const uploadResult = await uploadImageToCloudinary(imageBuffer, userId, 'verification');

        // Step 4: Update user in database
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                profilePhoto: uploadResult.url,
                profilePhotoPublicId: uploadResult.publicId,
                verificationStatus: 'photo_uploaded',
                faceId: null, // Reset faceId on new photo upload
                verificationScore: null,
                isVerified: false, // Reset verification on new photo
            },
            select: {
                id: true,
                profilePhoto: true,
                verificationStatus: true,
                isVerified: true,
            },
        });

        res.status(200).json({
            success: true,
            message: 'Photo uploaded successfully. Face detected with good quality.',
            data: {
                profilePhoto: updatedUser.profilePhoto,
                verificationStatus: updatedUser.verificationStatus,
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

        // Get user with profile photo
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                profilePhoto: true,
                verificationStatus: true,
            },
        });

        if (!user?.profilePhoto) {
            res.status(400).json({
                success: false,
                message: 'Please upload a profile photo first before liveness verification.',
            });
            return;
        }

        if (user.verificationStatus !== 'photo_uploaded' && user.verificationStatus !== 'liveness_pending') {
            res.status(400).json({
                success: false,
                message: `Invalid verification status: ${user.verificationStatus}. Please upload a profile photo first.`,
            });
            return;
        }

        const videoBuffer = req.file.buffer;

        // Download profile photo for comparison
        const profilePhotoBuffer = await downloadImage(user.profilePhoto);

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
            await prisma.user.update({
                where: { id: userId },
                data: {
                    verificationStatus: 'liveness_pending',
                },
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
            await prisma.user.update({
                where: { id: userId },
                data: {
                    verificationStatus: 'failed',
                    verificationScore: livenessResult.similarity,
                    verificationDate: new Date(),
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
        try {
            const videoUploadResult = await uploadVideoToCloudinary(videoBuffer, userId, 'liveness');
            videoUrl = videoUploadResult.url;
        } catch (uploadError) {
            console.error('Failed to upload verification video:', uploadError);
            // Continue even if video upload fails
        }

        // Generate liveness session ID
        const livenessSessionId = `liveness_${userId}_${Date.now()}`;

        // Update user as verified
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                isVerified: true,
                verificationStatus: 'verified',
                verificationScore: livenessResult.similarity,
                verificationDate: new Date(),
                livenessSessionId,
            },
            select: {
                id: true,
                isVerified: true,
                verificationStatus: true,
                verificationScore: true,
                verificationDate: true,
            },
        });

        res.status(200).json({
            success: true,
            message: 'Congratulations! Your identity has been verified.',
            data: {
                isVerified: updatedUser.isVerified,
                verificationStatus: updatedUser.verificationStatus,
                verificationScore: updatedUser.verificationScore,
                verificationDate: updatedUser.verificationDate,
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
            select: {
                profilePhoto: true,
                isVerified: true,
                verificationStatus: true,
                verificationScore: true,
                verificationDate: true,
            },
        });

        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        // Determine next step based on status
        let nextStep: string | null = null;
        let progress = 0;

        switch (user.verificationStatus) {
            case null:
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
                profilePhoto: user.profilePhoto,
                isVerified: user.isVerified,
                verificationStatus: user.verificationStatus || 'pending',
                verificationScore: user.verificationScore,
                verificationDate: user.verificationDate,
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
