// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { AppError, calculateCommission, calculateNetAmount, PLATFORM_FEE_PERCENTAGE } from '../../shared/src/utils';



// ============================================================================
// COUNCIL MEMBERSHIP
// ============================================================================

// Get all council members
export const getCouncilMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('council_members')
      .select(`
        *,
        user:profiles!council_members_user_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          reputation_score
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

    const { data: members, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch council members', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: { members: members || [] },
    });
  } catch (error) {
    next(error);
  }
};

// Get council member by user ID
export const getCouncilMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;

    const { data: member, error } = await supabase
      .from('council_members')
      .select(`
        *,
        user:profiles!council_members_user_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          reputation_score
        ),
        approver:profiles!council_members_approved_by_fkey (
          id,
          username,
          display_name
        )
      `)
      .eq('user_id', userId)
      .single();

    if (error || !member) {
      throw new AppError('Council member not found', 404, 'COUNCIL_MEMBER_NOT_FOUND');
    }

    res.json({
      success: true,
      data: { member },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// COUNCIL PROPOSALS
// ============================================================================

// Create proposal (for voting on bans, rewards, etc.)
export const createProposal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.councilMember) {
      throw new AppError('Council member access required', 403, 'FORBIDDEN');
    }

    const {
      proposalType,
      targetType,
      targetId,
      description,
      metadata,
      votingDeadline,
      minVotesRequired = 3,
      votesRequiredForApproval = 3,
    } = req.body;

    if (!proposalType || !targetType || !targetId || !description) {
      throw new AppError('Proposal type, target type, target ID, and description are required', 400, 'VALIDATION_ERROR');
    }

    const validProposalTypes = ['ban', 'unban', 'reward', 'crowdfunding_assistance'];
    if (!validProposalTypes.includes(proposalType)) {
      throw new AppError('Invalid proposal type', 400, 'VALIDATION_ERROR');
    }

    // Create proposal
    const { data: proposal, error } = await supabase
      .from('council_proposals')
      .insert({
        proposal_type: proposalType,
        target_type: targetType,
        target_id: targetId,
        proposed_by: req.user.id,
        status: 'open',
        description,
        metadata: metadata || {},
        voting_deadline: votingDeadline ? new Date(votingDeadline).toISOString() : null,
        min_votes_required: parseInt(minVotesRequired),
        votes_required_for_approval: parseInt(votesRequiredForApproval),
      })
      .select(`
        *,
        proposer:profiles!council_proposals_proposed_by_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      throw new AppError('Failed to create proposal', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      message: 'Proposal created successfully',
      data: { proposal },
    });
  } catch (error) {
    next(error);
  }
};

// Get proposals
export const getProposals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, proposalType, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('council_proposals')
      .select(`
        *,
        proposer:profiles!council_proposals_proposed_by_fkey (
          id,
          username,
          display_name,
          avatar_url
        ),
        resolver:profiles!council_proposals_resolved_by_fkey (
          id,
          username,
          display_name
        ),
        votes:council_votes(
          *,
          council_member:council_members(
            user:profiles!council_members_user_id_fkey (
              id,
              username,
              display_name
            )
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status as string);
    }

    if (proposalType) {
      query = query.eq('proposal_type', proposalType as string);
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: proposals, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch proposals', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        proposals: proposals || [],
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

// Get single proposal
export const getProposal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: proposal, error } = await supabase
      .from('council_proposals')
      .select(`
        *,
        proposer:profiles!council_proposals_proposed_by_fkey (
          id,
          username,
          display_name,
          avatar_url
        ),
        resolver:profiles!council_proposals_resolved_by_fkey (
          id,
          username,
          display_name
        ),
        votes:council_votes(
          *,
          council_member:council_members(
            user:profiles!council_members_user_id_fkey (
              id,
              username,
              display_name
            )
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !proposal) {
      throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
    }

    res.json({
      success: true,
      data: { proposal },
    });
  } catch (error) {
    next(error);
  }
};

