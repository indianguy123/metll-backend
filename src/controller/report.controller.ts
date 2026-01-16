import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';

/**
 * Report a user
 * POST /api/report
 */
import { extractPublicIdFromUrl, deleteResourcesFromCloudinary } from '../services/cloudinary.service';

/**
 * Report a user
 * POST /api/report
 */
export const submitReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const { reportedUserId, matchId, category, reason } = req.body;

        if ((!reportedUserId && !matchId) || !category || !reason) {
            res.status(400).json({
                success: false,
                message: 'Invalid request. Provide matchId (or reportedUserId), category, and reason.',
            });
            return;
        }

        if (reason.trim().length === 0) {
            res.status(400).json({
                success: false,
                message: 'Reason is compulsory.',
            });
            return;
        }

        let targetId = reportedUserId;

        // If matchId is provided, resolve reportedUserId from it
        if (matchId) {
            const match = await prisma.match.findUnique({
                where: { id: Number(matchId) }
            });

            if (match) {
                // The reported user is the OTHER user in the match
                if (match.user1Id === userId) {
                    targetId = match.user2Id;
                } else if (match.user2Id === userId) {
                    targetId = match.user1Id;
                }
            } else {
                // If match not found, we can't proceed if we depended on it
                if (!targetId) {
                    res.status(404).json({ success: false, message: 'Match not found.' });
                    return;
                }
            }
        }

        if (!targetId) {
            console.log('[submitReport] ERROR: Could not determine targetId');
            res.status(400).json({ success: false, message: 'Could determine user to report.' });
            return;
        }

        console.log(`[submitReport] Reporting user ${targetId} by ${userId} (matchId: ${matchId})`);

        // Check if report already exists
        const existingReport = await prisma.report.findFirst({
            where: {
                reporterId: userId,
                reportedId: targetId
            }
        });

        if (existingReport) {
            console.log(`[submitReport] Report already exists (ID: ${existingReport.id})`);
            // Already reported, but ensure cleanup happens
        } else {
            // 1. Create Report
            const newReport = await prisma.report.create({
                data: {
                    reporterId: userId,
                    reportedId: targetId,
                    category,
                    reason,
                    status: 'pending'
                }
            });
            console.log(`[submitReport] Created report: ${newReport.id}`);
        }

        // 2. Find and Delete ALL Matches between these two users (should only be one, but being safe)
        // This will cascade delete ChatRoom and Messages due to onDelete: Cascade in schema
        const matchesToDelete = await prisma.match.findMany({
            where: {
                OR: [
                    { user1Id: userId, user2Id: targetId },
                    { user1Id: targetId, user2Id: userId }
                ]
            },
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

        console.log(`[submitReport] Found ${matchesToDelete.length} matches to delete`);

        for (const match of matchesToDelete) {
            // 2a. Delete Cloudinary Resources for Chat Media
            if (match.chatRoom && match.chatRoom.messages.length > 0) {
                const imagePublicIds: string[] = [];
                const videoPublicIds: string[] = [];

                match.chatRoom.messages.forEach(msg => {
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

                console.log(`[submitReport] Deleting ${imagePublicIds.length} images and ${videoPublicIds.length} videos from Cloudinary for match ${match.id}`);

                if (imagePublicIds.length > 0) {
                    await deleteResourcesFromCloudinary(imagePublicIds, 'image');
                }
                if (videoPublicIds.length > 0) {
                    await deleteResourcesFromCloudinary(videoPublicIds, 'video');
                }
            }

            // 2b. Delete Match from DB
            await prisma.match.delete({
                where: { id: match.id }
            });
            console.log(`[submitReport] Deleted match ${match.id} from DB`);
        }

        // 3. Delete Swipes (Cleanup) to prevent them appearing in stack or rematching
        const deletedSwipes = await prisma.swipe.deleteMany({
            where: {
                OR: [
                    { swiperId: userId, swipedId: targetId },
                    { swiperId: targetId, swipedId: userId }
                ]
            }
        });
        console.log(`[submitReport] Deleted ${deletedSwipes.count} swipe records`);

        res.status(200).json({
            success: true,
            message: 'User reported and blocked successfully.',
        });

    } catch (error: any) {
        console.error('Submit report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit report.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};
