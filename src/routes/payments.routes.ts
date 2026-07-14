import { Router } from 'express';
import {
  createPayment,
  getPaymentStatus,
  handleWebhook,
} from '../controllers/payments.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Strike Webhook (must not require authentication)
router.post('/webhook', handleWebhook);

// Protected routes
router.post('/create', authenticate, createPayment);
router.get('/:id/status', authenticate, getPaymentStatus);

export default router;
