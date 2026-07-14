import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminLimiter } from '../middleware/rateLimit.middleware';
import * as adminController from '../controllers/admin.controller';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);
router.use(adminLimiter);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const moderateContentSchema = z.object({
  body: z.object({
    contentType: z.enum(['marketplace_listing', 'service_listing', 'bounty', 'campaign', 'review']),
    contentId: z.string().uuid('Invalid content ID'),
    action: z.enum(['approve', 'reject', 'hide', 'delete', 'feature', 'unfeature']),
    reason: z.string().max(1000).optional(),
  }),
});

const getModerationLogsSchema = z.object({
  query: z.object({
    contentType: z.string().optional(),
    action: z.string().optional(),
    moderatorId: z.string().uuid().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const getUsersSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    isVerified: z.enum(['true', 'false']).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const getUserDetailsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID'),
  }),
});

const banUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID'),
  }),
  body: z.object({
    reason: z.string().max(1000).optional(),
  }),
});

const getAdminActionsSchema = z.object({
  query: z.object({
    actionType: z.string().optional(),
    targetType: z.string().optional(),
    adminId: z.string().uuid().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const getCouncilApplicationsSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const reviewCouncilApplicationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid application ID'),
  }),
  body: z.object({
    action: z.enum(['approve', 'reject']),
    termStartDate: z.string().datetime().optional(),
    termEndDate: z.string().datetime().optional(),
    notes: z.string().max(1000).optional(),
  }),
});

const deactivateCouncilMemberSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid council member ID'),
  }),
  body: z.object({
    reason: z.string().max(1000).optional(),
  }),
});

const nominateCouncilMemberSchema = z.object({
  body: z.object({
    userId: z.string().uuid('Invalid user ID'),
    notes: z.string().max(1000).optional(),
  }),
});

// ============================================================================
// MODERATION ROUTES
// ============================================================================

router.post('/moderate', validate(moderateContentSchema), adminController.moderateContent);
router.get('/moderation-logs', validate(getModerationLogsSchema), adminController.getModerationLogs);

// ============================================================================
// USER MANAGEMENT ROUTES
// ============================================================================

router.get('/users', validate(getUsersSchema), adminController.getUsers);
router.get('/users/:id', validate(getUserDetailsSchema), adminController.getUserDetails);
router.post('/users/:id/ban', validate(banUserSchema), adminController.banUser);

// ============================================================================
// STATISTICS & ANALYTICS ROUTES
// ============================================================================

router.get('/stats', adminController.getPlatformStats);
router.get('/actions', validate(getAdminActionsSchema), adminController.getAdminActions);

// ============================================================================
// VILLAGE COUNCIL MANAGEMENT ROUTES
// ============================================================================

router.post('/council/nominate', validate(nominateCouncilMemberSchema), adminController.nominateCouncilMember);
router.get('/council/applications', validate(getCouncilApplicationsSchema), adminController.getCouncilApplications);
router.post('/council/applications/:id/review', validate(reviewCouncilApplicationSchema), adminController.reviewCouncilApplication);
router.post('/council/members/:id/deactivate', validate(deactivateCouncilMemberSchema), adminController.deactivateCouncilMember);

export default router;

