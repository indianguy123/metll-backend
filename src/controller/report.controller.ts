import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';

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

        const { reportedUserId, category, reason } = req.body;

        if (!reportedUserId || !category || !reason) {
            res.status(400).json({
                success: false,
                message: 'Invalid request. Provide reportedUserId, category, and reason.',
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

        // Check if report already exists
        const existingReport = await prisma.report.findFirst({
            where: {
                reporterId: userId,
                reportedId: reportedUserId
            }
        });

        if (existingReport) {
            res.status(400).json({
                success: false,
                message: 'You have already reported this user.',
            });
            return;
        }

        // 1. Create Report
        await prisma.report.create({
            data: {
                reporterId: userId,
                reportedId: reportedUserId,
                category,
                reason,
                status: 'pending'
            }
        });

        // 2. Find and Delete Match (if exists)
        // This will cascade delete ChatRoom and Messages due to onDelete: Cascade in schema
        const match = await prisma.match.findFirst({
            where: {
                OR: [
                    { user1Id: userId, user2Id: reportedUserId },
                    { user1Id: reportedUserId, user2Id: userId }
                ]
            }
        });

        if (match) {
            await prisma.match.delete({
                where: { id: match.id }
            });
        }

        // 3. Delete Swipes (Cleanup) to prevent them appearing in stack if simply unmatched logic was different
        // But mainly to enforce "Block" behavior where we don't want old swipe records interfering
        await prisma.swipe.deleteMany({
            where: {
                OR: [
                    { swiperId: userId, swipedId: reportedUserId },
                    { swiperId: reportedUserId, swipedId: userId }
                ]
            }
        });

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
