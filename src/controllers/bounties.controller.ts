// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { createEscrow, releaseEscrow, refundEscrow } from '../services/escrow.service';
import { AppError, calculateCommission, calculateNetAmount, PLATFORM_FEE_PERCENTAGE } from '../../shared/src/utils';

// ============================================================================
// BOUNTIES
// ============================================================================

// Get all bounties
export const getBounties = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      category,
      status = 'open',
      search,
      minReward,
      maxReward,
      page = 1,
      limit = 20,
    } = req.query;

    let query = supabase
      .from('bounties')
      .select(`
        *,
        creator:profiles!bounties_creator_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          reputation_score
        ),
        submissions:bounty_submissions(
          id,
          solver_id,
          status,
          submitted_at
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq('status', status as string);
    }

    if (category) {
      query = query.eq('category', category as string);
    }

    if (minReward) {
      query = query.gte('reward_sats', parseInt(minReward as string));
    }

    if (maxReward) {
      query = query.lte('reward_sats', parseInt(maxReward as string));
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

    const { data: bounties, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch bounties', 500, 'DATABASE_ERROR');
    }

    // Add submission count and award count to each bounty
    const bountiesWithStats = bounties?.map((bounty: any) => ({
      ...bounty,
      submissionCount: bounty.submissions?.length || 0,
      awardedCount: bounty.submissions?.filter((s: any) => s.status === 'awarded').length || 0,
    }));

    res.json({
      success: true,
      data: {
        bounties: bountiesWithStats || [],
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

// Get single bounty
export const getBounty = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: bounty, error } = await supabase
      .from('bounties')
      .select(`
        *,
        creator:profiles!bounties_creator_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          reputation_score,
          total_transactions
        ),
        submissions:bounty_submissions(
          *,
          solver:profiles!bounty_submissions_solver_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            reputation_score
          ),
          award:bounty_awards(*)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !bounty) {
      throw new AppError('Bounty not found', 404, 'BOUNTY_NOT_FOUND');
    }

    res.json({
      success: true,
      data: { bounty },
    });
  } catch (error) {
    next(error);
  }
};

