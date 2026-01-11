import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';
import { getSocketIO } from '../config/socket.config';
import { uploadImageToCloudinary, uploadVideoToCloudinary } from '../services/cloudinary.service';

/**
 * Get chat room with messages
 * GET /api/chat/:matchId
 */
export const getChatRoom = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const matchId = parseInt(req.params.matchId);
        if (isNaN(matchId)) {
            res.status(400).json({ success: false, message: 'Invalid match ID.' });
            return;
        }

        // Get match and verify user is part of it
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: {
                user1: {
                    select: {
                        id: true,
                        name: true,
                        images: true,
                        profilePhoto: true,
                        isVerified: true,
                    },
                },
                user2: {
                    select: {
                        id: true,
                        name: true,
                        images: true,
                        profilePhoto: true,
                        isVerified: true,
                    },
                },
                chatRoom: {
                    include: {
                        messages: {
                            orderBy: { createdAt: 'asc' },
                            include: {
                                sender: {
                                    select: {
                                        id: true,
                                        name: true,
                                        profilePhoto: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!match) {
            res.status(404).json({ success: false, message: 'Match not found.' });
            return;
        }

        // Verify user is part of this match
        if (match.user1Id !== userId && match.user2Id !== userId) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        const matchedUser = match.user1.id === userId ? match.user2 : match.user1;

        // Mark unread messages as read
        if (match.chatRoom) {
            await prisma.message.updateMany({
                where: {
                    chatRoomId: match.chatRoom.id,
                    senderId: { not: userId },
                    isRead: false,
                },
                data: { isRead: true },
            });
        }

        res.status(200).json({
            success: true,
            data: {
                matchId: match.id,
                matchedUser,
                chatRoom: match.chatRoom
                    ? {
                        id: match.chatRoom.id,
                        messages: match.chatRoom.messages.map((msg) => ({
                            id: msg.id,
                            senderId: msg.senderId,
                            senderName: msg.sender.name,
                            content: msg.content,
                            type: msg.type,
                            mediaUrl: msg.mediaUrl,
                            createdAt: msg.createdAt,
                            isRead: msg.isRead,
                            isOwn: msg.senderId === userId,
                        })),
                    }
                    : null,
            },
        });
    } catch (error: any) {
        console.error('Get chat room error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get chat room.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Send a message (HTTP fallback - Socket.io is primary)
 * POST /api/chat/:matchId/messages
 */
export const sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const matchId = parseInt(req.params.matchId);
        if (isNaN(matchId)) {
            res.status(400).json({ success: false, message: 'Invalid match ID.' });
            return;
        }

        const { content, type = 'text', mediaUrl } = req.body;

        // Validate content based on type
        if (type === 'text') {
            if (!content || typeof content !== 'string' || content.trim().length === 0) {
                res.status(400).json({ success: false, message: 'Message content is required for text messages.' });
                return;
            }
        } else if (type === 'image' || type === 'video') {
            if (!mediaUrl) {
                res.status(400).json({ success: false, message: 'Media URL is required for media messages.' });
                return;
            }
        } else {
            res.status(400).json({ success: false, message: 'Invalid message type.' });
            return;
        }

        // Get match and chat room
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { chatRoom: true },
        });

        if (!match) {
            res.status(404).json({ success: false, message: 'Match not found.' });
            return;
        }

        // Verify user is part of this match
        if (match.user1Id !== userId && match.user2Id !== userId) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        if (!match.chatRoom) {
            res.status(400).json({ success: false, message: 'Chat room not found for this match.' });
            return;
        }

        // Create message
        // Create message
        const message = await prisma.message.create({
            data: {
                chatRoomId: match.chatRoom.id,
                senderId: userId,
                content: content ? content.trim() : null,
                type,
                mediaUrl,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        profilePhoto: true,
                    },
                },
            },
        });

        // Broadcast to socket
        const io = getSocketIO();
        if (io) {
            const messageData = {
                id: message.id,
                senderId: message.senderId,
                senderName: message.sender.name,
                senderPhoto: message.sender.profilePhoto,
                content: message.content,
                type: message.type,
                mediaUrl: message.mediaUrl,
                createdAt: message.createdAt,
                isRead: message.isRead,
                matchId: match.id,
                isOwn: false,
            };

            // Emit to chat room
            io.to(`chat:${match.chatRoom.id}`).emit('new_message', messageData);

            // Notify other user
            const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
            io.to(`user:${otherUserId}`).emit('message_notification', {
                matchId: match.id,
                message: messageData,
            });
        }

        res.status(201).json({
            success: true,
            data: {
                id: message.id,
                senderId: message.senderId,
                senderName: message.sender.name,
                content: message.content,
                type: message.type,
                mediaUrl: message.mediaUrl,
                createdAt: message.createdAt,
                isRead: message.isRead,
                isOwn: true,
            },
        });
    } catch (error: any) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Mark messages as read
 * PUT /api/chat/:matchId/read
 */
export const markMessagesAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const matchId = parseInt(req.params.matchId);
        if (isNaN(matchId)) {
            res.status(400).json({ success: false, message: 'Invalid match ID.' });
            return;
        }

        // Get match and chat room
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { chatRoom: true },
        });

        if (!match || !match.chatRoom) {
            res.status(404).json({ success: false, message: 'Chat room not found.' });
            return;
        }

        // Verify user is part of this match
        if (match.user1Id !== userId && match.user2Id !== userId) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        // Mark all messages from other user as read
        await prisma.message.updateMany({
            where: {
                chatRoomId: match.chatRoom.id,
                senderId: { not: userId },
                isRead: false,
            },
            data: { isRead: true },
        });

        res.status(200).json({
            success: true,
            message: 'Messages marked as read.',
        });
    } catch (error: any) {
        console.error('Mark messages as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark messages as read.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Upload usage media (image/video)
 * POST /api/chat/upload
 */
export const uploadMedia = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        if (!req.file) {
            res.status(400).json({ success: false, message: 'No file uploaded.' });
            return;
        }

        let result;
        if (req.file.mimetype.startsWith('image/')) {
            result = await uploadImageToCloudinary(req.file.buffer, userId, 'chat');
        } else if (req.file.mimetype.startsWith('video/')) {
            result = await uploadVideoToCloudinary(req.file.buffer, userId, 'chat');
        } else {
            res.status(400).json({ success: false, message: 'Unsupported file type.' });
            return;
        }

        // Return URL and type (image/video)
        res.status(200).json({
            success: true,
            data: {
                url: result.url,
                type: req.file.mimetype.startsWith('image/') ? 'image' : 'video',
                publicId: result.publicId
            }
        });

    } catch (error: any) {
        console.error('Upload media error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload media.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};
