// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { AppError } from '../../shared/src/utils';;

// Get user profile
export const getUserProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (profileError || !profile) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Get reputation score
    const { data: reputation } = await supabase
      .from('reputation_scores')
      .select('*')
      .eq('user_id', id)
      .single();

    // Get wallet (only if requesting own profile or authenticated)
    let wallet = null;
    if (req.user?.id === id || req.user) {
      const { data: walletData } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', id)
        .single();
      wallet = walletData;
    }

    res.json({
      success: true,
      data: {
        profile: {
          ...profile,
          reputation: reputation || null,
          wallet: wallet,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update user profile
export const updateUserProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const { username, displayName, bio, location, avatarUrl } = req.body;

    // Verify user can only update their own profile
    if (req.user.id !== id) {
      throw new AppError('Unauthorized to update this profile', 403, 'FORBIDDEN');
    }

    // Check if username is taken (if provided)
    if (username) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .neq('id', id)
        .single();

      if (existing) {
        throw new AppError('Username already taken', 400, 'USERNAME_TAKEN');
      }
    }

    // Update profile
    const { data, error } = await supabase
      .from('profiles')
      .update({
        username,
        display_name: displayName,
        bio,
        location,
        avatar_url: avatarUrl,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to update profile', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { profile: data },
    });
  } catch (error) {
    next(error);
  }
};

// Get user wallet
export const getUserWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;

    // Verify user can only view their own wallet
    if (req.user.id !== id) {
      throw new AppError('Unauthorized to view this wallet', 403, 'FORBIDDEN');
    }

    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', id)
      .single();

    if (error || !wallet) {
      throw new AppError('Wallet not found', 404, 'WALLET_NOT_FOUND');
    }

    // Get connected wallets
    const { data: connections } = await supabase
      .from('wallet_connections')
      .select('*')
      .eq('user_id', id)
      .eq('is_active', true);

    res.json({
      success: true,
      data: {
        wallet,
        connections: connections || [],
      },
    });
  } catch (error) {
    next(error);
  }
};

// Connect external wallet
export const connectWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const { walletType, walletAddress } = req.body;

    // Verify user can only connect to their own account
    if (req.user.id !== id) {
      throw new AppError('Unauthorized', 403, 'FORBIDDEN');
    }

    // Check if wallet type is already connected
    const { data: existing } = await supabase
      .from('wallet_connections')
      .select('*')
      .eq('user_id', id)
      .eq('wallet_type', walletType)
      .eq('is_active', true)
      .single();

    if (existing) {
      // Update existing connection
      const { data, error } = await supabase
        .from('wallet_connections')
        .update({
          wallet_address: walletAddress,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw new AppError('Failed to update wallet connection', 500, 'DATABASE_ERROR');
      }

      return res.json({
        success: true,
        message: 'Wallet connection updated',
        data: { connection: data },
      });
    }

    // Create new connection
    const { data, error } = await supabase
      .from('wallet_connections')
      .insert({
        user_id: id,
        wallet_type: walletType,
        wallet_address: walletAddress,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to connect wallet', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      message: 'Wallet connected successfully',
      data: { connection: data },
    });
  } catch (error) {
    next(error);
  }
};

// Disconnect wallet
export const disconnectWallet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id, connectionId } = req.params;

    // Verify user owns this connection
    const { data: connection } = await supabase
      .from('wallet_connections')
      .select('user_id')
      .eq('id', connectionId)
      .single();

    if (!connection || connection.user_id !== id || id !== req.user.id) {
      throw new AppError('Unauthorized', 403, 'FORBIDDEN');
    }

    // Deactivate connection
    const { error } = await supabase
      .from('wallet_connections')
      .update({ is_active: false })
      .eq('id', connectionId);

    if (error) {
      throw new AppError('Failed to disconnect wallet', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Wallet disconnected successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get user reputation
export const getUserReputation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: reputation, error } = await supabase
      .from('reputation_scores')
      .select('*')
      .eq('user_id', id)
      .single();

    if (error || !reputation) {
      // Return default reputation if not found
      return res.json({
        success: true,
        data: {
          reputation: {
            overall_score: 0,
            marketplace_score: 0,
            services_score: 0,
            bounties_score: 0,
            total_reviews: 0,
            positive_reviews: 0,
            negative_reviews: 0,
          },
        },
      });
    }

    res.json({
      success: true,
      data: { reputation },
    });
  } catch (error) {
    next(error);
  }
};

// Get user reviews
export const getUserReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const { data: reviews, error } = await supabase
      .from('reviews')
      .select(`
        *,
        reviewer:profiles!reviews_reviewer_id_fkey(id, username, display_name, avatar_url)
      `)
      .eq('reviewee_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError('Failed to fetch reviews', 500, 'DATABASE_ERROR');
    }

    // Get total count
    const { count } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('reviewee_id', id);

    res.json({
      success: true,
      data: {
        reviews: reviews || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get user transactions
export const getUserTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;

    // Verify user can only view their own transactions
    if (req.user.id !== id) {
      throw new AppError('Unauthorized', 403, 'FORBIDDEN');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;

    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) {
      query = query.eq('transaction_type', type);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: transactions, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch transactions', 500, 'DATABASE_ERROR');
    }

    // Get total count
    let countQuery = supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    if (type) {
      countQuery = countQuery.eq('transaction_type', type);
    }

    if (status) {
      countQuery = countQuery.eq('status', status);
    }

    const { count } = await countQuery;

    res.json({
      success: true,
      data: {
        transactions: transactions || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

