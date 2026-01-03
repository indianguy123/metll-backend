import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';

/**
 * Create a new confession
 * POST /api/confessions
 */
export const createConfession = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const { description, targetUserId, latitude, longitude } = req.body;

    if (!description) {
      res.status(400).json({
        success: false,
        message: 'Description is required',
      });
      return;
    }

    // Create confession
    const confession = await prisma.confession.create({
      data: {
        userId: req.user.id,
        description,
        targetUserId: targetUserId ? parseInt(targetUserId) : null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Confession created successfully',
      data: {
        confession,
      },
    });
  } catch (error: any) {
    console.error('Create confession error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create confession',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get user's confessions
 * GET /api/confessions
 */
export const getConfessions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const confessions = await prisma.confession.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      data: {
        confessions,
        count: confessions.length,
      },
    });
  } catch (error: any) {
    console.error('Get confessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get confessions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

