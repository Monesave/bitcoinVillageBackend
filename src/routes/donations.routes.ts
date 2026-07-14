import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as donationsController from '../controllers/donations.controller';

const router = Router();

router.get('/', donationsController.getDonations);
router.get('/:id', donationsController.getDonation);
router.post('/', authenticate, donationsController.createDonation);
router.put('/:id', authenticate, donationsController.updateDonation);
router.delete('/:id', authenticate, donationsController.deleteDonation);

export default router;