// Create bounty
export const createBounty = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const {
      title,
      description,
      category,
      rewardSats,
      maxSolvers = 1,
      deadline,
    } = req.body;

    if (!title || !rewardSats) {
      throw new AppError('Title and reward amount are required', 400, 'VALIDATION_ERROR');
    }

    const rewardSatsNum = typeof rewardSats === 'string' ? parseInt(rewardSats) : rewardSats;
    const maxSolversNum = typeof maxSolvers === 'string' ? parseInt(maxSolvers) : maxSolvers;

    // Check user has sufficient balance
    const { data: creatorWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (!creatorWallet || (creatorWallet as any).balance_sats < rewardSatsNum) {
      throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
    }

    // Create escrow for bounty reward
    // Note: For bounties, we need to create escrow but the seller will be determined later
    // We'll use a placeholder seller_id for now, or handle it differently
    // Actually, for bounties, the escrow should be created when the bounty is awarded
    // So let's not create escrow upfront, but reserve the funds

    // For now, we'll create the bounty without escrow and create escrow when awarding
    // But we need to lock the funds. Let's use pending balance for now
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (wallet) {
      const walletData = wallet as any;
      await supabase
        .from('wallets')
        // @ts-ignore - Supabase type inference issue
        .update({
          balance_sats: walletData.balance_sats - rewardSatsNum,
          pending_balance_sats: walletData.pending_balance_sats + rewardSatsNum,
        } as any)
        .eq('user_id', req.user.id);
    }

    // Create transaction record
    const { data: transaction, error: txError } = await (supabase
      .from('transactions')
      .insert({
        user_id: req.user.id,
        transaction_type: 'bounty_escrow',
        related_type: 'bounty',
        amount_sats: rewardSatsNum,
        commission_sats: 0,
        net_amount_sats: rewardSatsNum,
        status: 'pending',
        description: `Bounty reward escrow: ${title}`,
      } as any) as any)
      .select()
      .single();

    if (txError) {
      // Rollback wallet update
      if (wallet) {
        const walletData = wallet as any;
        await supabase
          .from('wallets')
          // @ts-expect-error - Supabase type inference issue
          .update({
            balance_sats: walletData.balance_sats,
            pending_balance_sats: walletData.pending_balance_sats,
          } as any)
          .eq('user_id', req.user.id);
      }
      throw new AppError('Failed to create transaction', 500, 'TRANSACTION_ERROR');
    }

    // Create bounty
    if (!transaction) {
      throw new AppError('Transaction not created', 500, 'TRANSACTION_ERROR');
    }
    
    const transactionData = transaction as any;
    const { data: bounty, error: bountyError } = await (supabase
      .from('bounties')
      .insert({
        creator_id: req.user.id,
        title,
        description,
        category,
        reward_sats: rewardSatsNum,
        transaction_id: transactionData.id,
        status: 'open',
        max_solvers: maxSolversNum,
        deadline: deadline ? new Date(deadline).toISOString() : null,
      } as any) as any)
      .select(`
        *,
        creator:profiles!bounties_creator_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (bountyError) {
      // Rollback transaction and wallet
      await supabase.from('transactions').delete().eq('id', transactionData.id);
      if (wallet) {
        const walletData = wallet as any;
        await supabase
          .from('wallets')
          // @ts-expect-error - Supabase type inference issue
          .update({
            balance_sats: walletData.balance_sats,
            pending_balance_sats: walletData.pending_balance_sats,
          } as any)
          .eq('user_id', req.user.id);
      }
      throw new AppError('Failed to create bounty', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      message: 'Bounty created successfully',
      data: { bounty },
    });
  } catch (error) {
    next(error);
  }
};

// Update bounty
export const updateBounty = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const {
      title,
      description,
      category,
      deadline,
      status,
    } = req.body;

    // Verify bounty belongs to user
    const { data: existingBounty } = await supabase
      .from('bounties')
      .select('creator_id, status')
      .eq('id', id)
      .single();

    if (!existingBounty) {
      throw new AppError('Bounty not found', 404, 'BOUNTY_NOT_FOUND');
    }

    const bountyData = existingBounty as any;
    if (bountyData.creator_id !== req.user.id) {
      throw new AppError('Not authorized to update this bounty', 403, 'FORBIDDEN');
    }

    // Can't update closed or awarded bounties
    if (bountyData.status === 'closed' || bountyData.status === 'awarded') {
      throw new AppError('Cannot update closed or awarded bounty', 400, 'INVALID_BOUNTY_STATUS');
    }

    // Build update object
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (deadline !== undefined) {
      updates.deadline = deadline ? new Date(deadline).toISOString() : null;
    }
    if (status !== undefined) updates.status = status;

    const { data: bounty, error } = await supabase
      .from('bounties')
      // @ts-expect-error - Supabase type inference issue
      .update(updates as any)
      .eq('id', id)
      .select(`
        *,
        creator:profiles!bounties_creator_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      throw new AppError('Failed to update bounty', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Bounty updated successfully',
      data: { bounty },
    });
  } catch (error) {
    next(error);
  }
};

