import { Response } from 'express';
import { AuthRequest } from '../types';
import {
    registerFcmToken,
    unregisterFcmToken,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
} from '../services/notification.service';

/**
 * Register FCM token for push notifications
 * POST /api/notifications/register
 */
export const registerToken = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const { token, platform, deviceId } = req.body;

        if (!token || !platform) {
            res.status(400).json({
                success: false,
                message: 'Token and platform are required',
            });
            return;
        }

        if (!['android', 'ios', 'web'].includes(platform)) {
            res.status(400).json({
                success: false,
                message: 'Platform must be android, ios, or web',
            });
            return;
        }

        await registerFcmToken(userId, token, platform, deviceId);

        res.status(200).json({
            success: true,
            message: 'FCM token registered successfully',
        });
    } catch (error: any) {
        console.error('Register token error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to register token',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Unregister FCM token (on logout)
 * DELETE /api/notifications/unregister
 */
export const unregisterToken = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const { token } = req.body;

        if (!token) {
            res.status(400).json({
                success: false,
                message: 'Token is required',
            });
            return;
        }

        await unregisterFcmToken(token);

        res.status(200).json({
            success: true,
            message: 'FCM token unregistered successfully',
        });
    } catch (error: any) {
        console.error('Unregister token error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unregister token',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Get notifications (paginated)
 * GET /api/notifications
 */
export const getNotificationList = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const result = await getNotifications(userId, page, limit);

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error: any) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get notifications',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
export const getUnreadNotificationCount = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const count = await getUnreadCount(userId);

        res.status(200).json({
            success: true,
            data: { count },
        });
    } catch (error: any) {
        console.error('Get unread count error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get unread count',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Mark a notification as read
 * PUT /api/notifications/:id/read
 */
export const markNotificationAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const notificationId = parseInt(req.params.id);
        if (isNaN(notificationId)) {
            res.status(400).json({
                success: false,
                message: 'Invalid notification ID',
            });
            return;
        }

        const success = await markAsRead(notificationId, userId);

        if (!success) {
            res.status(404).json({
                success: false,
                message: 'Notification not found',
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: 'Notification marked as read',
        });
    } catch (error: any) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notification as read',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        await markAllAsRead(userId);

        res.status(200).json({
            success: true,
            message: 'All notifications marked as read',
        });
    } catch (error: any) {
        console.error('Mark all as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark all notifications as read',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};
