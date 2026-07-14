import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as servicesController from '../controllers/services.controller';

const router = Router();

router.get('/', servicesController.getListings);
router.get('/:id', servicesController.getListing);
router.post('/', authenticate, servicesController.createListing);
router.put('/:id', authenticate, servicesController.updateListing);
router.delete('/:id', authenticate, servicesController.deleteListing);

export default router;
