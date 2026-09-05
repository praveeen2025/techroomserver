import { Router } from 'express';
import {
  getProblemsByRoom,
  createProblem,
  updateProblem,
  deleteProblem,
  getMyAssignedProblemStatement,
} from '../controllers/problemController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = Router();

router.get('/user/problem-statement', authenticateToken, requireRole(['USER']), getMyAssignedProblemStatement);
router.get('/rooms/:roomId/problems', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), getProblemsByRoom);
router.post('/rooms/:roomId/problems', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), upload.single('attachment'), createProblem);
router.put('/problems/:id', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), upload.single('attachment'), updateProblem);
router.delete('/problems/:id', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), deleteProblem);

export default router;
