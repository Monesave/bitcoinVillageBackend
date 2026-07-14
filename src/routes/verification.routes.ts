import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
import { authenticate } from '../middleware/auth.middleware';
import * as verificationController from '../controllers/verification.controller';

const router = Router();

// Validation schemas
const checkPaymentStatusSchema = z.object({
  params: z.object({
    paymentHash: z.string().min(1),
  }),
});

// Routes
router.post('/request', authenticate, verificationController.requestVerification);
router.get('/status', authenticate, verificationController.getVerificationStatus);
router.get('/payment/:paymentHash/status', authenticate, validate(checkPaymentStatusSchema), verificationController.checkPaymentStatus);

// Webhook endpoint (no authentication required - uses signature verification)
router.post('/webhook', verificationController.veriffWebhook);

export default router;

