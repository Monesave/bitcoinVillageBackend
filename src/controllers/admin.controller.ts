// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { AppError } from '../../shared/src/utils';

// ============================================================================
// MODERATION
// ============================================================================

// Moderate content (delete, hide, approve)
export const moderateContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { contentType, contentId, action, reason } = req.body;

    if (!contentType || !contentId || !action) {
      throw new AppError('Content type, content ID, and action are required', 400, 'VALIDATION_ERROR');
    }

    const validActions = ['approve', 'reject', 'hide', 'delete', 'feature', 'unfeature'];
    if (!validActions.includes(action)) {
      throw new AppError('Invalid action', 400, 'VALIDATION_ERROR');
    }

    // Log moderation action
    const { error: logError } = await (supabase
      .from('moderation_logs') as any)
      .insert({
        moderator_id: req.user.id,
        content_type: contentType,
        content_id: contentId,
        action,
        reason: reason || null,
      });

    if (logError) {
      throw new AppError('Failed to log moderation action', 500, 'DATABASE_ERROR');
    }

    // Perform the moderation action based on content type
    let updateResult;
    
    switch (contentType) {
      case 'marketplace_listing':
        if (action === 'delete') {
          updateResult = await supabase
            .from('marketplace_listings')
            .delete()
            .eq('id', contentId);
        } else if (action === 'hide') {
          updateResult = await (supabase
            .from('marketplace_listings') as any)
            .update({ is_active: false })
            .eq('id', contentId);
        } else if (action === 'approve') {
          updateResult = await (supabase
            .from('marketplace_listings') as any)
            .update({ is_active: true })
            .eq('id', contentId);
        }
        break;

      case 'service_listing':
        if (action === 'delete') {
          updateResult = await supabase
            .from('service_listings')
            .delete()
            .eq('id', contentId);
        } else if (action === 'hide') {
          updateResult = await (supabase
            .from('service_listings') as any)
            .update({ is_active: false })
            .eq('id', contentId);
        } else if (action === 'approve') {
          updateResult = await (supabase
            .from('service_listings') as any)
            .update({ is_active: true })
            .eq('id', contentId);
        }
        break;

      case 'bounty':
        if (action === 'delete') {
          updateResult = await supabase
            .from('bounties')
            .delete()
            .eq('id', contentId);
        } else if (action === 'hide') {
          updateResult = await (supabase
            .from('bounties') as any)
            .update({ status: 'closed' })
            .eq('id', contentId);
        }
        break;

      case 'campaign':
        if (action === 'delete') {
          updateResult = await supabase
            .from('campaigns')
            .delete()
            .eq('id', contentId);
        } else if (action === 'hide') {
          updateResult = await (supabase
            .from('campaigns') as any)
            .update({ status: 'closed' })
            .eq('id', contentId);
        } else if (action === 'feature') {
          updateResult = await (supabase
            .from('campaigns') as any)
            .update({ is_featured: true })
            .eq('id', contentId);
        } else if (action === 'unfeature') {
          updateResult = await (supabase
            .from('campaigns') as any)
            .update({ is_featured: false })
            .eq('id', contentId);
        }
        break;

      case 'review':
        if (action === 'delete') {
          updateResult = await supabase
            .from('reviews')
            .delete()
            .eq('id', contentId);
        } else if (action === 'hide') {
          // For reviews, we might want to add a hidden field or just delete
          updateResult = await supabase
            .from('reviews')
            .delete()
            .eq('id', contentId);
        }
        break;

      default:
        throw new AppError('Unsupported content type', 400, 'VALIDATION_ERROR');
    }

    if (updateResult?.error) {
      throw new AppError('Failed to perform moderation action', 500, 'DATABASE_ERROR');
    }

    // Log admin action
    await (supabase
      .from('admin_actions') as any)
      .insert({
        admin_id: req.user.id,
        action_type: `moderate_${action}`,
        target_type: contentType,
        target_id: contentId,
        description: reason || `Moderated ${contentType} with action: ${action}`,
        metadata: {
          action,
          reason,
        },
      });

    res.json({
      success: true,
      message: `Content ${action}ed successfully`,
    });
  } catch (error) {
    next(error);
  }
};

