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

// Get all businesses
export const getBusinesses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('businesses')
      .select(`
        *,
        owner:users!businesses_owner_id_fkey (
          id,
          name,
          avatar
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (category) {
      query = query.eq('category', category as string);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: businesses, error, count } = await query;

    if (error) {
      throw new AppError('Failed to fetch businesses', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        businesses: businesses || [],
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

// Get single business
export const getBusiness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: business, error } = await supabase
      .from('businesses')
      .select(`
        *,
        owner:users!businesses_owner_id_fkey (
          id,
          name,
          avatar
        )
      `)
      .eq('id', id)
      .single();

    if (error || !business) {
      throw new AppError('Business not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: business,
    });
  } catch (error) {
    next(error);
  }
};

// Create a business
export const createBusiness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, category, image } = req.body;
    const userId = req.user?.id; // Assumes authMiddleware attaches user

    const accessToken = getAccessToken(req);
    if (!userId || !accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);
    const { data: business, error } = await db
      .from('businesses')
      .insert([
        {
          owner_id: userId,
          title,
          description,
          category,
          image,
        }
      ])
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to create business', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      data: business,
    });
  } catch (error) {
    next(error);
  }
};

// Update a business
export const updateBusiness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.id;

    const accessToken = getAccessToken(req);
    if (!userId || !accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);

    // First check if the business belongs to the user
    const { data: existingBusiness, error: fetchError } = await db
      .from('businesses')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingBusiness) {
      throw new AppError('Business not found', 404, 'NOT_FOUND');
    }

    if (existingBusiness.owner_id !== userId) {
      throw new AppError('Forbidden: You can only edit your own business', 403, 'FORBIDDEN');
    }

    const { data: business, error } = await db
      .from('businesses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to update business', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: business,
    });
  } catch (error) {
    next(error);
  }
};

// Delete a business
export const deleteBusiness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const accessToken = getAccessToken(req);
    if (!userId || !accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);

    // Check ownership
    const { data: existingBusiness, error: fetchError } = await db
      .from('businesses')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingBusiness) {
      throw new AppError('Business not found', 404, 'NOT_FOUND');
    }

    if (existingBusiness.owner_id !== userId) {
      throw new AppError('Forbidden: You can only delete your own business', 403, 'FORBIDDEN');
    }

    const { error } = await db
      .from('businesses')
      .delete()
      .eq('id', id);

    if (error) {
      throw new AppError('Failed to delete business', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Business deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
