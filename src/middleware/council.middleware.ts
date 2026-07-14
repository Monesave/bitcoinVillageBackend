// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { AppError } from '../../shared/src/utils';;

/**
 * Middleware to check if user is an active council member
 */
export const requireCouncilMember = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    // Check if user is an active council member
    const { data: councilMember, error } = await supabase
      .from('council_members')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .single();

    if (error || !councilMember) {
      throw new AppError('Council member access required', 403, 'FORBIDDEN');
    }

    // Check if term is still valid (if term_end_date is set)
    if (councilMember.term_end_date) {
      const termEnd = new Date(councilMember.term_end_date);
      if (termEnd < new Date()) {
        throw new AppError('Council member term has expired', 403, 'FORBIDDEN');
      }
    }

    // Attach council member info to request
    req.councilMember = councilMember;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional council member check - doesn't fail if not a council member
 */
export const optionalCouncilMember = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return next();
    }

    const { data: councilMember } = await supabase
      .from('council_members')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .single();

    if (councilMember) {
      // Check if term is still valid
      if (!councilMember.term_end_date || new Date(councilMember.term_end_date) >= new Date()) {
        req.councilMember = councilMember;
      }
    }

    next();
  } catch (error) {
    // Continue without council member status
    next();
  }
};

// Extend Express Request to include councilMember
declare global {
  namespace Express {
    interface Request {
      councilMember?: {
        id: string;
        user_id: string;
        status: string;
        approved_by?: string;
        approved_at?: string;
        term_start_date?: string;
        term_end_date?: string;
        notes?: string;
      };
    }
  }
}

