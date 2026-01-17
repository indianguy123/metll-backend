import prisma from '../config/database.config';
import { getMessaging } from '../config/firebase.config';
import admin from 'firebase-admin';

// Notification types enum
export const NotificationType = {
    MATCH: 'match',
    MESSAGE: 'message',
    VOICE_NOTE: 'voice_note',
    CALL: 'call',
    LIKE: 'like',
    PROFILE_VIEW: 'profile_view',
    REFERRAL_REWARD: 'referral_reward',
    REWARD_USED: 'reward_used',
    UNMATCH: 'unmatch',
    REPORT: 'report',
} as const;

export type NotificationTypeValue = typeof NotificationType[keyof typeof NotificationType];

export interface NotificationPayload {
    type: NotificationTypeValue;
    title: string;
    body: string;
    data?: Record<string, string>;
    imageUrl?: string;
    priority?: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Register an FCM token for a user
 */
export const registerFcmToken = async (
    userId: number,
    token: string,
    platform: 'android' | 'ios' | 'web',
    deviceId?: string
): Promise<void> => {
    try {
        // Upsert token (update if exists, create if not)
        await prisma.fcmToken.upsert({
            where: { token },
            update: {
                userId,
                platform,
                deviceId,
                updatedAt: new Date(),
            },
            create: {
                userId,
                token,
                platform,
                deviceId,
            },
        });
        console.log(`✅ FCM token registered for user ${userId} (${platform})`);
    } catch (error) {
        console.error('❌ Failed to register FCM token:', error);
        throw error;
    }
};

/**
 * Unregister an FCM token
 */
export const unregisterFcmToken = async (token: string): Promise<void> => {
    try {
        await prisma.fcmToken.deleteMany({
            where: { token },
        });
        console.log(`✅ FCM token unregistered`);
    } catch (error) {
        console.error('❌ Failed to unregister FCM token:', error);
        throw error;
    }
};

/**
 * Send push notification to a single user
 */
export const sendPushNotification = async (
    userId: number,
    notification: NotificationPayload,
    saveInApp: boolean = true
): Promise<boolean> => {
    const messaging = getMessaging();

    // Save in-app notification first
    let savedNotification = null;
    if (saveInApp) {
        savedNotification = await createInAppNotification(userId, notification);
    }

    if (!messaging) {
        console.warn('⚠️ Firebase Messaging not initialized. Push notification skipped.');
        return false;
    }

    try {
        // Get all FCM tokens for user
        const tokens = await prisma.fcmToken.findMany({
            where: { userId },
            select: { token: true, platform: true },
        });

        if (tokens.length === 0) {
            console.log(`ℹ️ No FCM tokens found for user ${userId}`);
            return false;
        }

        // Prepare FCM message
        const fcmMessage: admin.messaging.MulticastMessage = {
            tokens: tokens.map(t => t.token),
            notification: {
                title: notification.title,
                body: notification.body,
                imageUrl: notification.imageUrl,
            },
            data: {
                type: notification.type,
                notificationId: savedNotification?.id?.toString() || '',
                ...notification.data,
            },
            android: {
                priority: notification.priority === 'critical' ? 'high' : 'high',
                notification: {
                    channelId: getChannelId(notification.priority),
                    priority: notification.priority === 'critical' ? 'max' : 'high',
                    defaultSound: true,
                    defaultVibrateTimings: true,
                },
            },
            apns: {
                payload: {
                    aps: {
                        alert: {
                            title: notification.title,
                            body: notification.body,
                        },
                        sound: 'default',
                        badge: 1,
                    },
                },
            },
        };

        // Send multicast message
        const response = await messaging.sendEachForMulticast(fcmMessage);

        console.log(`📤 Push sent to user ${userId}: ${response.successCount} success, ${response.failureCount} failed`);

        // Clean up invalid tokens
        if (response.failureCount > 0) {
            const tokensToRemove: string[] = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    if (
                        errorCode === 'messaging/invalid-registration-token' ||
                        errorCode === 'messaging/registration-token-not-registered'
                    ) {
                        tokensToRemove.push(tokens[idx].token);
                    }
                }
            });

            if (tokensToRemove.length > 0) {
                await prisma.fcmToken.deleteMany({
                    where: { token: { in: tokensToRemove } },
                });
                console.log(`🧹 Cleaned up ${tokensToRemove.length} invalid tokens`);
            }
        }

        // Mark notification as sent
        if (savedNotification && response.successCount > 0) {
            await prisma.notification.update({
                where: { id: savedNotification.id },
                data: { isSent: true },
            });
        }

        return response.successCount > 0;
    } catch (error) {
        console.error('❌ Failed to send push notification:', error);
        return false;
    }
};

/**
 * Send push notification to multiple users
 */
export const sendMultiplePushNotifications = async (
    userIds: number[],
    notification: NotificationPayload,
    saveInApp: boolean = true
): Promise<void> => {
    // Send in parallel but limit concurrency
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        await Promise.all(
            batch.map(userId => sendPushNotification(userId, notification, saveInApp))
        );
    }
};

/**
 * Create an in-app notification (without push)
 */
export const createInAppNotification = async (
    userId: number,
    notification: NotificationPayload
) => {
    try {
        const created = await prisma.notification.create({
            data: {
                userId,
                type: notification.type,
                title: notification.title,
                body: notification.body,
                data: notification.data || {},
                imageUrl: notification.imageUrl,
                priority: notification.priority || 'high',
            },
        });
        return created;
    } catch (error) {
        console.error('❌ Failed to create in-app notification:', error);
        return null;
    }
};

