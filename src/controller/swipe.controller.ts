import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';

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

        // Build exclusion list
        const excludeIds = [userId, ...swipedIds];
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

        // Find match
        const match = await prisma.match.findUnique({
            where: { id: matchId },
        });

        if (!match) {
            res.status(404).json({ success: false, message: 'Match not found.' });
            return;
        }

        // Verify ownership
        if (match.user1Id !== userId && match.user2Id !== userId) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        // Delete match (cascades to chatRoom and messages)
        await prisma.match.delete({
            where: { id: matchId },
        });

        // Delete associated swipes to prevent immediate rematch logic issues
        // and because unmatch usually means "reset" or "block"
        await prisma.swipe.deleteMany({
            where: {
                OR: [
                    { swiperId: match.user1Id, swipedId: match.user2Id },
                    { swiperId: match.user2Id, swipedId: match.user1Id },
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
