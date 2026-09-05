import { Router } from 'express';
import {
  getSubmissionsByRoom,
  getMyTeamSubmission,
  saveTeamSubmission,
  finalSubmitTeamProject,
} from '../controllers/submissionController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = Router();

router.use(authenticateToken);

router.get('/my-submission', requireRole(['USER']), getMyTeamSubmission);
router.post('/my-submission', requireRole(['USER']), upload.single('projectFile'), saveTeamSubmission);
router.post('/my-submission/final', requireRole(['USER']), finalSubmitTeamProject);

router.get('/rooms/:roomId/submissions', requireRole(['ROOT_ADMIN', 'ADMIN']), getSubmissionsByRoom);

export default router;