/**
 * Get unread notifications for a user
 */
export const getUnreadNotifications = async (
    userId: number,
    limit: number = 50
) => {
    return prisma.notification.findMany({
        where: { userId, isRead: false },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });
};

/**
 * Get all notifications for a user (paginated)
 */
export const getNotifications = async (
    userId: number,
    page: number = 1,
    limit: number = 20
) => {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        prisma.notification.count({
            where: { userId },
        }),
    ]);

    return {
        notifications,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (userId: number): Promise<number> => {
    return prisma.notification.count({
        where: { userId, isRead: false },
    });
};

/**
 * Mark a notification as read
 */
export const markAsRead = async (notificationId: number, userId: number): Promise<boolean> => {
    try {
        await prisma.notification.updateMany({
            where: { id: notificationId, userId },
            data: { isRead: true },
        });
        return true;
    } catch (error) {
        console.error('❌ Failed to mark notification as read:', error);
        return false;
    }
};

/**
 * Mark all notifications as read for a user
 */
export const markAllAsRead = async (userId: number): Promise<boolean> => {
    try {
        await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
        return true;
    } catch (error) {
        console.error('❌ Failed to mark all notifications as read:', error);
        return false;
    }
};

/**
 * Get Android notification channel ID based on priority
 */
const getChannelId = (priority?: string): string => {
    switch (priority) {
        case 'critical':
            return 'metll_critical';
        case 'high':
            return 'metll_high';
        case 'medium':
            return 'metll_medium';
        case 'low':
            return 'metll_low';
        default:
            return 'metll_default';
    }
};

// ==========================================
// Convenience notification helpers
// ==========================================

export const notifyNewMatch = async (
    userId: number,
    matchedUserName: string,
    matchId: number,
    matchedUserImage?: string
) => {
    return sendPushNotification(userId, {
        type: NotificationType.MATCH,
        title: "It's a Match! 🎉",
        body: `${matchedUserName} matched with you!`,
        data: { matchId: matchId.toString() },
        imageUrl: matchedUserImage,
        priority: 'critical',
    });
};

export const notifyNewMessage = async (
    userId: number,
    senderName: string,
    messagePreview: string,
    matchId: number,
    senderImage?: string
) => {
    // Truncate message preview
    const preview = messagePreview.length > 50
        ? messagePreview.substring(0, 47) + '...'
        : messagePreview;

    return sendPushNotification(userId, {
        type: NotificationType.MESSAGE,
        title: senderName,
        body: preview,
        data: { matchId: matchId.toString() },
        imageUrl: senderImage,
        priority: 'high',
    });
};

export const notifyVoiceNote = async (
    userId: number,
    senderName: string,
    matchId: number,
    senderImage?: string
) => {
    return sendPushNotification(userId, {
        type: NotificationType.VOICE_NOTE,
        title: 'Voice Message 🎤',
        body: `New voice message from ${senderName}`,
        data: { matchId: matchId.toString() },
        imageUrl: senderImage,
        priority: 'high',
    });
};

export const notifyIncomingCall = async (
    userId: number,
    callerName: string,
    callId: number,
    callType: 'voice' | 'video',
    callerImage?: string
) => {
    return sendPushNotification(userId, {
        type: NotificationType.CALL,
        title: `Incoming ${callType === 'video' ? 'Video' : ''} Call 📞`,
        body: `${callerName} is calling you`,
        data: {
            callId: callId.toString(),
            callType,
        },
        imageUrl: callerImage,
        priority: 'critical',
    });
};

export const notifyNewLike = async (
    userId: number,
    likeCount: number = 1
) => {
    const body = likeCount === 1
        ? 'Someone likes you! Check who it is 👀'
        : `${likeCount} new likes! Check who they are 👀`;

    return sendPushNotification(userId, {
        type: NotificationType.LIKE,
        title: 'New Like ❤️',
        body,
        priority: 'medium',
    });
};

export const notifyReferralReward = async (
    userId: number,
    referredUserName: string
) => {
    return sendPushNotification(userId, {
        type: NotificationType.REFERRAL_REWARD,
        title: 'You earned a reward! ☕',
        body: `${referredUserName} joined using your code. Enjoy a free coffee date!`,
        priority: 'high',
    });
};

export const notifyRewardUsed = async (userId: number) => {
    return sendPushNotification(userId, {
        type: NotificationType.REWARD_USED,
        title: 'Reward Activated! 🎁',
        body: 'Your coffee date reward has been activated. Enjoy!',
        priority: 'medium',
    });
};

export const notifyUnmatch = async (
    userId: number,
    unmatchedUserName: string
) => {
    return sendPushNotification(userId, {
        type: NotificationType.UNMATCH,
        title: 'Match Ended 💔',
        body: `${unmatchedUserName} unmatched with you`,
        priority: 'low',
    }, false); // Don't save unmatch notifications to avoid clutter
};

export const notifyReportSubmitted = async (userId: number) => {
    return sendPushNotification(userId, {
        type: NotificationType.REPORT,
        title: 'Report Received 🛡️',
        body: "We've received your report. Our team will review it within 24 hours.",
        priority: 'medium',
    });
};

export const notifyProfileView = async (
    userId: number,
    viewerName: string,
    viewerImage?: string
) => {
    return sendPushNotification(userId, {
        type: NotificationType.PROFILE_VIEW,
        title: 'Profile Viewed 👀',
        body: `${viewerName} viewed your profile`,
        imageUrl: viewerImage,
        priority: 'low',
    });
};
