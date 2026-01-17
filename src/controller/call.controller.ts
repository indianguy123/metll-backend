import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';
import { getSocketIO } from '../config/socket.config';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

// Get Agora credentials from environment
const AGORA_APP_ID = process.env.AGORA_APP_ID || '';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '';

// Token expiration time (24 hours)
const TOKEN_EXPIRY_SECONDS = 86400;

/**
 * Generate Agora RTC token for voice/video calling
 */
const generateAgoraToken = (channelName: string, uid: number): string => {
    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
        throw new Error('Agora credentials not configured');
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTime + TOKEN_EXPIRY_SECONDS;

    return RtcTokenBuilder.buildTokenWithUid(
        AGORA_APP_ID,
        AGORA_APP_CERTIFICATE,
        channelName,
        uid,
        RtcRole.PUBLISHER,
        privilegeExpireTime
    );
};

/**
 * Initiate a call
 * POST /api/calls/initiate
 */
export const initiateCall = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const { matchId, type = 'voice' } = req.body;

        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        if (!matchId) {
            res.status(400).json({ success: false, message: 'Match ID is required' });
            return;
        }

        // Validate call type
        if (!['voice', 'video'].includes(type)) {
            res.status(400).json({ success: false, message: 'Invalid call type' });
            return;
        }

        // Find the match and verify user is part of it
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: {
                chatRoom: true,
                user1: { select: { id: true, name: true, photos: { where: { type: 'profile' }, take: 1 } } },
                user2: { select: { id: true, name: true, photos: { where: { type: 'profile' }, take: 1 } } },
            },
        });

        if (!match) {
            res.status(404).json({ success: false, message: 'Match not found' });
            return;
        }

        // Verify user is part of this match
        if (match.user1Id !== userId && match.user2Id !== userId) {
            res.status(403).json({ success: false, message: 'Not authorized for this match' });
            return;
        }

        // Determine caller and receiver
        const callerId = userId;
        const receiverId = match.user1Id === userId ? match.user2Id : match.user1Id;
        const rawReceiver: any = match.user1Id === userId ? match.user2 : match.user1;
        const receiver = {
            id: rawReceiver.id,
            name: rawReceiver.name,
            profilePhoto: rawReceiver.photos?.[0]?.url || null,
        };

        // Get or create chat room
        let chatRoom = match.chatRoom;
        if (!chatRoom) {
            chatRoom = await prisma.chatRoom.create({
                data: { matchId },
            });
        }

        // Check for any active calls in this chat room
        const activeCall = await prisma.call.findFirst({
            where: {
                chatRoomId: chatRoom.id,
                status: { in: ['pending', 'active'] },
            },
        });

        if (activeCall) {
            res.status(409).json({
                success: false,
                message: 'There is already an active call in this chat'
            });
            return;
        }

        // Generate unique channel name
        const channelName = `call_${chatRoom.id}_${Date.now()}`;

        // Create call record
        const call = await prisma.call.create({
            data: {
                chatRoomId: chatRoom.id,
                callerId,
                receiverId,
                channelName,
                type,
                status: 'pending',
            },
        });

        // Generate Agora tokens for both users
        const callerToken = generateAgoraToken(channelName, callerId);
        const receiverToken = generateAgoraToken(channelName, receiverId);

        // Emit socket event to notify receiver of incoming call
        const io = getSocketIO();
        if (io) {
            const rawCaller: any = match.user1Id === userId ? match.user1 : match.user2;
            const callerPhoto = rawCaller.photos?.[0]?.url || null;
            const callData = {
                callId: call.id,
                matchId,
                channelName,
                callerId,
                callerName: rawCaller.name,
                callerPhoto,
                type,
                token: receiverToken,
                appId: AGORA_APP_ID,
            };
            console.log(`📞 Emitting incoming_call to user:${receiverId}`, callData);
            io.to(`user:${receiverId}`).emit('incoming_call', callData);
            console.log(`✅ Incoming call event emitted to user:${receiverId}`);
        } else {
            console.error('❌ Socket.io instance not available, cannot emit incoming_call');
        }

        res.status(201).json({
            success: true,
            message: 'Call initiated',
            data: {
                callId: call.id,
                channelName,
                token: callerToken,
                appId: AGORA_APP_ID,
                receiver: {
                    id: receiverId,
                    name: receiver.name,
                    photo: receiver.profilePhoto,
                },
            },
        });
    } catch (error) {
        console.error('Initiate call error:', error);
        res.status(500).json({ success: false, message: 'Failed to initiate call' });
    }
};