// Vote on proposal
export const voteOnProposal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.councilMember) {
      throw new AppError('Council member access required', 403, 'FORBIDDEN');
    }

    const { id: proposalId } = req.params;
    const { vote, reason } = req.body;

    if (!vote || !['yes', 'no', 'abstain'].includes(vote)) {
      throw new AppError('Valid vote (yes/no/abstain) is required', 400, 'VALIDATION_ERROR');
    }

    // Get proposal
    const { data: proposal, error: proposalError } = await supabase
      .from('council_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (proposalError || !proposal) {
      throw new AppError('Proposal not found', 404, 'PROPOSAL_NOT_FOUND');
    }

    if (proposal.status !== 'open' && proposal.status !== 'voting') {
      throw new AppError('Proposal is not open for voting', 400, 'PROPOSAL_NOT_OPEN');
    }

    // Check if deadline passed
    if (proposal.voting_deadline && new Date(proposal.voting_deadline) < new Date()) {
      throw new AppError('Voting deadline has passed', 400, 'DEADLINE_PASSED');
    }

    // Check if already voted
    const { data: existingVote } = await supabase
      .from('council_votes')
      .select('id, vote')
      .eq('council_member_id', req.councilMember.id)
      .eq('vote_type', proposal.proposal_type)
      .eq('target_type', proposal.target_type)
      .eq('target_id', proposal.target_id)
      .single();

    let voteId;
    if (existingVote) {
      // Update existing vote
      const { data: updatedVote, error: updateError } = await supabase
        .from('council_votes')
        .update({ vote, reason: reason || null })
        .eq('id', existingVote.id)
        .select()
        .single();

      if (updateError) {
        throw new AppError('Failed to update vote', 500, 'DATABASE_ERROR');
      }

      voteId = updatedVote.id;

      // Update proposal vote counts (decrement old vote, increment new vote)
      // This is simplified - in production you might want a more robust solution
    } else {
      // Create new vote
      const { data: newVote, error: voteError } = await supabase
        .from('council_votes')
        .insert({
          council_member_id: req.councilMember.id,
          vote_type: proposal.proposal_type,
          target_type: proposal.target_type,
          target_id: proposal.target_id,
          vote,
          reason: reason || null,
        })
        .select()
        .single();

      if (voteError) {
        throw new AppError('Failed to create vote', 500, 'DATABASE_ERROR');
      }

      voteId = newVote.id;
    }

    // Update proposal vote counts
    const { data: allVotes } = await supabase
      .from('council_votes')
      .select('vote')
      .eq('vote_type', proposal.proposal_type)
      .eq('target_type', proposal.target_type)
      .eq('target_id', proposal.target_id);

    const yesVotes = allVotes?.filter((v) => v.vote === 'yes').length || 0;
    const noVotes = allVotes?.filter((v) => v.vote === 'no').length || 0;
    const abstainVotes = allVotes?.filter((v) => v.vote === 'abstain').length || 0;

    // Update proposal
    const newStatus = proposal.status === 'open' ? 'voting' : proposal.status;
    await supabase
      .from('council_proposals')
      .update({
        status: newStatus,
        yes_votes: yesVotes,
        no_votes: noVotes,
        abstain_votes: abstainVotes,
      })
      .eq('id', proposalId);

    res.json({
      success: true,
      message: 'Vote recorded successfully',
      data: { voteId },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// COUNCIL REWARDS
// ============================================================================

// Create reward proposal
export const createRewardProposal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.councilMember) {
      throw new AppError('Council member access required', 403, 'FORBIDDEN');
    }

    const { recipientId, amountSats, reason } = req.body;

    if (!recipientId || !amountSats || !reason) {
      throw new AppError('Recipient ID, amount, and reason are required', 400, 'VALIDATION_ERROR');
    }

    const amountSatsNum = typeof amountSats === 'string' ? parseInt(amountSats) : amountSats;

    if (amountSatsNum <= 0) {
      throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
    }

    // Verify recipient exists
    const { data: recipient } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', recipientId)
      .single();

    if (!recipient) {
      throw new AppError('Recipient not found', 404, 'USER_NOT_FOUND');
    }

    // Create proposal first
    const { data: proposal, error: proposalError } = await supabase
      .from('council_proposals')
      .insert({
        proposal_type: 'reward',
        target_type: 'user',
        target_id: recipientId,
        proposed_by: req.user.id,
        status: 'open',
        description: reason,
        metadata: {
          amountSats: amountSatsNum,
        },
        min_votes_required: 3,
        votes_required_for_approval: 3,
      })
      .select()
      .single();

    if (proposalError) {
      throw new AppError('Failed to create proposal', 500, 'DATABASE_ERROR');
    }

    // Create reward record
    const { data: reward, error: rewardError } = await supabase
      .from('council_rewards')
      .insert({
        proposal_id: proposal.id,
        recipient_id: recipientId,
        amount_sats: amountSatsNum,
        reason,
        status: 'pending',
        created_by: req.user.id,
      })
      .select(`
        *,
        recipient:profiles!council_rewards_recipient_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        ),
        creator:profiles!council_rewards_created_by_fkey (
          id,
          username,
          display_name
        )
      `)
      .single();

    if (rewardError) {
      // Rollback proposal
      await supabase.from('council_proposals').delete().eq('id', proposal.id);
      throw new AppError('Failed to create reward', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      message: 'Reward proposal created successfully',
      data: { reward, proposal },
    });
  } catch (error) {
    next(error);
  }
};

