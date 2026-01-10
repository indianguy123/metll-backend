import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import prisma from './database.config';

interface AuthenticatedSocket extends Socket {
    userId?: number;
}

interface JWTPayload {
    id: number;
    phoneNumber: string;
}

// Store active socket connections by user ID
const userSockets = new Map<number, string>();

// Store global instance
let ioInstance: SocketIOServer | null = null;

export const initializeSocketIO = (httpServer: HTTPServer): SocketIOServer => {
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: '*', // Configure for production
            methods: ['GET', 'POST'],
        },
    });

    ioInstance = io;

    // Authentication middleware
    io.use(async (socket: AuthenticatedSocket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

            if (!token) {
                return next(new Error('Authentication required'));
            }

            const secret = process.env.JWT_SECRET || 'your-secret-key';
            const decoded = jwt.verify(token, secret) as JWTPayload;

            // Verify user exists
            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: { id: true },
            });

            if (!user) {
                return next(new Error('User not found'));
            }

            socket.userId = user.id;
            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket: AuthenticatedSocket) => {
        const userId = socket.userId;
        console.log(`User ${userId} connected via Socket.io`);

        if (userId) {
            // Store socket mapping
            userSockets.set(userId, socket.id);

            // Join user's personal room for notifications
            socket.join(`user:${userId}`);
        }

        // Join a chat room
        socket.on('join_chat', async (data: { matchId: number }) => {
            try {
                if (!userId) return;

                const { matchId } = data;

                // Verify user is part of this match
                const match = await prisma.match.findUnique({
                    where: { id: matchId },
                    include: { chatRoom: true },
                });

                if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
                    socket.emit('error', { message: 'Access denied to this chat' });
                    return;
                }

                if (match.chatRoom) {
                    socket.join(`chat:${match.chatRoom.id}`);
                    console.log(`User ${userId} joined chat room ${match.chatRoom.id}`);
                }
            } catch (error) {
                console.error('Join chat error:', error);
                socket.emit('error', { message: 'Failed to join chat' });
            }
        });

        // Leave a chat room
        socket.on('leave_chat', (data: { chatRoomId: number }) => {
            socket.leave(`chat:${data.chatRoomId}`);
            console.log(`User ${userId} left chat room ${data.chatRoomId}`);
        });

        // Send a message via Socket.io
        socket.on('send_message', async (data: { matchId: number; content: string }) => {
            try {
                if (!userId) return;

                const { matchId, content } = data;

                if (!content || content.trim().length === 0) {
                    socket.emit('error', { message: 'Message content is required' });
                    return;
                }

                // Verify user is part of this match
                const match = await prisma.match.findUnique({
                    where: { id: matchId },
                    include: { chatRoom: true },
                });

                if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
                    socket.emit('error', { message: 'Access denied' });
                    return;
                }

                if (!match.chatRoom) {
                    socket.emit('error', { message: 'Chat room not found' });
                    return;
                }

                // Create message in database
                const message = await prisma.message.create({
                    data: {
                        chatRoomId: match.chatRoom.id,
                        senderId: userId,
                        content: content.trim(),
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
                    matchId,
                };

                // Broadcast to chat room
                io.to(`chat:${match.chatRoom.id}`).emit('new_message', messageData);

                // Send notification to other user if not in chat room
                const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
                io.to(`user:${otherUserId}`).emit('message_notification', {
                    matchId,
                    message: messageData,
                });

                console.log(`Message sent in chat ${match.chatRoom.id} by user ${userId}`);
            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Typing indicator
        socket.on('typing_start', async (data: { matchId: number }) => {
            try {
                if (!userId) return;

                const match = await prisma.match.findUnique({
                    where: { id: data.matchId },
                    include: { chatRoom: true },
                });

                if (match?.chatRoom) {
                    socket.to(`chat:${match.chatRoom.id}`).emit('user_typing', {
                        userId,
                        matchId: data.matchId,
                    });
                }
            } catch (error) {
                console.error('Typing indicator error:', error);
            }
        });

        socket.on('typing_stop', async (data: { matchId: number }) => {
            try {
                if (!userId) return;

                const match = await prisma.match.findUnique({
                    where: { id: data.matchId },
                    include: { chatRoom: true },
                });

                if (match?.chatRoom) {
                    socket.to(`chat:${match.chatRoom.id}`).emit('user_stopped_typing', {
                        userId,
                        matchId: data.matchId,
                    });
                }
            } catch (error) {
                console.error('Typing indicator error:', error);
            }
        });

        // Mark messages as read
        socket.on('mark_read', async (data: { matchId: number }) => {
            try {
                if (!userId) return;

                const match = await prisma.match.findUnique({
                    where: { id: data.matchId },
                    include: { chatRoom: true },
                });

                if (!match || !match.chatRoom) return;
                if (match.user1Id !== userId && match.user2Id !== userId) return;

                await prisma.message.updateMany({
                    where: {
                        chatRoomId: match.chatRoom.id,
                        senderId: { not: userId },
                        isRead: false,
                    },
                    data: { isRead: true },
                });

                // Notify sender that messages were read
                const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
                io.to(`user:${otherUserId}`).emit('messages_read', {
                    matchId: data.matchId,
                    readBy: userId,
                });
            } catch (error) {
                console.error('Mark read error:', error);
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            if (userId) {
                userSockets.delete(userId);
                console.log(`User ${userId} disconnected`);
            }
        });
    });

    return io;
};

// Helper to get Socket.io instance (for use in other parts of the app)
export const getSocketIO = (): SocketIOServer | null => {
    return ioInstance;
};
