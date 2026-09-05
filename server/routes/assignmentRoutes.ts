import { Router } from 'express';
import { createAssignment, deleteAssignment } from '../controllers/assignmentController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

router.post('/rooms/:roomId/assignments', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), createAssignment);
router.delete('/assignments/:id', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), deleteAssignment);

export default router;
