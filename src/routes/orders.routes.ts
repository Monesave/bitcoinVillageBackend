import { Router } from 'express';
import { getOrders, updateOrderStatus } from '../controllers/orders.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getOrders);
router.post('/:id/status', authenticate, updateOrderStatus);

export default router;
