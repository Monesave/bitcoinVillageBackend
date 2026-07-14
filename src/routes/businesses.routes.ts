import express from 'express';
import {
  getBusinesses,
  getBusiness,
  createBusiness,
  updateBusiness,
  deleteBusiness
} from '../controllers/businesses.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.get('/', getBusinesses);
router.get('/:id', getBusiness);
router.post('/', authenticate, createBusiness);
router.put('/:id', authenticate, updateBusiness);
router.delete('/:id', authenticate, deleteBusiness);

export default router;