// Close bounty (refund if no awards)
export const closeBounty = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;

    // Get bounty with transaction
    const { data: bounty, error: bountyError } = await supabase
      .from('bounties')
      .select('*, transaction:transactions(*)')
      .eq('id', id)
      .single();

    if (bountyError || !bounty) {
      throw new AppError('Bounty not found', 404, 'BOUNTY_NOT_FOUND');
    }

    const bountyData = bounty as any;
    if (bountyData.creator_id !== req.user.id) {
      throw new AppError('Only creator can close bounty', 403, 'FORBIDDEN');
    }

    if (bountyData.status === 'closed' || bountyData.status === 'awarded') {
      throw new AppError('Bounty already closed or awarded', 400, 'INVALID_BOUNTY_STATUS');
    }

    // Check if any awards have been made
    const { data: awards } = await supabase
      .from('bounty_awards')
      .select('id')
      .eq('bounty_id', id);

    if (awards && awards.length > 0) {
      throw new AppError('Cannot close bounty with existing awards', 400, 'BOUNTY_HAS_AWARDS');
    }

    // Refund the reward to creator
    const transaction = bountyData.transaction as any;
    if (transaction && transaction.status === 'pending') {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', req.user.id)
        .single();

      if (wallet) {
        const walletData = wallet as any;
        await supabase
          .from('wallets')
          // @ts-expect-error - Supabase type inference issue
          .update({
            balance_sats: walletData.balance_sats + bountyData.reward_sats,
            pending_balance_sats: walletData.pending_balance_sats - bountyData.reward_sats,
          } as any)
          .eq('user_id', req.user.id);
      }

      // Update transaction status
      await supabase
        .from('transactions')
        // @ts-ignore - Supabase type inference issue
        .update({
          status: 'cancelled',
          description: 'Bounty closed - refunded',
        } as any)
        .eq('id', transaction.id);
    }

    // Update bounty status
    await supabase
      .from('bounties')
      // @ts-expect-error - Supabase type inference issue
      .update({ status: 'closed' } as any)
      .eq('id', id);

    res.json({
      success: true,
      message: 'Bounty closed and refunded',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// BOUNTY SUBMISSIONS
// ============================================================================

// Create bounty submission
export const createSubmission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id: bountyId } = req.params;
    const { submissionText, submissionFiles = [] } = req.body;

    if (!submissionText) {
      throw new AppError('Submission text is required', 400, 'VALIDATION_ERROR');
    }

    // Get bounty
    const { data: bounty, error: bountyError } = await supabase
      .from('bounties')
      .select('*')
      .eq('id', bountyId)
      .single();

    if (bountyError || !bounty) {
      throw new AppError('Bounty not found', 404, 'BOUNTY_NOT_FOUND');
    }

    const bountyData = bounty as any;
    if (bountyData.status !== 'open') {
      throw new AppError('Bounty is not open for submissions', 400, 'BOUNTY_NOT_OPEN');
    }

    // Check deadline
    if (bountyData.deadline && new Date(bountyData.deadline) < new Date()) {
      throw new AppError('Bounty deadline has passed', 400, 'BOUNTY_DEADLINE_PASSED');
    }

    // Check if user already submitted
    const { data: existingSubmission } = await supabase
      .from('bounty_submissions')
      .select('id')
      .eq('bounty_id', bountyId)
      .eq('solver_id', req.user.id)
      .single();

    if (existingSubmission) {
      throw new AppError('You have already submitted to this bounty', 400, 'ALREADY_SUBMITTED');
    }

    // Create submission
    const { data: submission, error: submissionError } = await (supabase
      .from('bounty_submissions')
      .insert({
        bounty_id: bountyId,
        solver_id: req.user.id,
        submission_text: submissionText,
        submission_files: Array.isArray(submissionFiles) ? submissionFiles : [],
        status: 'pending',
      } as any) as any)
      .select(`
        *,
        solver:profiles!bounty_submissions_solver_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (submissionError) {
      throw new AppError('Failed to create submission', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      message: 'Submission created successfully',
      data: { submission },
    });
  } catch (error) {
    next(error);
  }
};

// Get submission
export const getSubmission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;

    const { data: submission, error } = await supabase
      .from('bounty_submissions')
      .select(`
        *,
        bounty:bounties(*),
        solver:profiles!bounty_submissions_solver_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          reputation_score
        ),
        award:bounty_awards(*)
      `)
      .eq('id', id)
      .single();

    if (error || !submission) {
      throw new AppError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');
    }

    const submissionData = submission as any;
    const bounty = submissionData.bounty as any;
    // Verify user is creator or solver
    if (bounty?.creator_id !== req.user.id && submissionData.solver_id !== req.user.id) {
      throw new AppError('Not authorized to view this submission', 403, 'FORBIDDEN');
    }

    res.json({
      success: true,
      data: { submission },
    });
  } catch (error) {
    next(error);
  }
};

// Get bounty submissions
export const getBountySubmissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id: bountyId } = req.params;

    // Verify user is creator
    const { data: bounty } = await supabase
      .from('bounties')
      .select('creator_id')
      .eq('id', bountyId)
      .single();

    const bountyData = bounty as any;
    if (!bounty || bountyData.creator_id !== req.user.id) {
      throw new AppError('Only creator can view submissions', 403, 'FORBIDDEN');
    }

    const { data: submissions, error } = await supabase
      .from('bounty_submissions')
      .select(`
        *,
        solver:profiles!bounty_submissions_solver_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          reputation_score
        ),
        award:bounty_awards(*)
      `)
      .eq('bounty_id', bountyId)
      .order('submitted_at', { ascending: false });

    if (error) {
      throw new AppError('Failed to fetch submissions', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: { submissions: submissions || [] },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// BOUNTY AWARDS
// ============================================================================

// Award bounty to submission
export const awardBounty = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { id: bountyId } = req.params;
    const { submissionId } = req.body;

    if (!submissionId) {
      throw new AppError('Submission ID is required', 400, 'VALIDATION_ERROR');
    }

    // Get bounty with transaction
    const { data: bounty, error: bountyError } = await supabase
      .from('bounties')
      .select('*, transaction:transactions(*)')
      .eq('id', bountyId)
      .single();

    if (bountyError || !bounty) {
      throw new AppError('Bounty not found', 404, 'BOUNTY_NOT_FOUND');
    }

    const bountyData = bounty as any;
    if (bountyData.creator_id !== req.user.id) {
      throw new AppError('Only creator can award bounty', 403, 'FORBIDDEN');
    }

    if (bountyData.status === 'closed' || bountyData.status === 'awarded') {
      throw new AppError('Bounty already closed or awarded', 400, 'INVALID_BOUNTY_STATUS');
    }

    // Get submission
    const { data: submission, error: submissionError } = await supabase
      .from('bounty_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('bounty_id', bountyId)
      .single();

    if (submissionError || !submission) {
      throw new AppError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');
    }

    // Check if already awarded
    const { data: existingAward } = await supabase
      .from('bounty_awards')
      .select('id')
      .eq('bounty_id', bountyId)
      .eq('submission_id', submissionId)
      .single();

    if (existingAward) {
      throw new AppError('Submission already awarded', 400, 'ALREADY_AWARDED');
    }

    // Check max solvers limit
    const { data: existingAwards } = await supabase
      .from('bounty_awards')
      .select('id')
      .eq('bounty_id', bountyId);

    if ((existingAwards?.length || 0) >= bountyData.max_solvers) {
      throw new AppError('Maximum number of awards reached', 400, 'MAX_AWARDS_REACHED');
    }

    // Create transaction and escrow for the award
    // Note: Funds are already locked in creator's pending_balance from bounty creation
    const transaction = bountyData.transaction as any;
    
    // Calculate commission and net amount
    const commissionSats = calculateCommission(bountyData.reward_sats, PLATFORM_FEE_PERCENTAGE);
    const netAmountSats = calculateNetAmount(bountyData.reward_sats, PLATFORM_FEE_PERCENTAGE);

    const submissionData = submission as any;
    // Create award transaction (seller receives the reward)
    const { data: awardTransaction, error: txError } = await (supabase
      .from('transactions')
      .insert({
        user_id: submissionData.solver_id,
        transaction_type: 'bounty_award',
        related_type: 'bounty',
        related_id: bountyId,
        amount_sats: bountyData.reward_sats,
        commission_sats: commissionSats,
        net_amount_sats: netAmountSats,
        status: 'completed',
        description: `Bounty award: ${bountyData.title}`,
        completed_at: new Date().toISOString(),
      } as any) as any)
      .select()
      .single();

    if (txError || !awardTransaction) {
      throw new AppError('Failed to create award transaction', 500, 'TRANSACTION_ERROR');
    }

    // Create escrow account (for tracking, but funds are already released)
    const autoReleaseAt = new Date();
    autoReleaseAt.setDate(autoReleaseAt.getDate() + 7);

    const awardTransactionData = awardTransaction as any;
    const { data: escrow, error: escrowError } = await (supabase
      .from('escrow_accounts')
      .insert({
        transaction_id: awardTransactionData.id,
        buyer_id: req.user.id,
        seller_id: submissionData.solver_id,
        amount_sats: netAmountSats,
        status: 'released', // Immediately released
        released_at: new Date().toISOString(),
        auto_release_at: autoReleaseAt.toISOString(),
      } as any) as any)
      .select()
      .single();

    if (escrowError) {
      // Rollback transaction
      await supabase.from('transactions').delete().eq('id', awardTransactionData.id);
      throw new AppError('Failed to create escrow', 500, 'ESCROW_ERROR');
    }

    // Transfer funds from creator's pending to solver's balance
    const { data: creatorWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    const { data: solverWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', submissionData.solver_id)
      .single();

    if (creatorWallet) {
      const creatorWalletData = creatorWallet as any;
      await supabase
        .from('wallets')
        // @ts-ignore - Supabase type inference issue
        .update({
          pending_balance_sats: creatorWalletData.pending_balance_sats - bountyData.reward_sats,
        } as any)
        .eq('user_id', req.user.id);
    }

    if (solverWallet) {
      const solverWalletData = solverWallet as any;
      await supabase
        .from('wallets')
        // @ts-ignore - Supabase type inference issue
        .update({
          balance_sats: solverWalletData.balance_sats + netAmountSats,
          total_earned_sats: solverWalletData.total_earned_sats + netAmountSats,
        } as any)
        .eq('user_id', submissionData.solver_id);
    } else {
      // Create wallet if doesn't exist
      await supabase
        .from('wallets')
        // @ts-ignore - Supabase type inference issue
        .insert({
          user_id: submissionData.solver_id,
          balance_sats: netAmountSats,
          total_earned_sats: netAmountSats,
        } as any);
    }

    // Create commission transaction for platform
    if (commissionSats > 0) {
      // @ts-ignore - Supabase type inference issue
      await supabase.from('transactions').insert({
          user_id: submissionData.solver_id,
          transaction_type: 'commission',
          related_type: 'bounty',
          related_id: bountyId,
          amount_sats: commissionSats,
          commission_sats: 0,
          net_amount_sats: commissionSats,
          status: 'completed',
          description: 'Platform commission',
          completed_at: new Date().toISOString(),
        } as any);
    }

    // Create award record
    const { data: award, error: awardError } = await (supabase
      .from('bounty_awards')
      .insert({
        bounty_id: bountyId,
        submission_id: submissionId,
        solver_id: submissionData.solver_id,
        transaction_id: awardTransactionData.id,
        reward_sats: bountyData.reward_sats,
      } as any) as any)
      .select()
      .single();

    if (awardError) {
      // Rollback escrow (already released, so we'd need to handle this)
      throw new AppError('Failed to create award', 500, 'DATABASE_ERROR');
    }

    // Update submission status
    await supabase
      .from('bounty_submissions')
      // @ts-expect-error - Supabase type inference issue
      .update({ status: 'awarded' } as any)
      .eq('id', submissionId);

    // Update original bounty transaction status
    if (transaction && transaction.status === 'pending') {
      const transactionData = transaction as any;
      await supabase
        .from('transactions')
        // @ts-ignore - Supabase type inference issue
        .update({
          status: 'completed',
          description: `Bounty awarded to solver`,
        } as any)
        .eq('id', transactionData.id);
    }

    // Update bounty status if max solvers reached
    if ((existingAwards?.length || 0) + 1 >= bountyData.max_solvers) {
      await supabase
        .from('bounties')
        // @ts-ignore - Supabase type inference issue
        .update({ status: 'awarded' } as any)
        .eq('id', bountyId);
    }

    // Get full award with related data
    if (!award) {
      throw new AppError('Failed to create award', 500, 'DATABASE_ERROR');
    }
    
    const awardData = award as any;
    const { data: fullAward } = await supabase
      .from('bounty_awards')
      .select(`
        *,
        submission:bounty_submissions(*),
        solver:profiles!bounty_awards_solver_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .eq('id', awardData.id)
      .single();

    res.json({
      success: true,
      message: 'Bounty awarded successfully',
      data: { award: fullAward },
    });
  } catch (error) {
    next(error);
  }
};

// Get user's submissions
export const getMySubmissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { status, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('bounty_submissions')
      .select(`
        *,
        bounty:bounties(
          *,
          creator:profiles!bounties_creator_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        ),
        award:bounty_awards(*)
      `)
      .eq('solver_id', req.user.id)
      .order('submitted_at', { ascending: false });

    if (status) {
      query = query.eq('status', status as string);
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: submissions, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch submissions', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        submissions: submissions || [],
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

