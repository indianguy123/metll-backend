import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';

/**
 * Get referral statistics for the authenticated user
 * GET /api/referrals/stats
 */
export const getReferralStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                referralCode: true,
                totalReferrals: true,
                rewardsEarned: true,
                rewardsUsed: true,
            },
        });

        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        // Get rewards details
        const rewards = await prisma.reward.findMany({
            where: { userId: req.user.id },
            orderBy: { earnedAt: 'desc' },
        });

        res.status(200).json({
            success: true,
            data: {
                stats: user,
                rewards,
            },
        });
    } catch (error: any) {
        console.error('Get referral stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get referral stats',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Redeem a reward (e.g. coffee date)
 * POST /api/referrals/redeem
 */
export const redeemReward = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        // Find an available reward
        const reward = await prisma.reward.findFirst({
            where: {
                userId: req.user.id,
                status: 'available',
            },
            orderBy: { earnedAt: 'asc' }, // Use oldest first
        });

        if (!reward) {
            res.status(400).json({
                success: false,
                message: 'No available rewards to redeem',
            });
            return;
        }

        const userId = req.user.id;

        // Process redemption (update DB)
        const updatedReward = await prisma.$transaction(async (tx) => {
            // Mark reward as used
            const r = await tx.reward.update({
                where: { id: reward.id },
                data: {
                    status: 'used',
                    usedAt: new Date(),
                },
            });

            // Update user stats
            await tx.user.update({
                where: { id: userId },
                data: {
                    rewardsUsed: { increment: 1 },
                },
            });

            return r;
        });

        // Notify user that their reward was activated
        try {
            const { notifyRewardUsed } = await import('../services/notification.service');
            await notifyRewardUsed(userId);
        } catch (notifyError) {
            console.error('Failed to send reward notification:', notifyError);
        }

        res.status(200).json({
            success: true,
            message: 'Reward redeemed successfully',
            data: {
                reward: updatedReward,
            },
        });
    } catch (error: any) {
        console.error('Redeem reward error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to redeem reward',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};
