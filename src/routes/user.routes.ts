import { Router } from 'express';
import {
  updateUserProfile,
  getUserProfile,
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

// Photo routes
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
