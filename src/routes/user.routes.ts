import { Router } from 'express';
import {
  updateUserProfile,
  getUserProfile,
  uploadProfilePicture,
  uploadAdditionalPhotos,
  deleteAdditionalPhoto,
  uploadVerificationVideo as uploadVerificationVideoHandler,
  updateSituationResponses,
  updateSchool,
  updateCollege,
  updateOffice,
  updateHomeLocation,
} from '../controller/user.controller';
import { protect } from '../middleware/auth.middleware';
import {
  uploadProfileImages,
  uploadVerificationPhoto,
  uploadVerificationVideo as uploadVerificationVideoMiddleware,
  handleUploadError,
  handleVerificationUploadError,
} from '../middleware/upload.middleware';

const router = Router();

// All routes are protected
router.use(protect);

// Profile routes
router.get('/profile', getUserProfile);
router.put('/profile', updateUserProfile);

// Profile picture (initial photo - first step of onboarding)
router.post('/profile-picture', uploadVerificationPhoto, handleVerificationUploadError, uploadProfilePicture);

// Additional photos (6 photos, 3 required - later step)
router.post('/photos', uploadProfileImages, handleUploadError, uploadAdditionalPhotos);
router.delete('/photos/:index', deleteAdditionalPhoto);

// Verification video
router.post('/verification-video', uploadVerificationVideoMiddleware, handleVerificationUploadError, uploadVerificationVideoHandler);

// Situation responses (personality questions)
router.put('/situation-responses', updateSituationResponses);

// Location/background info routes
router.put('/school', updateSchool);
router.put('/college', updateCollege);
router.put('/office', updateOffice);
router.put('/home-location', updateHomeLocation);

export default router;
