import { Router } from 'express';
import {
  createConfession,
  getConfessions,
} from '../controller/confession.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// All confession routes are protected
router.post('/', protect, createConfession);
router.get('/', protect, getConfessions);

export default router;

