import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as marketplaceController from '../controllers/marketplace.controller';

const router = Router();

router.get('/', marketplaceController.getListings);
router.get('/:id', marketplaceController.getListing);
router.post('/', authenticate, marketplaceController.createListing);
router.put('/:id', authenticate, marketplaceController.updateListing);
router.delete('/:id', authenticate, marketplaceController.deleteListing);

export default router;
