// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase, createUserClient } from '../services/supabase';
import { AppError } from '../../shared/src/utils';

const getAccessToken = (req: Request): string | undefined => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return undefined;
};

// Get all donations (fundraising requests)
export const getDonations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('donations')
      .select('*')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: donations, error, count } = await query;

    if (error) {
      console.error('[donations.controller] getDonations error:', JSON.stringify(error, null, 2));
      throw new AppError('Failed to fetch donations', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        donations: donations || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single donation
export const getDonation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: donation, error } = await supabase
      .from('donations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !donation) {
      throw new AppError('Donation not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: donation,
    });
  } catch (error) {
    next(error);
  }
};

// Create a donation request
export const createDonation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, wallet, amount, description, images, category } = req.body;
    const userId = req.user?.id;
    const accessToken = getAccessToken(req);

    if (!userId || !accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);
    const { data: donation, error } = await db
      .from('donations')
      .insert([
        {
          user_id: userId,
          title,
          wallet,
          amount,
          description,
          category,
          images: images || [],
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('[donations.controller] INSERT error:', JSON.stringify(error, null, 2));
      throw new AppError(`Failed to create donation: ${error.message}`, 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      data: donation,
    });
  } catch (error) {
    next(error);
  }
};

// Update a donation request
export const updateDonation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.id;
    const accessToken = getAccessToken(req);

    if (!userId || !accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);

    const { data: existing, error: fetchError } = await db
      .from('donations')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      // Try without ownership check if user_id column doesn't exist yet
      const { data: donation, error } = await db
        .from('donations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        console.error('[donations.controller] UPDATE error:', JSON.stringify(error, null, 2));
        throw new AppError(`Failed to update donation: ${error.message}`, 500, 'DATABASE_ERROR');
      }
      return res.json({ success: true, data: donation });
    }

    if (existing.user_id && existing.user_id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const { data: donation, error } = await db
      .from('donations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[donations.controller] UPDATE error:', JSON.stringify(error, null, 2));
      throw new AppError(`Failed to update donation: ${error.message}`, 500, 'DATABASE_ERROR');
    }

    res.json({ success: true, data: donation });
  } catch (error) {
    next(error);
  }
};

// Delete a donation request
export const deleteDonation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const accessToken = getAccessToken(req);

    if (!accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);
    const { error } = await db
      .from('donations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[donations.controller] DELETE error:', JSON.stringify(error, null, 2));
      throw new AppError(`Failed to delete donation: ${error.message}`, 500, 'DATABASE_ERROR');
    }

    res.json({ success: true, message: 'Donation deleted successfully' });
  } catch (error) {
    next(error);
  }
};
