import { Router } from 'express';
import { getReferralStats, redeemReward } from '../controller/referral.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// Protect all routes
router.use(protect);

router.get('/stats', getReferralStats);
router.post('/redeem', redeemReward);

export default router;
