// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { AppError } from '../../shared/src/utils';;

/**
 * Middleware to check if user is an admin
 * Checks:
 * 1. profiles.is_admin column in database (primary check)
 * 2. User metadata for 'is_admin' or 'role: admin' (fallback)
 * 3. Environment variable ADMIN_EMAILS (comma-separated list) (fallback)
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    // Primary check: Get profile from database and check is_admin column
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, is_admin')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      throw new AppError('User profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    // Check database is_admin flag (primary method)
    if (profile.is_admin === true) {
      req.isAdmin = true;
      return next();
    }

    // Fallback checks for backward compatibility
    const userEmail = req.user.email?.toLowerCase();
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0);

    // Check if user is admin via metadata
    const isAdminInMetadata = 
      (req.user as any).is_admin === true ||
      (req.user as any).role === 'admin';

    // Check if user email is in admin list
    const isAdminByEmail = userEmail && adminEmails.includes(userEmail);

    if (!isAdminInMetadata && !isAdminByEmail) {
      throw new AppError('Admin access required', 403, 'FORBIDDEN');
    }

    req.isAdmin = true;
    next();
  } catch (error) {
    next(error);
  }
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      isAdmin?: boolean;
    }
  }
}

