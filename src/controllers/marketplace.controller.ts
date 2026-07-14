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

// Get all marketplace listings
export const getListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('marketplace')
      .select(`
        *,
        seller:users!marketplace_seller_fkey (
          id,
          name,
          avatar
        )
      `)
      .order('id', { ascending: false });

    // Apply filters
    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: listings, error, count } = await query;

    if (error) {
      throw new AppError('Failed to fetch listings', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        listings: listings || [],
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

// Get single listing
export const getListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: listing, error } = await supabase
      .from('marketplace')
      .select(`
        *,
        seller:users!marketplace_seller_fkey (
          id,
          name,
          avatar
        )
      `)
      .eq('id', id)
      .single();

    if (error || !listing) {
      throw new AppError('Listing not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: listing,
    });
  } catch (error) {
    next(error);
  }
};

// Create a listing
export const createListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, price, images } = req.body;
    const userId = req.user?.id; 

    const accessToken = getAccessToken(req);
    if (!userId || !accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);
    const { data: listing, error } = await db
      .from('marketplace')
      .insert([
        {
          seller: userId,
          title,
          price,
          images,
        }
      ])
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to create listing', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      data: listing,
    });
  } catch (error) {
    next(error);
  }
};

// Update a listing
export const updateListing = async (req: Request, res: Response, next: NextFunction) => {
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
      .from('marketplace')
      .select('seller')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new AppError('Listing not found', 404, 'NOT_FOUND');
    }

    if (existing.seller !== userId) {
      throw new AppError('Forbidden: You can only edit your own listing', 403, 'FORBIDDEN');
    }

    const { data: listing, error } = await db
      .from('marketplace')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to update listing', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: listing,
    });
  } catch (error) {
    next(error);
  }
};

// Delete a listing
export const deleteListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const accessToken = getAccessToken(req);
    if (!userId || !accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);

    const { data: existing, error: fetchError } = await db
      .from('marketplace')
      .select('seller')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new AppError('Listing not found', 404, 'NOT_FOUND');
    }

    if (existing.seller !== userId) {
      throw new AppError('Forbidden: You can only delete your own listing', 403, 'FORBIDDEN');
    }

    const { error } = await db
      .from('marketplace')
      .delete()
      .eq('id', id);

    if (error) {
      throw new AppError('Failed to delete listing', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Listing deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
