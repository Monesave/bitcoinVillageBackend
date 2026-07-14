// @ts-nocheck

// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { AppError, calculateCommission, calculateNetAmount, PLATFORM_FEE_PERCENTAGE } from '../../shared/src/utils';

// ============================================================================
// CAMPAIGNS
// ============================================================================

// Get all campaigns
export const getCampaigns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      category,
      status = 'active',
      featured,
      search,
      minGoal,
      maxGoal,
      page = 1,
      limit = 20,
    } = req.query;

    let query = supabase
      .from('campaigns')
      .select(`
        *,
        creator:profiles!campaigns_creator_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          reputation_score
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq('status', status as string);
    }

    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }

    if (category) {
      query = query.eq('category', category as string);
    }

    if (minGoal) {
      query = query.gte('goal_sats', parseInt(minGoal as string));
    }

    if (maxGoal) {
      query = query.lte('goal_sats', parseInt(maxGoal as string));
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

    const { data: campaigns, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch campaigns', 500, 'DATABASE_ERROR');
    }

    // Calculate progress percentage for each campaign
    const campaignsWithProgress = campaigns?.map((campaign: any) => ({
      ...campaign,
      progressPercentage: campaign.goal_sats > 0 
        ? Math.min(100, (campaign.current_sats / campaign.goal_sats) * 100) 
        : 0,
      daysRemaining: campaign.deadline 
        ? Math.max(0, Math.ceil((new Date(campaign.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
        : null,
    }));

    res.json({
      success: true,
      data: {
        campaigns: campaignsWithProgress || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single campaign
export const getCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select(`
        *,
        creator:profiles!campaigns_creator_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          reputation_score,
          total_transactions
        ),
        donations:donations(
          *,
          donor:profiles!donations_donor_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !campaign) {
      throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    // Increment view count (non-blocking)
    supabase
      .from('campaigns')
      .update({ views: (campaign.views || 0) + 1 })
      .eq('id', id)
      .then(() => {});

    // Calculate progress
    const progressPercentage = campaign.goal_sats > 0 
      ? Math.min(100, (campaign.current_sats / campaign.goal_sats) * 100) 
      : 0;
    
    const daysRemaining = campaign.deadline 
      ? Math.max(0, Math.ceil((new Date(campaign.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    // Sort donations by created_at desc, but hide anonymous donor info
    const donations = (campaign.donations || []).map((donation: any) => {
      if (donation.is_anonymous && donation.donor_id !== req.user?.id) {
        return {
          ...donation,
          donor: {
            id: null,
            username: 'Anonymous',
            display_name: 'Anonymous',
            avatar_url: null,
          },
        };
      }
      return donation;
    });

    res.json({
      success: true,
      data: {
        campaign: {
          ...campaign,
          donations,
          progressPercentage,
          daysRemaining,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create campaign
export const createCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const {
      title,
      description,
      category,
      goalSats,
      goalUsd,
      images = [],
      videoUrl,
      deadline,
    } = req.body;

    if (!title || !goalSats) {
      throw new AppError('Title and goal amount are required', 400, 'VALIDATION_ERROR');
    }

    const goalSatsNum = typeof goalSats === 'string' ? parseInt(goalSats) : goalSats;
    const goalUsdNum = goalUsd ? (typeof goalUsd === 'string' ? parseFloat(goalUsd) : goalUsd) : null;

    // Create campaign
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({
        creator_id: req.user.id,
        title,
        description,
        category,
        goal_sats: goalSatsNum,
        goal_usd: goalUsdNum,
        current_sats: 0,
        current_usd: 0,
        images: Array.isArray(images) ? images : [],
        video_url: videoUrl,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        status: 'active',
        is_featured: false,
        views: 0,
      })
      .select(`
        *,
        creator:profiles!campaigns_creator_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      throw new AppError('Failed to create campaign', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: { campaign },
    });
  } catch (error) {
    next(error);
  }
};

// Update campaign
export const updateCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const {
      title,
      description,
      category,
      goalSats,
      goalUsd,
      images,
      videoUrl,
      deadline,
      status,
      isFeatured,
    } = req.body;

    // Verify campaign belongs to user
    const { data: existingCampaign } = await supabase
      .from('campaigns')
      .select('creator_id, status')
      .eq('id', id)
      .single();

    if (!existingCampaign) {
      throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    if (existingCampaign.creator_id !== req.user.id) {
      throw new AppError('Not authorized to update this campaign', 403, 'FORBIDDEN');
    }

    // Build update object
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (goalSats !== undefined) {
      updates.goal_sats = typeof goalSats === 'string' ? parseInt(goalSats) : goalSats;
    }
    if (goalUsd !== undefined) {
      updates.goal_usd = goalUsd ? (typeof goalUsd === 'string' ? parseFloat(goalUsd) : goalUsd) : null;
    }
    if (images !== undefined) updates.images = Array.isArray(images) ? images : [];
    if (videoUrl !== undefined) updates.video_url = videoUrl;
    if (deadline !== undefined) {
      updates.deadline = deadline ? new Date(deadline).toISOString() : null;
    }
    if (status !== undefined) updates.status = status;
    if (isFeatured !== undefined) updates.is_featured = isFeatured;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        creator:profiles!campaigns_creator_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      throw new AppError('Failed to update campaign', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Campaign updated successfully',
      data: { campaign },
    });
  } catch (error) {
    next(error);
  }
};

// Delete campaign (only if no donations)
export const deleteCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;

    // Verify campaign belongs to user
    const { data: existingCampaign } = await supabase
      .from('campaigns')
      .select('creator_id, current_sats')
      .eq('id', id)
      .single();

    if (!existingCampaign) {
      throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    if (existingCampaign.creator_id !== req.user.id) {
      throw new AppError('Not authorized to delete this campaign', 403, 'FORBIDDEN');
    }

    // Check if campaign has donations
    if (existingCampaign.current_sats > 0) {
      // Deactivate instead of delete
      await supabase
        .from('campaigns')
        .update({ status: 'closed' })
        .eq('id', id);

      res.json({
        success: true,
        message: 'Campaign closed (has donations)',
      });
    } else {
      // Safe to delete
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) {
        throw new AppError('Failed to delete campaign', 500, 'DATABASE_ERROR');
      }

      res.json({
        success: true,
        message: 'Campaign deleted successfully',
      });
    }
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// DONATIONS
// ============================================================================

// Create donation
export const createDonation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id: campaignId } = req.params;
    const { amountSats, amountUsd, isAnonymous = false, message } = req.body;

    if (!amountSats || amountSats <= 0) {
      throw new AppError('Valid donation amount is required', 400, 'VALIDATION_ERROR');
    }

    const amountSatsNum = typeof amountSats === 'string' ? parseInt(amountSats) : amountSats;
    const amountUsdNum = amountUsd ? (typeof amountUsd === 'string' ? parseFloat(amountUsd) : amountUsd) : null;

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    if (campaign.status !== 'active') {
      throw new AppError('Campaign is not active', 400, 'CAMPAIGN_NOT_ACTIVE');
    }

    // Check deadline
    if (campaign.deadline && new Date(campaign.deadline) < new Date()) {
      throw new AppError('Campaign deadline has passed', 400, 'CAMPAIGN_DEADLINE_PASSED');
    }

    if (campaign.creator_id === req.user.id) {
      throw new AppError('Cannot donate to your own campaign', 400, 'VALIDATION_ERROR');
    }

    // Check donor has sufficient balance
    const { data: donorWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (!donorWallet || donorWallet.balance_sats < amountSatsNum) {
      throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
    }

    // Calculate commission and net amount
    const commissionSats = calculateCommission(amountSatsNum, PLATFORM_FEE_PERCENTAGE);
    const netAmountSats = calculateNetAmount(amountSatsNum, PLATFORM_FEE_PERCENTAGE);

    // Create transaction record for donor (outgoing)
    const { data: donorTransaction, error: donorTxError } = await supabase
      .from('transactions')
      .insert({
        user_id: req.user.id,
        transaction_type: 'donation',
        related_type: 'campaign',
        related_id: campaignId,
        amount_sats: amountSatsNum,
        commission_sats: 0,
        net_amount_sats: amountSatsNum,
        status: 'completed',
        description: `Donation to campaign: ${campaign.title}`,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (donorTxError) {
      throw new AppError('Failed to create transaction', 500, 'TRANSACTION_ERROR');
    }

    // Create transaction record for creator (incoming, after commission)
    const { data: creatorTransaction, error: creatorTxError } = await supabase
      .from('transactions')
      .insert({
        user_id: campaign.creator_id,
        transaction_type: 'donation_received',
        related_type: 'campaign',
        related_id: campaignId,
        amount_sats: netAmountSats,
        commission_sats: 0,
        net_amount_sats: netAmountSats,
        status: 'completed',
        description: `Donation received for campaign: ${campaign.title}`,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (creatorTxError) {
      // Rollback donor transaction
      await supabase.from('transactions').delete().eq('id', donorTransaction.id);
      throw new AppError('Failed to create creator transaction', 500, 'TRANSACTION_ERROR');
    }

    // Create commission transaction
    if (commissionSats > 0) {
      await supabase.from('transactions').insert({
        user_id: campaign.creator_id,
        transaction_type: 'commission',
        related_type: 'campaign',
        related_id: campaignId,
        amount_sats: commissionSats,
        commission_sats: 0,
        net_amount_sats: commissionSats,
        status: 'completed',
        description: 'Platform commission from donation',
        completed_at: new Date().toISOString(),
      });
    }

    // Create donation record
    const { data: donation, error: donationError } = await supabase
      .from('donations')
      .insert({
        campaign_id: campaignId,
        donor_id: req.user.id,
        transaction_id: donorTransaction.id,
        amount_sats: amountSatsNum,
        amount_usd: amountUsdNum,
        is_anonymous: isAnonymous,
        message: message,
      })
      .select(`
        *,
        donor:profiles!donations_donor_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (donationError) {
      // Rollback transactions
      await supabase.from('transactions').delete().eq('id', donorTransaction.id);
      await supabase.from('transactions').delete().eq('id', creatorTransaction.id);
      throw new AppError('Failed to create donation', 500, 'DATABASE_ERROR');
    }

    // Update campaign totals
    const newCurrentSats = campaign.current_sats + netAmountSats;
    const newCurrentUsd = campaign.current_usd 
      ? (campaign.current_usd + (amountUsdNum || 0))
      : null;

    await supabase
      .from('campaigns')
      .update({
        current_sats: newCurrentSats,
        current_usd: newCurrentUsd,
        // Check if goal reached
        status: newCurrentSats >= campaign.goal_sats ? 'completed' : campaign.status,
      })
      .eq('id', campaignId);

    // Update wallets
    // Deduct from donor
    await supabase
      .from('wallets')
      .update({
        balance_sats: donorWallet.balance_sats - amountSatsNum,
        total_spent_sats: donorWallet.total_spent_sats + amountSatsNum,
      })
      .eq('user_id', req.user.id);

    // Add to creator
    const { data: creatorWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', campaign.creator_id)
      .single();

    if (creatorWallet) {
      await supabase
        .from('wallets')
        .update({
          balance_sats: creatorWallet.balance_sats + netAmountSats,
          total_earned_sats: creatorWallet.total_earned_sats + netAmountSats,
        })
        .eq('user_id', campaign.creator_id);
    } else {
      // Create wallet if doesn't exist
      await supabase
        .from('wallets')
        .insert({
          user_id: campaign.creator_id,
          balance_sats: netAmountSats,
          total_earned_sats: netAmountSats,
        });
    }

    res.status(201).json({
      success: true,
      message: 'Donation created successfully',
      data: { 
        donation: {
          ...donation,
          // Hide donor info if anonymous
          donor: isAnonymous ? {
            id: null,
            username: 'Anonymous',
            display_name: 'Anonymous',
            avatar_url: null,
          } : donation.donor,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get campaign donations
export const getCampaignDonations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    const { data: donations, error } = await supabase
      .from('donations')
      .select(`
        *,
        donor:profiles!donations_donor_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new AppError('Failed to fetch donations', 500, 'DATABASE_ERROR');
    }

    // Hide anonymous donor info (unless user is the donor)
    const donationsWithPrivacy = donations?.map((donation: any) => {
      if (donation.is_anonymous && donation.donor_id !== req.user?.id) {
        return {
          ...donation,
          donor: {
            id: null,
            username: 'Anonymous',
            display_name: 'Anonymous',
            avatar_url: null,
          },
        };
      }
      return donation;
    });

    res.json({
      success: true,
      data: {
        donations: donationsWithPrivacy || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get user's donations
export const getMyDonations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    const { data: donations, error } = await supabase
      .from('donations')
      .select(`
        *,
        campaign:campaigns(
          *,
          creator:profiles!campaigns_creator_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        )
      `)
      .eq('donor_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

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
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get user's campaigns
export const getMyCampaigns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { status, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('campaigns')
      .select('*')
      .eq('creator_id', req.user.id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status as string);
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: campaigns, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch campaigns', 500, 'DATABASE_ERROR');
    }

    // Calculate progress
    const campaignsWithProgress = campaigns?.map((campaign: any) => ({
      ...campaign,
      progressPercentage: campaign.goal_sats > 0 
        ? Math.min(100, (campaign.current_sats / campaign.goal_sats) * 100) 
        : 0,
      daysRemaining: campaign.deadline 
        ? Math.max(0, Math.ceil((new Date(campaign.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
        : null,
    }));

    res.json({
      success: true,
      data: {
        campaigns: campaignsWithProgress || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