// Get rewards
export const getRewards = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, recipientId, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('council_rewards')
      .select(`
        *,
        recipient:profiles!council_rewards_recipient_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        ),
        creator:profiles!council_rewards_created_by_fkey (
          id,
          username,
          display_name
        ),
        proposal:council_proposals(*)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status as string);
    }

    if (recipientId) {
      query = query.eq('recipient_id', recipientId as string);
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: rewards, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch rewards', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        rewards: rewards || [],
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
// COUNCIL CROWDFUNDING ASSISTANCE
// ============================================================================

// Create crowdfunding assistance proposal
export const createCrowdfundingAssistance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.councilMember) {
      throw new AppError('Council member access required', 403, 'FORBIDDEN');
    }

    const { campaignId, assistanceType, amountSats, notes } = req.body;

    if (!campaignId || !assistanceType) {
      throw new AppError('Campaign ID and assistance type are required', 400, 'VALIDATION_ERROR');
    }

    const validTypes = ['donation', 'feature', 'promotion'];
    if (!validTypes.includes(assistanceType)) {
      throw new AppError('Invalid assistance type', 400, 'VALIDATION_ERROR');
    }

    // Verify campaign exists
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    const amountSatsNum = amountSats ? (typeof amountSats === 'string' ? parseInt(amountSats) : amountSats) : null;

    // Create proposal
    const { data: proposal, error: proposalError } = await supabase
      .from('council_proposals')
      .insert({
        proposal_type: 'crowdfunding_assistance',
        target_type: 'campaign',
        target_id: campaignId,
        proposed_by: req.user.id,
        status: 'open',
        description: notes || `Council assistance: ${assistanceType}`,
        metadata: {
          assistanceType,
          amountSats: amountSatsNum,
        },
        min_votes_required: 3,
        votes_required_for_approval: 3,
      })
      .select()
      .single();

    if (proposalError) {
      throw new AppError('Failed to create proposal', 500, 'DATABASE_ERROR');
    }

    // Create assistance record
    const { data: assistance, error: assistanceError } = await supabase
      .from('council_crowdfunding_assistance')
      .insert({
        proposal_id: proposal.id,
        campaign_id: campaignId,
        assistance_type: assistanceType,
        amount_sats: amountSatsNum,
        notes: notes || null,
        status: 'pending',
        created_by: req.user.id,
      })
      .select(`
        *,
        campaign:campaigns(*),
        creator:profiles!council_crowdfunding_assistance_created_by_fkey (
          id,
          username,
          display_name
        )
      `)
      .single();

    if (assistanceError) {
      // Rollback proposal
      await supabase.from('council_proposals').delete().eq('id', proposal.id);
      throw new AppError('Failed to create assistance', 500, 'DATABASE_ERROR');
    }

    res.status(201).json({
      success: true,
      message: 'Crowdfunding assistance proposal created successfully',
      data: { assistance, proposal },
    });
  } catch (error) {
    next(error);
  }
};

// Get crowdfunding assistance
export const getCrowdfundingAssistance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, campaignId, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('council_crowdfunding_assistance')
      .select(`
        *,
        campaign:campaigns(*),
        creator:profiles!council_crowdfunding_assistance_created_by_fkey (
          id,
          username,
          display_name
        ),
        proposal:council_proposals(*)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status as string);
    }

    if (campaignId) {
      query = query.eq('campaign_id', campaignId as string);
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query.range(from, to);

    const { data: assistance, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch assistance', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        assistance: assistance || [],
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
// ITEM APPROVAL (Council Members)
// ============================================================================

// Approve or reject marketplace listing
export const approveMarketplaceListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.councilMember) {
      throw new AppError('Council member access required', 403, 'FORBIDDEN');
    }

    const { id } = req.params;
    const { action, notes } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      throw new AppError('Action must be approve or reject', 400, 'VALIDATION_ERROR');
    }

    const { data: listing, error } = await supabase
      .from('marketplace_listings')
      .update({
        approval_status: action === 'approve' ? 'approved' : 'rejected',
        approved_by: req.user.id,
        approval_notes: notes || null,
        is_active: action === 'approve',
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !listing) {
      throw new AppError('Listing not found', 404, 'LISTING_NOT_FOUND');
    }

    res.json({
      success: true,
      message: `Listing ${action}d successfully`,
      data: { listing },
    });
  } catch (error) {
    next(error);
  }
};

