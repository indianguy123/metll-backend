import { Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.util';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';

/**
 * Protect middleware - verifies JWT token
 */
export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'No token provided. Please login.',
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = verifyToken(token);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        phoneNumber: true,
        isVerified: true,
      },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found. Token invalid.',
      });
      return;
    }

    if (!user.isVerified) {
      res.status(403).json({
        success: false,
        message: 'Account not verified. Please verify your phone number.',
      });
      return;
    }

    // Attach user to request
    req.user = {
      id: user.id,
      phoneNumber: user.phoneNumber,
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired token',
    });
  }
};

