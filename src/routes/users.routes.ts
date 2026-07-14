import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import * as usersController from '../controllers/users.controller';

const router = Router();

// Validation schemas
const getProfileSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID'),
  }),
});

const updateProfileSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(20).optional(),
    displayName: z.string().max(100).optional(),
    bio: z.string().max(500).optional(),
    location: z.string().max(100).optional(),
    avatarUrl: z.string().url().optional(),
  }),
});

const connectWalletSchema = z.object({
  body: z.object({
    walletType: z.enum(['strike', 'orukka', 'orukka_business', 'orukka_p2p', 'monesave']),
    walletAddress: z.string().optional(),
  }),
});

// Routes
router.get('/:id', optionalAuth, validate(getProfileSchema), usersController.getUserProfile);
router.put('/:id/profile', authenticate, validate(updateProfileSchema), usersController.updateUserProfile);
router.get('/:id/wallet', authenticate, validate(getProfileSchema), usersController.getUserWallet);
router.post('/:id/wallet/connect', authenticate, validate(connectWalletSchema), usersController.connectWallet);
router.delete('/:id/wallet/:connectionId', authenticate, usersController.disconnectWallet);
router.get('/:id/reputation', optionalAuth, validate(getProfileSchema), usersController.getUserReputation);
router.get('/:id/reviews', optionalAuth, validate(getProfileSchema), usersController.getUserReviews);
router.get('/:id/transactions', authenticate, validate(getProfileSchema), usersController.getUserTransactions);

export default router;

