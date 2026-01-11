import { Router } from 'express';
import { protect as authMiddleware } from '../middleware/auth.middleware';
import { initiateCall, endCall, answerCall, declineCall } from '../controller/call.controller';

const router = Router();

// All call routes require authentication
router.use(authMiddleware);

// POST /api/calls/initiate - Start a new call
router.post('/initiate', initiateCall);

// PUT /api/calls/:id/answer - Answer an incoming call
router.put('/:id/answer', answerCall);

// PUT /api/calls/:id/decline - Decline an incoming call
router.put('/:id/decline', declineCall);

// PUT /api/calls/:id/end - End an active call
router.put('/:id/end', endCall);

export default router;
