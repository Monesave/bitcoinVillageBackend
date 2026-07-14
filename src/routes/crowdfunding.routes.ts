import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { publicLimiter } from '../middleware/rateLimit.middleware';
import * as crowdfundingController from '../controllers/crowdfunding.controller';

const router = Router();

// Apply public rate limiting to campaign routes (public-facing)
router.use('/campaigns', publicLimiter);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const getCampaignsSchema = z.object({
  query: z.object({
    category: z.string().optional(),
    status: z.string().optional(),
    featured: z.string().optional(),
    search: z.string().optional(),
    minGoal: z.string().optional(),
    maxGoal: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const getCampaignSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID'),
  }),
});

const createCampaignSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    category: z.string().max(100).optional(),
    goalSats: z.number().int().positive(),
    goalUsd: z.number().positive().optional(),
    images: z.array(z.string().url()).optional(),
    videoUrl: z.string().url().optional(),
    deadline: z.string().datetime().optional(),
  }),
});

const updateCampaignSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID'),
  }),
  body: z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    category: z.string().max(100).optional(),
    goalSats: z.number().int().positive().optional(),
    goalUsd: z.number().positive().optional(),
    images: z.array(z.string().url()).optional(),
    videoUrl: z.string().url().optional(),
    deadline: z.string().datetime().optional(),
    status: z.enum(['active', 'completed', 'closed', 'cancelled']).optional(),
    isFeatured: z.boolean().optional(),
  }),
});

const deleteCampaignSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID'),
  }),
});

const createDonationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID'),
  }),
  body: z.object({
    amountSats: z.number().int().positive(),
    amountUsd: z.number().positive().optional(),
    isAnonymous: z.boolean().default(false),
    message: z.string().max(500).optional(),
  }),
});

const getCampaignDonationsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid campaign ID'),
  }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const getMyDonationsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const getMyCampaignsSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

// ============================================================================
// CAMPAIGN ROUTES
// ============================================================================

router.get('/campaigns', optionalAuth, validate(getCampaignsSchema), crowdfundingController.getCampaigns);
router.get('/campaigns/:id', optionalAuth, validate(getCampaignSchema), crowdfundingController.getCampaign);
router.post('/campaigns', authenticate, validate(createCampaignSchema), crowdfundingController.createCampaign);
router.put('/campaigns/:id', authenticate, validate(updateCampaignSchema), crowdfundingController.updateCampaign);
router.delete('/campaigns/:id', authenticate, validate(deleteCampaignSchema), crowdfundingController.deleteCampaign);
router.get('/campaigns/my/list', authenticate, validate(getMyCampaignsSchema), crowdfundingController.getMyCampaigns);

// ============================================================================
// DONATION ROUTES
// ============================================================================

router.post('/campaigns/:id/donations', authenticate, validate(createDonationSchema), crowdfundingController.createDonation);
router.get('/campaigns/:id/donations', optionalAuth, validate(getCampaignDonationsSchema), crowdfundingController.getCampaignDonations);
router.get('/donations/my/list', authenticate, validate(getMyDonationsSchema), crowdfundingController.getMyDonations);

export default router;

