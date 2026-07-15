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

// Get all donations
export const getDonations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('donations')
      .select('*')
      .order('id', { ascending: false });

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

// Create a donation
export const createDonation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, wallet, amount, description, images } = req.body;

    const accessToken = getAccessToken(req);
    if (!accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    
    const db = createUserClient(accessToken);
    const { data: donation, error } = await db
      .from('donations')
      .insert([
        {
          title,
          wallet,
          amount,
          description,
          images: images || [],
        }
      ])
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to create donation', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      data: donation,
    });
  } catch (error) {
    next(error);
  }
};

// Update a donation
export const updateDonation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const accessToken = getAccessToken(req);
    if (!accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    
    const db = createUserClient(accessToken);
    const { data: donation, error } = await db
      .from('donations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to update donation', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: donation,
    });
  } catch (error) {
    next(error);
  }
};

// Delete a donation
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
      throw new AppError('Failed to delete donation', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Donation deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
