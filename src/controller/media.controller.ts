import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';
import { getSocketIO } from '../config/socket.config';
import { uploadAudioToCloudinary } from '../services/cloudinary.service';

// Giphy API configuration
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

interface GiphyGif {
    id: string;
    title: string;
    images: {
        fixed_height: {
            url: string;
            width: string;
            height: string;
        };
        original: {
            url: string;
            width: string;
            height: string;
        };
        preview_gif: {
            url: string;
        };
    };
}

interface GiphyResponse {
    data: GiphyGif[];
    pagination: {
        offset: number;
        count: number;
        total_count: number;
    };
    message?: string;
}

/**
 * Upload voice note
 * POST /api/media/voice-note
 */
export const uploadVoiceNote = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        if (!req.file) {
            res.status(400).json({ success: false, message: 'No audio file uploaded.' });
            return;
        }

        // Validate file type
        const allowedMimeTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/m4a', 'audio/aac', 'audio/ogg'];
        if (!allowedMimeTypes.some(type => req.file!.mimetype.includes(type.split('/')[1]))) {
            res.status(400).json({ success: false, message: 'Invalid audio file type. Supported: mp3, wav, webm, m4a, aac, ogg' });
            return;
        }

        // Upload to Cloudinary
        const result = await uploadAudioToCloudinary(req.file.buffer, userId, 'voice_notes');

        // Get waveform data from request if provided
        const waveformData = req.body.waveformData || null;

        res.status(200).json({
            success: true,
            data: {
                url: result.url,
                duration: result.duration || 0,
                publicId: result.publicId,
                waveformData: waveformData,
                type: 'voice_note'
            }
        });

    } catch (error: any) {
        console.error('Upload voice note error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload voice note.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Search GIFs on Giphy
 * GET /api/media/gifs/search?q=query&limit=20&offset=0
 */
export const searchGifs = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        if (!GIPHY_API_KEY) {
            res.status(500).json({ success: false, message: 'Giphy API key not configured.' });
            return;
        }

        const query = req.query.q as string;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;

        if (!query || query.trim().length === 0) {
            res.status(400).json({ success: false, message: 'Search query is required.' });
            return;
        }

        const url = `${GIPHY_BASE_URL}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=pg-13&lang=en`;

        const response = await fetch(url);
        const data = await response.json() as GiphyResponse;

        if (!response.ok) {
            throw new Error(data.message || 'Failed to search GIFs');
        }

        const gifs = data.data.map((gif: GiphyGif) => ({
            id: gif.id,
            title: gif.title,
            url: gif.images.fixed_height.url,
            previewUrl: gif.images.preview_gif?.url || gif.images.fixed_height.url,
            width: parseInt(gif.images.fixed_height.width),
            height: parseInt(gif.images.fixed_height.height),
            originalUrl: gif.images.original.url,
            originalWidth: parseInt(gif.images.original.width),
            originalHeight: parseInt(gif.images.original.height),
        }));

        res.status(200).json({
            success: true,
            data: {
                gifs,
                pagination: {
                    offset: data.pagination?.offset || 0,
                    count: data.pagination?.count || gifs.length,
                    total_count: data.pagination?.total_count || gifs.length,
                }
            }
        });

    } catch (error: any) {
        console.error('Search GIFs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search GIFs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Get trending GIFs from Giphy
 * GET /api/media/gifs/trending?limit=20&offset=0
 */
export const getTrendingGifs = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        if (!GIPHY_API_KEY) {
            res.status(500).json({ success: false, message: 'Giphy API key not configured.' });
            return;
        }

        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;

        const url = `${GIPHY_BASE_URL}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=pg-13`;

        const response = await fetch(url);
        const data = await response.json() as GiphyResponse;

        if (!response.ok) {
            throw new Error(data.message || 'Failed to get trending GIFs');
        }

        const gifs = data.data.map((gif: GiphyGif) => ({
            id: gif.id,
            title: gif.title,
            url: gif.images.fixed_height.url,
            previewUrl: gif.images.preview_gif?.url || gif.images.fixed_height.url,
            width: parseInt(gif.images.fixed_height.width),
            height: parseInt(gif.images.fixed_height.height),
            originalUrl: gif.images.original.url,
            originalWidth: parseInt(gif.images.original.width),
            originalHeight: parseInt(gif.images.original.height),
        }));

        res.status(200).json({
            success: true,
            data: {
                gifs,
                pagination: {
                    offset: data.pagination?.offset || 0,
                    count: data.pagination?.count || gifs.length,
                    total_count: data.pagination?.total_count || gifs.length,
                }
            }
        });

    } catch (error: any) {
        console.error('Get trending GIFs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get trending GIFs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Send a voice note message
 * POST /api/media/voice-note/send
 */
export const sendVoiceNoteMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const { matchId, audioUrl, duration, waveformData, transcript } = req.body;

        if (!matchId || !audioUrl) {
            res.status(400).json({ success: false, message: 'matchId and audioUrl are required.' });
            return;
        }

        // Get match and chat room
        const match = await prisma.match.findUnique({
            where: { id: parseInt(matchId) },
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

        // Create voice note message
        const message = await prisma.message.create({
            data: {
                chatRoomId: match.chatRoom.id,
                senderId: userId,
                content: transcript || null,
                type: 'voice_note',
                mediaUrl: audioUrl,
                duration: duration ? Math.round(parseFloat(String(duration))) : 0,
                waveformData: waveformData ? (typeof waveformData === 'string' ? waveformData : JSON.stringify(waveformData)) : null,
                transcript: transcript || null,
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
        }) as any;

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
                duration: message.duration,
                waveformData: message.waveformData ? JSON.parse(message.waveformData) : null,
                transcript: message.transcript,
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
                duration: message.duration,
                waveformData: message.waveformData ? JSON.parse(message.waveformData) : null,
                transcript: message.transcript,
                createdAt: message.createdAt,
                isRead: message.isRead,
                isOwn: true,
            },
        });

    } catch (error: any) {
        console.error('Send voice note message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send voice note message.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Send a GIF message
 * POST /api/media/gif/send
 */
export const sendGifMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const { matchId, gifUrl, gifId, width, height } = req.body;

        if (!matchId || !gifUrl || !gifId) {
            res.status(400).json({ success: false, message: 'matchId, gifUrl, and gifId are required.' });
            return;
        }

        // Get match and chat room
        const match = await prisma.match.findUnique({
            where: { id: parseInt(matchId) },
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

        // Create GIF message
        const message = await prisma.message.create({
            data: {
                chatRoomId: match.chatRoom.id,
                senderId: userId,
                content: null,
                type: 'gif',
                mediaUrl: gifUrl,
                gifId: gifId,
                gifWidth: width ? parseInt(String(width)) : null,
                gifHeight: height ? parseInt(String(height)) : null,
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
        }) as any;

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
                gifId: message.gifId,
                gifWidth: message.gifWidth,
                gifHeight: message.gifHeight,
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
                gifId: message.gifId,
                gifWidth: message.gifWidth,
                gifHeight: message.gifHeight,
                createdAt: message.createdAt,
                isRead: message.isRead,
                isOwn: true,
            },
        });

    } catch (error: any) {
        console.error('Send GIF message error:', error);

        // Add more specific database error logging
        if (error.code) {
            console.error('Prisma Error Code:', error.code);
            console.error('Prisma Error Meta:', error.meta);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to send GIF message.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            code: error.code
        });
    }
};
