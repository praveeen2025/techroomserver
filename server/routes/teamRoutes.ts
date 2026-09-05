import { Router } from 'express';
import {
  getTeamsByRoom,
  createTeam,
  importTeamsCSV,
  resetTeamPassword,
  deleteTeam,
  getMyTeamProfile,
  updateMyTeamProfile,
} from '../controllers/teamController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = Router();

router.get('/teams/my-profile', authenticateToken, requireRole(['USER']), getMyTeamProfile);
router.put('/teams/my-profile', authenticateToken, requireRole(['USER']), upload.single('logo'), updateMyTeamProfile);

router.get('/rooms/:roomId/teams', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), getTeamsByRoom);
router.post('/rooms/:roomId/teams', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), createTeam);
router.post('/rooms/:roomId/teams/import', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), importTeamsCSV);
router.post('/teams/:id/reset-password', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), resetTeamPassword);
router.delete('/teams/:id', authenticateToken, requireRole(['ROOT_ADMIN', 'ADMIN']), deleteTeam);

export default router;