/**
 * End a call
 * PUT /api/calls/:id/end
 */
export const endCall = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const callId = parseInt(req.params.id);

        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        if (isNaN(callId)) {
            res.status(400).json({ success: false, message: 'Invalid call ID' });
            return;
        }

        // Find the call
        const call = await prisma.call.findUnique({
            where: { id: callId },
            include: { chatRoom: true },
        });

        if (!call) {
            res.status(404).json({ success: false, message: 'Call not found' });
            return;
        }

        // Verify user is part of this call
        if (call.callerId !== userId && call.receiverId !== userId) {
            res.status(403).json({ success: false, message: 'Not authorized for this call' });
            return;
        }

        // Calculate duration if call was active
        let duration: number | null = null;
        if (call.startedAt) {
            duration = Math.floor((Date.now() - call.startedAt.getTime()) / 1000);
        }

        // Update call status
        const updatedCall = await prisma.call.update({
            where: { id: callId },
            data: {
                status: 'ended',
                endedAt: new Date(),
                duration,
            },
        });

        // Notify the other participant
        const otherUserId = call.callerId === userId ? call.receiverId : call.callerId;
        const io = getSocketIO();
        if (io) {
            io.to(`user:${otherUserId}`).emit('call_ended', {
                callId: call.id,
                duration,
            });
        }

        res.json({
            success: true,
            message: 'Call ended',
            data: {
                callId: updatedCall.id,
                duration,
            },
        });
    } catch (error) {
        console.error('End call error:', error);
        res.status(500).json({ success: false, message: 'Failed to end call' });
    }
};

/**
 * Answer a call (mark as active)
 * PUT /api/calls/:id/answer
 */
export const answerCall = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const callId = parseInt(req.params.id);

        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        if (isNaN(callId)) {
            res.status(400).json({ success: false, message: 'Invalid call ID' });
            return;
        }

        // Find the call
        const call = await prisma.call.findUnique({
            where: { id: callId },
        });

        if (!call) {
            res.status(404).json({ success: false, message: 'Call not found' });
            return;
        }

        // Only receiver can answer
        if (call.receiverId !== userId) {
            res.status(403).json({ success: false, message: 'Only receiver can answer the call' });
            return;
        }

        if (call.status !== 'pending') {
            res.status(400).json({ success: false, message: 'Call is not pending' });
            return;
        }

        // Update call status to active
        const updatedCall = await prisma.call.update({
            where: { id: callId },
            data: {
                status: 'active',
                startedAt: new Date(),
            },
        });

        // Notify caller that call was answered
        const io = getSocketIO();
        if (io) {
            io.to(`user:${call.callerId}`).emit('call_answered', {
                callId: call.id,
            });
        }

        res.json({
            success: true,
            message: 'Call answered',
            data: {
                callId: updatedCall.id,
                channelName: updatedCall.channelName,
            },
        });
    } catch (error) {
        console.error('Answer call error:', error);
        res.status(500).json({ success: false, message: 'Failed to answer call' });
    }
};

/**
 * Decline/reject a call
 * PUT /api/calls/:id/decline
 */
export const declineCall = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const callId = parseInt(req.params.id);

        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        if (isNaN(callId)) {
            res.status(400).json({ success: false, message: 'Invalid call ID' });
            return;
        }

        // Find the call
        const call = await prisma.call.findUnique({
            where: { id: callId },
        });

        if (!call) {
            res.status(404).json({ success: false, message: 'Call not found' });
            return;
        }

        // Only receiver can decline
        if (call.receiverId !== userId) {
            res.status(403).json({ success: false, message: 'Only receiver can decline the call' });
            return;
        }

        if (call.status !== 'pending') {
            res.status(400).json({ success: false, message: 'Call is not pending' });
            return;
        }

        // Update call status to missed
        const updatedCall = await prisma.call.update({
            where: { id: callId },
            data: {
                status: 'missed',
                endedAt: new Date(),
            },
        });

        // Notify caller that call was declined
        const io = getSocketIO();
        if (io) {
            io.to(`user:${call.callerId}`).emit('call_declined', {
                callId: call.id,
            });
        }

        res.json({
            success: true,
            message: 'Call declined',
            data: {
                callId: updatedCall.id,
            },
        });
    } catch (error) {
        console.error('Decline call error:', error);
        res.status(500).json({ success: false, message: 'Failed to decline call' });
    }
};
