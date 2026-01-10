import { Router } from 'express';
import {
    uploadVerificationPhoto,
    verifyLivenessVideo,
    getVerificationStatus,
} from '../controller/verification.controller';
import { protect } from '../middleware/auth.middleware';
import {
    uploadVerificationPhoto as uploadPhotoMiddleware,
    uploadVerificationVideo as uploadVideoMiddleware,
    handleVerificationUploadError,
} from '../middleware/upload.middleware';

const router = Router();

// All verification routes require authentication
router.use(protect);

// Step 1: Upload profile photo for face detection
// POST /api/verification/photo
router.post(
    '/photo',
    uploadPhotoMiddleware,
    handleVerificationUploadError,
    uploadVerificationPhoto
);

// Step 2: Liveness verification with selfie video
// POST /api/verification/liveness
router.post(
    '/liveness',
    uploadVideoMiddleware,
    handleVerificationUploadError,
    verifyLivenessVideo
);

// Get current verification status
// GET /api/verification/status
router.get('/status', getVerificationStatus);

export default router;
