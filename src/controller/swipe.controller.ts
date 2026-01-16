import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';
import { extractPublicIdFromUrl, deleteResourcesFromCloudinary } from '../services/cloudinary.service';

/**
 * Record a swipe action and check for mutual match
 * POST /api/swipe
 */
export const recordSwipe = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const { targetUserId, direction } = req.body;

        if (!targetUserId || !['like', 'pass'].includes(direction)) {
            res.status(400).json({
                success: false,
                message: 'Invalid request. Provide targetUserId and direction (like/pass).',
            });
            return;
        }

        if (targetUserId === userId) {
            res.status(400).json({
                success: false,
                message: 'Cannot swipe on yourself.',
            });
            return;
        }

        // Check if already swiped on this user
        const existingSwipe = await prisma.swipe.findUnique({
            where: {
                swiperId_swipedId: {
                    swiperId: userId,
                    swipedId: targetUserId,
                },
            },
        });

        if (existingSwipe) {
            res.status(400).json({
                success: false,
                message: 'Already swiped on this user.',
            });
            return;
        }

        // Record the swipe
        await prisma.swipe.create({
            data: {
                swiperId: userId,
                swipedId: targetUserId,
                direction,
            },
        });

        // If it's a pass, just return success
        if (direction === 'pass') {
            res.status(200).json({
                success: true,
                message: 'Swipe recorded.',
                data: { direction, isMatch: false },
            });
            return;
        }

        // Check if the other user has liked us (mutual match)
        const mutualSwipe = await prisma.swipe.findFirst({
            where: {
                swiperId: targetUserId,
                swipedId: userId,
                direction: 'like',
            },
        });

        if (!mutualSwipe) {
            // No match yet
            res.status(200).json({
                success: true,
                message: 'Swipe recorded.',
                data: { direction, isMatch: false },
            });
            return;
        }

        // It's a match! Create Match and ChatRoom
        const [user1Id, user2Id] = [userId, targetUserId].sort((a, b) => a - b);

        // Check if match already exists
        const existingMatch = await prisma.match.findUnique({
            where: {
                user1Id_user2Id: { user1Id, user2Id },
            },
        });

        if (existingMatch) {
            // Match already exists, return it
            const matchWithUser = await prisma.match.findUnique({
                where: { id: existingMatch.id },
                include: {
                    user1: {
                        select: {
                            id: true,
                            name: true,
                            images: true,
                            profilePhoto: true,
                            bio: true,
                            age: true,
                            isVerified: true,
                        },
                    },
                    user2: {
                        select: {
                            id: true,
                            name: true,
                            images: true,
                            profilePhoto: true,
                            bio: true,
                            age: true,
                            isVerified: true,
                        },
                    },
                    chatRoom: true,
                },
            });

            const matchedUser = matchWithUser?.user1.id === userId
                ? matchWithUser?.user2
                : matchWithUser?.user1;

            res.status(200).json({
                success: true,
                message: "It's a match!",
                data: {
                    direction,
                    isMatch: true,
                    match: {
                        id: existingMatch.id,
                        matchedUser,
                        matchedAt: existingMatch.matchedAt,
                        chatRoomId: matchWithUser?.chatRoom?.id,
                    },
                },
            });
            return;
        }

        // Create new match with chat room
        const match = await prisma.match.create({
            data: {
                user1Id,
                user2Id,
                chatRoom: {
                    create: {},
                },
            },
            include: {
                user1: {
                    select: {
                        id: true,
                        name: true,
                        images: true,
                        profilePhoto: true,
                        bio: true,
                        age: true,
                        isVerified: true,
                    },
                },
                user2: {
                    select: {
                        id: true,
                        name: true,
                        images: true,
                        profilePhoto: true,
                        bio: true,
                        age: true,
                        isVerified: true,
                    },
                },
                chatRoom: true,
            },
        });

        const matchedUser = match.user1.id === userId ? match.user2 : match.user1;

        res.status(200).json({
            success: true,
            message: "It's a match! 🎉",
            data: {
                direction,
                isMatch: true,
                match: {
                    id: match.id,
                    matchedUser,
                    matchedAt: match.matchedAt,
                    chatRoomId: match.chatRoom?.id,
                },
            },
        });
    } catch (error: any) {
        console.error('Record swipe error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record swipe.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Get users who have liked the current user but haven't been liked back
 * GET /api/swipe/likes
 */
export const getWhoLikedMe = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        // Get all users who have liked the current user
        const incomingLikes = await prisma.swipe.findMany({
            where: {
                swipedId: userId,
                direction: 'like',
            },
            select: { swiperId: true, createdAt: true },
        });

        if (incomingLikes.length === 0) {
            res.status(200).json({
                success: true,
                data: [],
            });
            return;
        }

        // Get IDs of users the current user has already swiped on
        const outgoingSwipes = await prisma.swipe.findMany({
            where: {
                swiperId: userId,
            },
            select: { swipedId: true },
        });
        const alreadySwipedIds = outgoingSwipes.map(s => s.swipedId);

        // Filter to get only pending likes (users we haven't swiped on yet)
        const pendingLikeUserIds = incomingLikes
            .filter(like => !alreadySwipedIds.includes(like.swiperId))
            .map(like => like.swiperId);

        if (pendingLikeUserIds.length === 0) {
            res.status(200).json({
                success: true,
                data: [],
            });
            return;
        }

        // Get user details for pending likes
        const likers = await prisma.user.findMany({
            where: {
                id: { in: pendingLikeUserIds },
            },
            select: {
                id: true,
                name: true,
                bio: true,
                age: true,
                gender: true,
                images: true,
                profilePhoto: true,
                additionalPhotos: true,
                isVerified: true,
                school: true,
                college: true,
                office: true,
            },
        });

        // Add likedAt timestamp
        const likersWithTimestamp = likers.map(liker => {
            const likeRecord = incomingLikes.find(l => l.swiperId === liker.id);
            return {
                ...liker,
                likedAt: likeRecord?.createdAt,
            };
        });

        // Sort by most recent like first
        likersWithTimestamp.sort((a, b) =>
            new Date(b.likedAt || 0).getTime() - new Date(a.likedAt || 0).getTime()
        );

        res.status(200).json({
            success: true,
            data: likersWithTimestamp,
        });
    } catch (error: any) {
        console.error('Get who liked me error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get likes.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Get profiles available to swipe on
 * GET /api/swipe/profiles
 */
export const getSwipeProfiles = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        console.log(`[getSwipeProfiles] User ID: ${userId}`);

        // Get total count of all users
        const totalUsers = await prisma.user.count();
        console.log(`[getSwipeProfiles] Total users in database: ${totalUsers}`);

        // Get IDs of users already swiped on
        const swipedUsers = await prisma.swipe.findMany({
            where: { swiperId: userId },
            select: { swipedId: true },
        });
        const swipedIds = swipedUsers.map((s) => s.swipedId);
        console.log(`[getSwipeProfiles] Already swiped on ${swipedIds.length} users:`, swipedIds);

        // Get all user IDs to see what we're excluding
        const allUserIds = await prisma.user.findMany({
            select: { id: true },
        });
        const allIds = allUserIds.map(u => u.id);
        console.log(`[getSwipeProfiles] All user IDs in database:`, allIds);

        // Get IDs of users this user reported or was reported by (mutual block)
        let blockedUserIds: number[] = [];
        try {
            // Check if prisma.report exists (defensive check for Prisma client regeneration)
            if (prisma.report && typeof prisma.report.findMany === 'function') {
                const reports = await prisma.report.findMany({
                    where: {
                        OR: [
                            { reporterId: userId },
                            { reportedId: userId }
                        ]
                    },
                    select: { reporterId: true, reportedId: true }
                });
                blockedUserIds = reports.map(r => r.reporterId === userId ? r.reportedId : r.reporterId);
            } else {
                console.warn('[getSwipeProfiles] prisma.report model not available. Please restart the server after running: npx prisma generate');
            }
        } catch (error: any) {
            console.error('[getSwipeProfiles] Error fetching reports:', error.message);
            // Continue with empty blockedUserIds array
            blockedUserIds = [];
        }
        console.log(`[getSwipeProfiles] Blocked/Reported IDs:`, blockedUserIds);

        // Build exclusion list
        // Use Set to ensure unique IDs and handle empty arrays gracefully
        const excludeIds = Array.from(new Set([userId, ...swipedIds, ...blockedUserIds]));
        console.log(`[getSwipeProfiles] Excluding IDs:`, excludeIds);

        // TEMPORARY: For debugging - get ALL users first to see what's in DB
        const allUsersDebug = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                phoneNumber: true,
                isVerified: true,
                isOnboarded: true,
            },
        });
        console.log(`[getSwipeProfiles] DEBUG - All users in DB:`, JSON.stringify(allUsersDebug, null, 2));

        // Get profiles to show (excluding self and already swiped)
        // Removed isVerified requirement to show all profiles in database
        const profiles = await prisma.user.findMany({
            where: {
                id: {
                    notIn: excludeIds.length > 0 ? excludeIds : [userId], // Handle empty array case
                },
            },
            select: {
                id: true,
                name: true,
                bio: true,
                age: true,
                gender: true,
                images: true,
                profilePhoto: true,
                additionalPhotos: true,
                isVerified: true,
                latitude: true,
                longitude: true,
                school: true,
                college: true,
                office: true,
                situationResponses: true,
            },
            take: 20, // Limit to 20 profiles at a time
        });

        console.log(`[getSwipeProfiles] Found ${profiles.length} profiles for user ${userId}`);
        if (profiles.length > 0) {
            console.log(`[getSwipeProfiles] Profile IDs:`, profiles.map(p => p.id));
        } else {
            console.log(`[getSwipeProfiles] No profiles found. Possible reasons:`);
            console.log(`  - All users have been swiped (swiped: ${swipedIds.length}, total: ${totalUsers})`);
            console.log(`  - Only one user in database (current user)`);
        }

        // Include debug info in development mode
        const response: any = {
            success: true,
            data: profiles,
        };

        if (process.env.NODE_ENV === 'development') {
            response.debug = {
                userId,
                totalUsers,
                swipedCount: swipedIds.length,
                swipedIds,
                allUserIds: allIds,
                excludeIds,
                foundCount: profiles.length,
            };
        }

        res.status(200).json(response);
    } catch (error: any) {
        console.error('Get swipe profiles error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get profiles.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Get all matches for the current user
 * GET /api/swipe/matches
 */
export const getMatches = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const matches = await prisma.match.findMany({
            where: {
                OR: [{ user1Id: userId }, { user2Id: userId }],
            },
            include: {
                user1: {
                    select: {
                        id: true,
                        name: true,
                        images: true,
                        profilePhoto: true,
                        bio: true,
                        age: true,
                        isVerified: true,
                    },
                },
                user2: {
                    select: {
                        id: true,
                        name: true,
                        images: true,
                        profilePhoto: true,
                        bio: true,
                        age: true,
                        isVerified: true,
                    },
                },
                chatRoom: {
                    include: {
                        messages: {
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                },
            },
            orderBy: { matchedAt: 'desc' },
        });

        // Transform to show matched user and last message
        const formattedMatches = matches.map((match) => {
            const matchedUser = match.user1.id === userId ? match.user2 : match.user1;
            const lastMessage = match.chatRoom?.messages[0] || null;

            return {
                id: match.id,
                matchedUser,
                matchedAt: match.matchedAt,
                chatRoomId: match.chatRoom?.id,
                coffeeTicket: match.coffeeTicket,
                coffeeTicketCafe: match.coffeeTicketCafe,
                coffeeTicketExpiry: match.coffeeTicketExpiry,
                lastMessage: lastMessage
                    ? {
                        id: lastMessage.id,
                        content: lastMessage.content,
                        senderId: lastMessage.senderId,
                        createdAt: lastMessage.createdAt,
                        isRead: lastMessage.isRead,
                    }
                    : null,
            };
        });

        res.status(200).json({
            success: true,
            data: formattedMatches,
        });
    } catch (error: any) {
        console.error('Get matches error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get matches.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Get a single match by ID
 * GET /api/swipe/matches/:matchId
 */
export const getMatchById = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: {
                user1: {
                    select: {
                        id: true,
                        name: true,
                        images: true,
                        profilePhoto: true,
                        bio: true,
                        age: true,
                        isVerified: true,
                    },
                },
                user2: {
                    select: {
                        id: true,
                        name: true,
                        images: true,
                        profilePhoto: true,
                        bio: true,
                        age: true,
                        isVerified: true,
                    },
                },
                chatRoom: true,
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

        res.status(200).json({
            success: true,
            data: {
                id: match.id,
                matchedUser,
                matchedAt: match.matchedAt,
                chatRoomId: match.chatRoom?.id,
            },
        });
    } catch (error: any) {
        console.error('Get match by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get match.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Reset all swipes for the current user (delete all swipe records)
 * DELETE /api/swipe/reset
 */
export const resetSwipes = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        // Delete all swipe records where this user is the swiper
        const deletedCount = await prisma.swipe.deleteMany({
            where: {
                swiperId: userId,
            },
        });

        console.log(`[resetSwipes] Deleted ${deletedCount.count} swipe records for user ${userId}`);

        res.status(200).json({
            success: true,
            message: 'All swipes reset successfully',
            data: {
                deletedCount: deletedCount.count,
            },
        });
    } catch (error: any) {
        console.error('Reset swipes error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset swipes',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Unmatch a user
 * DELETE /api/swipe/matches/:matchId
 */
export const unmatchUser = async (req: AuthRequest, res: Response): Promise<void> => {
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

        // Find match with chat media before deleting
        const matchToDelete = await prisma.match.findUnique({
            where: { id: matchId },
            include: {
                chatRoom: {
                    include: {
                        messages: {
                            where: {
                                NOT: {
                                    mediaUrl: null
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!matchToDelete) {
            res.status(404).json({ success: false, message: 'Match not found.' });
            return;
        }

        // Verify ownership
        if (matchToDelete.user1Id !== userId && matchToDelete.user2Id !== userId) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        // 1. Delete Cloudinary Resources for Chat Media
        if (matchToDelete.chatRoom && matchToDelete.chatRoom.messages.length > 0) {
            const imagePublicIds: string[] = [];
            const videoPublicIds: string[] = [];

            matchToDelete.chatRoom.messages.forEach(msg => {
                if (msg.mediaUrl) {
                    const publicId = extractPublicIdFromUrl(msg.mediaUrl);
                    if (publicId) {
                        if (msg.type === 'image') {
                            imagePublicIds.push(publicId);
                        } else if (msg.type === 'video' || msg.type === 'voice_note' || msg.type === 'audio') {
                            videoPublicIds.push(publicId);
                        }
                    }
                }
            });

            console.log(`[unmatchUser] Deleting ${imagePublicIds.length} images and ${videoPublicIds.length} videos from Cloudinary for match ${matchId}`);

            if (imagePublicIds.length > 0) {
                await deleteResourcesFromCloudinary(imagePublicIds, 'image');
            }
            if (videoPublicIds.length > 0) {
                await deleteResourcesFromCloudinary(videoPublicIds, 'video');
            }
        }

        // 2. Delete Match from DB (cascades to chatRoom and messages)
        await prisma.match.delete({
            where: { id: matchId },
        });

        // 3. Delete associated swipes
        await prisma.swipe.deleteMany({
            where: {
                OR: [
                    { swiperId: matchToDelete.user1Id, swipedId: matchToDelete.user2Id },
                    { swiperId: matchToDelete.user2Id, swipedId: matchToDelete.user1Id },
                ],
            },
        });

        res.status(200).json({
            success: true,
            message: 'Unmatched successfully.',
        });
    } catch (error: any) {
        console.error('Unmatch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unmatch.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};
