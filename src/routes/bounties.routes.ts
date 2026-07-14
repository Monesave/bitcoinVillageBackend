import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import * as bountiesController from '../controllers/bounties.controller';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const getBountiesSchema = z.object({
  query: z.object({
    category: z.string().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
    minReward: z.string().optional(),
    maxReward: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const getBountySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid bounty ID'),
  }),
});

const createBountySchema = z.object({
  body: z.object({
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    category: z.string().max(100).optional(),
    rewardSats: z.number().int().positive(),
    maxSolvers: z.number().int().positive().default(1),
    deadline: z.string().datetime().optional(),
  }),
});

const updateBountySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid bounty ID'),
  }),
  body: z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    category: z.string().max(100).optional(),
    deadline: z.string().datetime().optional(),
    status: z.enum(['open', 'closed', 'awarded']).optional(),
  }),
});

const closeBountySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid bounty ID'),
  }),
});

const createSubmissionSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid bounty ID'),
  }),
  body: z.object({
    submissionText: z.string().min(1),
    submissionFiles: z.array(z.string().url()).optional(),
  }),
});

const getSubmissionSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid submission ID'),
  }),
});

const getBountySubmissionsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid bounty ID'),
  }),
});

const awardBountySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid bounty ID'),
  }),
  body: z.object({
    submissionId: z.string().uuid('Invalid submission ID'),
  }),
});

const getMySubmissionsSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

// ============================================================================
// BOUNTY ROUTES
// ============================================================================

router.get('/', optionalAuth, validate(getBountiesSchema), bountiesController.getBounties);
router.get('/:id', optionalAuth, validate(getBountySchema), bountiesController.getBounty);
router.post('/', authenticate, validate(createBountySchema), bountiesController.createBounty);
router.put('/:id', authenticate, validate(updateBountySchema), bountiesController.updateBounty);
router.post('/:id/close', authenticate, validate(closeBountySchema), bountiesController.closeBounty);

// ============================================================================
// SUBMISSION ROUTES
// ============================================================================

router.post('/:id/submissions', authenticate, validate(createSubmissionSchema), bountiesController.createSubmission);
router.get('/:id/submissions', authenticate, validate(getBountySubmissionsSchema), bountiesController.getBountySubmissions);
router.get('/submissions/:id', authenticate, validate(getSubmissionSchema), bountiesController.getSubmission);
router.get('/submissions/my/list', authenticate, validate(getMySubmissionsSchema), bountiesController.getMySubmissions);

// ============================================================================
// AWARD ROUTES
// ============================================================================

router.post('/:id/award', authenticate, validate(awardBountySchema), bountiesController.awardBounty);

export default router;

