import { Router } from 'express';
import {
    recordSwipe,
    getSwipeProfiles,
    getMatches,
    getMatchById,
    unmatchUser,
} from '../controller/swipe.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// All swipe routes require authentication
router.use(protect);

// Record a swipe action
// POST /api/swipe
router.post('/', recordSwipe);

// Get profiles available to swipe on
// GET /api/swipe/profiles
router.get('/profiles', getSwipeProfiles);

// Get all matches
// GET /api/swipe/matches
router.get('/matches', getMatches);

// Get single match by ID
// GET /api/swipe/matches/:matchId
router.get('/matches/:matchId', getMatchById);

// Unmatch a user
// DELETE /api/swipe/matches/:matchId
router.delete('/matches/:matchId', unmatchUser);

export default router;
