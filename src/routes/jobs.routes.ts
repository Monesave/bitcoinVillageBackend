import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as jobsController from '../controllers/jobs.controller';

const router = Router();

router.get('/', jobsController.getJobs);
router.get('/:id', jobsController.getJob);
router.post('/', authenticate, jobsController.createJob);
router.put('/:id', authenticate, jobsController.updateJob);
router.delete('/:id', authenticate, jobsController.deleteJob);

export default router;
