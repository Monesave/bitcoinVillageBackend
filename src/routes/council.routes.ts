import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { requireCouncilMember, optionalCouncilMember } from '../middleware/council.middleware';
import * as councilController from '../controllers/council.controller';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const getCouncilMembersSchema = z.object({
  query: z.object({
    status: z.string().optional(),
  }),
});

const getCouncilMemberSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID'),
  }),
});

const createProposalSchema = z.object({
  body: z.object({
    proposalType: z.enum(['ban', 'unban', 'reward', 'crowdfunding_assistance']),
    targetType: z.string(),
    targetId: z.string().uuid('Invalid target ID'),
    description: z.string().min(1),
    metadata: z.record(z.any()).optional(),
    votingDeadline: z.string().datetime().optional(),
    minVotesRequired: z.number().int().positive().default(3),
    votesRequiredForApproval: z.number().int().positive().default(3),
  }),
});

const getProposalsSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    proposalType: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const getProposalSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid proposal ID'),
  }),
});

const voteOnProposalSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid proposal ID'),
  }),
  body: z.object({
    vote: z.enum(['yes', 'no', 'abstain']),
    reason: z.string().max(1000).optional(),
  }),
});

const createRewardProposalSchema = z.object({
  body: z.object({
    recipientId: z.string().uuid('Invalid recipient ID'),
    amountSats: z.number().int().positive(),
    reason: z.string().min(1),
  }),
});

const getRewardsSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    recipientId: z.string().uuid().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const createCrowdfundingAssistanceSchema = z.object({
  body: z.object({
    campaignId: z.string().uuid('Invalid campaign ID'),
    assistanceType: z.enum(['donation', 'feature', 'promotion']),
    amountSats: z.number().int().positive().optional(),
    notes: z.string().optional(),
  }),
});

const getCrowdfundingAssistanceSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    campaignId: z.string().uuid().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const approveItemSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid listing ID'),
  }),
  body: z.object({
    action: z.enum(['approve', 'reject']),
    notes: z.string().max(1000).optional(),
  }),
});

const resolveDisputeSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid dispute ID'),
  }),
  body: z.object({
    action: z.enum(['approve', 'reject', 'partial']),
    resolution: z.string().max(5000).optional(),
    winnerId: z.string().uuid().optional(),
    notes: z.string().max(1000).optional(),
  }),
});

const getPendingApprovalsSchema = z.object({
  query: z.object({
    type: z.enum(['marketplace', 'service']).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const getOpenDisputesSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

// ============================================================================
// COUNCIL MEMBERSHIP ROUTES (Public)
// ============================================================================

router.get('/members', optionalAuth, validate(getCouncilMembersSchema), councilController.getCouncilMembers);
router.get('/members/:userId', optionalAuth, validate(getCouncilMemberSchema), councilController.getCouncilMember);

// ============================================================================
// COUNCIL PROPOSAL ROUTES (Council Members Only)
// ============================================================================

router.post('/proposals', authenticate, requireCouncilMember, validate(createProposalSchema), councilController.createProposal);
router.get('/proposals', optionalAuth, validate(getProposalsSchema), councilController.getProposals);
router.get('/proposals/:id', optionalAuth, validate(getProposalSchema), councilController.getProposal);
router.post('/proposals/:id/vote', authenticate, requireCouncilMember, validate(voteOnProposalSchema), councilController.voteOnProposal);

// ============================================================================
// COUNCIL REWARDS ROUTES (Council Members Only)
// ============================================================================

router.post('/rewards', authenticate, requireCouncilMember, validate(createRewardProposalSchema), councilController.createRewardProposal);
router.get('/rewards', authenticate, validate(getRewardsSchema), councilController.getRewards);

// ============================================================================
// COUNCIL CROWDFUNDING ASSISTANCE ROUTES (Council Members Only)
// ============================================================================

router.post('/assistance', authenticate, requireCouncilMember, validate(createCrowdfundingAssistanceSchema), councilController.createCrowdfundingAssistance);
router.get('/assistance', authenticate, validate(getCrowdfundingAssistanceSchema), councilController.getCrowdfundingAssistance);

// ============================================================================
// ITEM APPROVAL ROUTES (Council Members Only)
// ============================================================================

router.get('/approvals/pending', authenticate, requireCouncilMember, validate(getPendingApprovalsSchema), councilController.getPendingApprovals);
router.post('/marketplace/:id/approve', authenticate, requireCouncilMember, validate(approveItemSchema), councilController.approveMarketplaceListing);
router.post('/services/:id/approve', authenticate, requireCouncilMember, validate(approveItemSchema), councilController.approveServiceListing);

// ============================================================================
// DISPUTE RESOLUTION ROUTES (Council Members Only)
// ============================================================================

router.get('/disputes', authenticate, requireCouncilMember, validate(getOpenDisputesSchema), councilController.getOpenDisputes);
router.post('/disputes/:id/resolve', authenticate, requireCouncilMember, validate(resolveDisputeSchema), councilController.resolveDispute);

export default router;