// Get moderation logs
export const getModerationLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { contentType, action, moderatorId, page = 1, limit = 50 } = req.query;

    let query = supabase
      .from('moderation_logs')
      .select(`
        *,
        moderator:profiles!moderation_logs_moderator_id_fkey (
          id,
          username,
          display_name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (contentType) {
      query = query.eq('content_type', contentType as string);
    }

    if (action) {
      query = query.eq('action', action as string);
    }

    if (moderatorId) {
      query = query.eq('moderator_id', moderatorId as string);
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: logs, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch moderation logs', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        logs: logs || [],
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

// ============================================================================
// USER MANAGEMENT
// ============================================================================

// Get all users (with filters)
export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { search, isVerified, page = 1, limit = 50 } = req.query;

    let query = supabase
      .from('profiles')
      .select(`
        *,
        wallet:wallets(*)
      `)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    if (isVerified === 'true') {
      query = query.eq('is_verified_villager', true);
    } else if (isVerified === 'false') {
      query = query.eq('is_verified_villager', false);
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: users, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch users', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        users: users || [],
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

// Get user details
export const getUserDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select(`
        *,
        wallet:wallets(*)
      `)
      .eq('id', id)
      .single();

    if (error || !profile) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Get additional stats
    const { count: marketplaceListings } = await supabase
      .from('marketplace_listings')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', id);

    const { count: serviceListings } = await supabase
      .from('service_listings')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', id);

    const { count: bounties } = await supabase
      .from('bounties')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', id);

    const { count: campaigns } = await supabase
      .from('campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', id);

    res.json({
      success: true,
      data: {
        user: profile,
        stats: {
          marketplaceListings: marketplaceListings || 0,
          serviceListings: serviceListings || 0,
          bounties: bounties || 0,
          campaigns: campaigns || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Ban/unban user
export const banUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (id === req.user.id) {
      throw new AppError('Cannot ban yourself', 400, 'VALIDATION_ERROR');
    }

    // Update user metadata to mark as banned
    // Note: In production, you might want to use Supabase Auth Admin API
    // For now, we'll log it and potentially add a banned field to profiles
    
    // Log admin action
    await (supabase
      .from('admin_actions') as any)
      .insert({
        admin_id: req.user.id,
        action_type: 'ban_user',
        target_type: 'user',
        target_id: id,
        description: reason || 'User banned by admin',
        metadata: {
          reason,
        },
      });

    // Log moderation action
    await (supabase
      .from('moderation_logs') as any)
      .insert({
        moderator_id: req.user.id,
        content_type: 'user',
        content_id: id,
        action: 'ban',
        reason: reason || 'User banned',
      });

    // In a real implementation, you would:
    // 1. Use Supabase Auth Admin API to disable the user
    // 2. Add a 'banned' or 'banned_at' field to profiles table
    // 3. Check this field in middleware before allowing access

    res.json({
      success: true,
      message: 'User banned successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// STATISTICS & ANALYTICS
// ============================================================================

// Get platform statistics
export const getPlatformStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    // Get user count
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const { count: verifiedUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_verified_villager', true);

    // Get total transaction volume
    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount_sats, status')
      .eq('status', 'completed');

    const totalVolume = transactions?.reduce((sum, tx: any) => sum + (tx.amount_sats || 0), 0) || 0;

    // Get content counts
    const { count: marketplaceListings } = await supabase
      .from('marketplace_listings')
      .select('*', { count: 'exact', head: true });

    const { count: serviceListings } = await supabase
      .from('service_listings')
      .select('*', { count: 'exact', head: true });

    const { count: bounties } = await supabase
      .from('bounties')
      .select('*', { count: 'exact', head: true });

    const { count: campaigns } = await supabase
      .from('campaigns')
      .select('*', { count: 'exact', head: true });

    // Get recent activity
    const { data: recentTransactions } = await supabase
      .from('transactions')
      .select('id, created_at, amount_sats')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers || 0,
          verified: verifiedUsers || 0,
        },
        volume: {
          totalSats: totalVolume,
        },
        content: {
          marketplaceListings: marketplaceListings || 0,
          serviceListings: serviceListings || 0,
          bounties: bounties || 0,
          campaigns: campaigns || 0,
        },
        recentActivity: {
          transactions: recentTransactions || [],
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get admin actions log
export const getAdminActions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { actionType, targetType, adminId, page = 1, limit = 50 } = req.query;

    let query = supabase
      .from('admin_actions')
      .select(`
        *,
        admin:profiles!admin_actions_admin_id_fkey (
          id,
          username,
          display_name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (actionType) {
      query = query.eq('action_type', actionType as string);
    }

    if (targetType) {
      query = query.eq('target_type', targetType as string);
    }

    if (adminId) {
      query = query.eq('admin_id', adminId as string);
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: actions, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch admin actions', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        actions: actions || [],
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

// ============================================================================
// VILLAGE COUNCIL MANAGEMENT
// ============================================================================

// Nominate user for council membership (create application)
export const nominateCouncilMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { userId, notes } = req.body;

    if (!userId) {
      throw new AppError('User ID is required', 400, 'VALIDATION_ERROR');
    }

    // Verify user exists
    const { data: user } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Check if user is already a council member
    const { data: existingMember } = await supabase
      .from('council_members')
      .select('id, status')
      .eq('user_id', userId)
      .single();

    if (existingMember) {
      throw new AppError('User is already a council member or has an application', 400, 'ALREADY_MEMBER');
    }

    // Create council member application
    const { data: application, error } = await (supabase
      .from('council_members') as any)
      .insert({
        user_id: userId,
        status: 'pending',
        notes: notes || null,
      })
      .select(`
        *,
        user:profiles!council_members_user_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          reputation_score
        )
      `)
      .single();

    if (error) {
      throw new AppError('Failed to create council application', 500, 'DATABASE_ERROR');
    }

    // Log admin action
    await (supabase
      .from('admin_actions') as any)
      .insert({
        admin_id: req.user.id,
        action_type: 'nominate_council_member',
        target_type: 'council_member',
        target_id: (application as any)?.id,
        description: `Nominated user for council membership`,
        metadata: { userId, notes },
      });

    res.status(201).json({
      success: true,
      message: 'Council member nomination created successfully',
      data: { application },
    });
  } catch (error) {
    next(error);
  }
};

// Get council member applications
export const getCouncilApplications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { status, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('council_members')
      .select(`
        *,
        user:profiles!council_members_user_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          reputation_score,
          total_transactions,
          total_volume_sats
        ),
        approver:profiles!council_members_approved_by_fkey (
          id,
          username,
          display_name
        )
      `)
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

    const { data: applications, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch council applications', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        applications: applications || [],
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

// Approve or reject council member application
export const reviewCouncilApplication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const { action, termStartDate, termEndDate, notes } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      throw new AppError('Action must be approve or reject', 400, 'VALIDATION_ERROR');
    }

    // Get application
    const { data: application, error: appError } = await supabase
      .from('council_members')
      .select('*')
      .eq('id', id)
      .single();

    if (appError || !application) {
      throw new AppError('Council application not found', 404, 'APPLICATION_NOT_FOUND');
    }

    if ((application as any)?.status !== 'pending') {
      throw new AppError('Application already reviewed', 400, 'ALREADY_REVIEWED');
    }

    const updates: any = {
      status: action === 'approve' ? 'active' : 'rejected',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
      notes: notes || null,
    };

    if (action === 'approve') {
      updates.term_start_date = termStartDate ? new Date(termStartDate).toISOString() : new Date().toISOString();
      updates.term_end_date = termEndDate ? new Date(termEndDate).toISOString() : null;
    }

    const { data: updated, error: updateError } = await (supabase
      .from('council_members') as any)
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        user:profiles!council_members_user_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        ),
        approver:profiles!council_members_approved_by_fkey (
          id,
          username,
          display_name
        )
      `)
      .single();

    if (updateError) {
      throw new AppError('Failed to update application', 500, 'DATABASE_ERROR');
    }

    // Log admin action
    await (supabase
      .from('admin_actions') as any)
      .insert({
        admin_id: req.user.id,
        action_type: `council_application_${action}`,
        target_type: 'council_member',
        target_id: id,
        description: `Council application ${action}d`,
        metadata: {
          action,
          termStartDate: updates.term_start_date,
          termEndDate: updates.term_end_date,
          notes,
        },
      });

    res.json({
      success: true,
      message: `Council application ${action}d successfully`,
      data: { application: updated },
    });
  } catch (error) {
    next(error);
  }
};

// Deactivate council member
export const deactivateCouncilMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const { reason } = req.body;

    // Get council member
    const { data: member, error: memberError } = await supabase
      .from('council_members')
      .select('*')
      .eq('id', id)
      .single();

    if (memberError || !member) {
      throw new AppError('Council member not found', 404, 'COUNCIL_MEMBER_NOT_FOUND');
    }

    if ((member as any)?.status !== 'active') {
      throw new AppError('Council member is not active', 400, 'NOT_ACTIVE');
    }

    const { data: updated, error: updateError } = await supabase
      .from('council_members')
      .update<never, any>({
        status: 'inactive',
        notes: reason || 'Deactivated by admin',
      })
      .eq('id', id)
      .select(`
        *,
        user:profiles!council_members_user_id_fkey (
          id,
          username,
          display_name
        )
      `)
      .single();

    if (updateError) {
      throw new AppError('Failed to deactivate council member', 500, 'DATABASE_ERROR');
    }

    // Log admin action
    await (supabase
      .from('admin_actions') as any)
      .insert({
        admin_id: req.user.id,
        action_type: 'deactivate_council_member',
        target_type: 'council_member',
        target_id: id,
        description: reason || 'Council member deactivated',
        metadata: { reason },
      });

    res.json({
      success: true,
      message: 'Council member deactivated successfully',
      data: { member: updated },
    });
  } catch (error) {
    next(error);
  }
};

