import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as eventsController from '../controllers/events.controller';

const router = Router();

router.get('/', eventsController.getEvents);
router.get('/:id', eventsController.getEvent);
router.post('/', authenticate, eventsController.createEvent);
router.put('/:id', authenticate, eventsController.updateEvent);
router.delete('/:id', authenticate, eventsController.deleteEvent);

export default router;
