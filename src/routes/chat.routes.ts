import { Router } from 'express';
import {
    getChatRoom,
    sendMessage,
    markMessagesAsRead,
    uploadMedia
} from '../controller/chat.controller';
import { protect } from '../middleware/auth.middleware';
import { uploadChatMedia } from '../middleware/upload.middleware';

const router = Router();

// All chat routes require authentication
router.use(protect);

// Get chat room with messages
// GET /api/chat/:matchId
router.get('/:matchId', getChatRoom);

// Send a message (HTTP fallback)
// POST /api/chat/:matchId/messages
router.post('/:matchId/messages', sendMessage);

// Mark messages as read
// PUT /api/chat/:matchId/read
router.put('/:matchId/read', markMessagesAsRead);

// Upload chat media
// POST /api/chat/upload
router.post('/upload', uploadChatMedia, uploadMedia);

export default router;
