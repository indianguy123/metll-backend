import { Router } from 'express';
import {
    getHostSession,
    optInToHost,
    optOutOfHost,
    submitHostAnswer,
    getHostMessages,
    exitHost,
} from '../controller/host.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// All host routes require authentication
router.use(protect);

// Get host session
router.get('/:matchId', getHostSession);

// Opt-in to host
router.post('/:matchId/opt-in', optInToHost);

// Opt-out of host
router.post('/:matchId/opt-out', optOutOfHost);

// Submit answer to host question
router.post('/:matchId/answer', submitHostAnswer);

// Get host messages
router.get('/:matchId/messages', getHostMessages);

// Exit host session
router.post('/:matchId/exit', exitHost);

export default router;