// Approve or reject service listing
export const approveServiceListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.councilMember) {
      throw new AppError('Council member access required', 403, 'FORBIDDEN');
    }

    const { id } = req.params;
    const { action, notes } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      throw new AppError('Action must be approve or reject', 400, 'VALIDATION_ERROR');
    }

    const { data: listing, error } = await supabase
      .from('service_listings')
      .update({
        approval_status: action === 'approve' ? 'approved' : 'rejected',
        approved_by: req.user.id,
        approval_notes: notes || null,
        is_active: action === 'approve',
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !listing) {
      throw new AppError('Listing not found', 404, 'LISTING_NOT_FOUND');
    }

    res.json({
      success: true,
      message: `Listing ${action}d successfully`,
      data: { listing },
    });
  } catch (error) {
    next(error);
  }
};

// Get pending approvals (marketplace and service listings)
export const getPendingApprovals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.councilMember) {
      throw new AppError('Council member access required', 403, 'FORBIDDEN');
    }

    const { type, page = 1, limit = 20 } = req.query;

    let marketplaceListings = [];
    let serviceListings = [];

    // Get pending marketplace listings
    if (!type || type === 'marketplace') {
      const { data: marketplace } = await supabase
        .from('marketplace_listings')
        .select(`
          *,
          seller:profiles!marketplace_listings_seller_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            reputation_score
          )
        `)
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(parseInt(limit as string) || 20)
        .range((parseInt(page as string) - 1) * (parseInt(limit as string) || 20), parseInt(page as string) * (parseInt(limit as string) || 20) - 1);

      marketplaceListings = marketplace || [];
    }

    // Get pending service listings
    if (!type || type === 'service') {
      const { data: services } = await supabase
        .from('service_listings')
        .select(`
          *,
          provider:profiles!service_listings_provider_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            reputation_score
          )
        `)
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(parseInt(limit as string) || 20)
        .range((parseInt(page as string) - 1) * (parseInt(limit as string) || 20), parseInt(page as string) * (parseInt(limit as string) || 20) - 1);

      serviceListings = services || [];
    }

    res.json({
      success: true,
      data: {
        marketplaceListings,
        serviceListings,
        pagination: {
          page: parseInt(page as string) || 1,
          limit: parseInt(limit as string) || 20,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// DISPUTE RESOLUTION (Council Members)
// ============================================================================

// Get open disputes
export const getOpenDisputes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.councilMember) {
      throw new AppError('Council member access required', 403, 'FORBIDDEN');
    }

    const { page = 1, limit = 20 } = req.query;

    const { data: disputes, error } = await supabase
      .from('disputes')
      .select(`
        *,
        initiator:profiles!disputes_initiator_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        ),
        respondent:profiles!disputes_respondent_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .in('status', ['open', 'in_review'])
      .order('created_at', { ascending: false })
      .range((parseInt(page as string) - 1) * (parseInt(limit as string) || 20), parseInt(page as string) * (parseInt(limit as string) || 20) - 1);

    if (error) {
      throw new AppError('Failed to fetch disputes', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: {
        disputes: disputes || [],
        pagination: {
          page: parseInt(page as string) || 1,
          limit: parseInt(limit as string) || 20,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Resolve dispute
export const resolveDispute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.councilMember) {
      throw new AppError('Council member access required', 403, 'FORBIDDEN');
    }

    const { id } = req.params;
    const { action, resolution, winnerId, notes } = req.body;

    if (!action || !['approve', 'reject', 'partial'].includes(action)) {
      throw new AppError('Action must be approve, reject, or partial', 400, 'VALIDATION_ERROR');
    }

    // Get dispute
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .select('*')
      .eq('id', id)
      .single();

    if (disputeError || !dispute) {
      throw new AppError('Dispute not found', 404, 'DISPUTE_NOT_FOUND');
    }

    if (dispute.status !== 'open' && dispute.status !== 'in_review') {
      throw new AppError('Dispute already resolved', 400, 'DISPUTE_ALREADY_RESOLVED');
    }

    // Determine status based on action
    let status = 'resolved';
    if (action === 'reject') {
      status = 'rejected';
    } else if (action === 'partial') {
      status = 'partially_resolved';
    }

    // Create resolution record
    const { data: resolutionRecord, error: resolutionError } = await supabase
      .from('dispute_resolutions')
      .insert({
        dispute_id: id,
        resolved_by: req.user.id,
        resolution_type: action,
        resolution_details: resolution || notes || '',
        winner_id: winnerId || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (resolutionError) {
      throw new AppError('Failed to create resolution record', 500, 'DATABASE_ERROR');
    }

    // Update dispute status
    const { data: updatedDispute, error: updateError } = await supabase
      .from('disputes')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: req.user.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new AppError('Failed to update dispute', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      message: 'Dispute resolved successfully',
      data: {
        dispute: updatedDispute,
        resolution: resolutionRecord,
      },
    });
  } catch (error) {
    next(error);
  }
};
