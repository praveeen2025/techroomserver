import { Router } from 'express';
import {
  getRooms,
  getRoomById,
  createRoom,
  updateRoom,
  updateRoomStatus,
  bulkDistributeProblems,
  reassignTeamProblem,
  getUserHackathons,
  joinHackathonRoom,
  joinByJoiningCode,
} from '../controllers/roomController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { joiningCodeRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticateToken);

// User Hackathon List & Join Routes
router.get('/user/hackathons', requireRole(['USER']), getUserHackathons);
router.post('/user/hackathons/join-code', requireRole(['USER']), joiningCodeRateLimiter, joinByJoiningCode);
router.post('/user/hackathons/:id/join', requireRole(['USER']), joiningCodeRateLimiter, joinHackathonRoom);

// Admin / Root Admin Room Management Routes
router.get('/', requireRole(['ROOT_ADMIN', 'ADMIN']), getRooms);
router.post('/', requireRole(['ROOT_ADMIN', 'ADMIN']), createRoom);
router.get('/:id', requireRole(['ROOT_ADMIN', 'ADMIN']), getRoomById);
router.put('/:id', requireRole(['ROOT_ADMIN', 'ADMIN']), updateRoom);
router.patch('/:id/status', requireRole(['ROOT_ADMIN', 'ADMIN']), updateRoomStatus);
router.post('/:id/bulk-distribute', requireRole(['ROOT_ADMIN', 'ADMIN']), bulkDistributeProblems);
router.post('/:id/reassign', requireRole(['ROOT_ADMIN', 'ADMIN']), reassignTeamProblem);

export default router;
