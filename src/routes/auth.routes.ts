import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';
import * as authController from '../controllers/auth.controller';

const router = Router();

// Apply strict rate limiting to all auth routes
router.use(authLimiter);

// Validation schemas
const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    username: z.string().min(3).max(20).optional(),
    displayName: z.string().optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
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

// Routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getCurrentUser);
router.put('/profile', authenticate, validate(updateProfileSchema), authController.updateProfile);

// OAuth routes
router.post('/oauth/google', authController.googleAuth);

// Phone number authentication
router.post('/phone/send-otp', authController.sendPhoneOTP);
router.post('/phone/verify-otp', authController.verifyPhoneOTP);

export default router;

