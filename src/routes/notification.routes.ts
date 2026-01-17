import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import {
    registerToken,
    unregisterToken,
    getNotificationList,
    getUnreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
} from '../controller/notification.controller';

const router = Router();

// All routes require authentication
router.use(protect);

// FCM Token management
router.post('/register', registerToken);
router.delete('/unregister', unregisterToken);

// Notification management
router.get('/', getNotificationList);
router.get('/unread-count', getUnreadNotificationCount);
router.put('/read-all', markAllNotificationsAsRead);
router.put('/:id/read', markNotificationAsRead);

export default router;
