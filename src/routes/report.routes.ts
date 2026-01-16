import express from 'express';
import { submitReport } from '../controller/report.controller';
import { protect } from '../middleware/auth.middleware';

const router = express.Router();

// Report a user
router.post('/', protect, submitReport);

export default router;
