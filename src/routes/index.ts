import { Router } from 'express';

// Import route modules
import authRoutes from './auth.routes';
import userRoutes from './users.routes';
import paymentsRoutes from './payments.routes';
import marketplaceRoutes from './marketplace.routes';
import servicesRoutes from './services.routes';
import jobsRoutes from './jobs.routes';
import donationsRoutes from './donations.routes';
import businessesRoutes from './businesses.routes';
import eventsRoutes from './events.routes';
import adminRoutes from './admin.routes';
import councilRoutes from './council.routes';
import verificationRoutes from './verification.routes';
import ordersRoutes from './orders.routes';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/payments', paymentsRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/services', servicesRoutes);
router.use('/jobs', jobsRoutes);
router.use('/donations', donationsRoutes);
router.use('/businesses', businessesRoutes);
router.use('/events', eventsRoutes);
router.use('/admin', adminRoutes);
router.use('/council', councilRoutes);
router.use('/verification', verificationRoutes);
router.use('/orders', ordersRoutes);

export default router;
