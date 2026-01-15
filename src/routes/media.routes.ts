import { Router } from 'express';
import {
    uploadVoiceNote,
    searchGifs,
    getTrendingGifs,
    sendVoiceNoteMessage,
    sendGifMessage
} from '../controller/media.controller';
import { protect } from '../middleware/auth.middleware';
import multer from 'multer';

const router = Router();

// Configure multer for audio files
const storage = multer.memoryStorage();
const uploadAudio = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit for voice notes
    },
    fileFilter: (_req, file, cb) => {
        // Accept audio files
        if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/octet-stream') {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed'));
        }
    },
}).single('audio');

// All media routes require authentication
router.use(protect);

// Voice Note Routes
// Upload voice note (returns URL and duration)
// POST /api/media/voice-note
router.post('/voice-note', uploadAudio, uploadVoiceNote);

// Send voice note message to a chat
// POST /api/media/voice-note/send
router.post('/voice-note/send', sendVoiceNoteMessage);

// GIF Routes
// Search GIFs
// GET /api/media/gifs/search?q=query&limit=20&offset=0
router.get('/gifs/search', searchGifs);

// Get trending GIFs
// GET /api/media/gifs/trending?limit=20&offset=0
router.get('/gifs/trending', getTrendingGifs);

// Send GIF message to a chat
// POST /api/media/gif/send
router.post('/gif/send', sendGifMessage);

export default router;
