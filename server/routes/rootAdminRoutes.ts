import { Router } from 'express';
import {
  getGlobalMetrics,
  getAdmins,
  createAdmin,
  updateAdmin,
  resetAdminPassword,
  toggleAdminStatus,
  deleteAdmin,
  getUsers,
  createUser,
  updateUser,
  toggleUserStatus,
  deleteUser,
  getGlobalTeams,
  createGlobalTeam,
  updateGlobalTeam,
  toggleTeamStatus,
  deleteGlobalTeam,
  deleteRoom,
  regenerateJoiningCode,
  getGlobalProblems,
  createGlobalProblem,
  updateGlobalProblem,
  deleteGlobalProblem,
  getGlobalAssignments,
  createGlobalAssignment,
  deleteGlobalAssignment,
  getAllGlobalSubmissions,
  updateSubmissionStatus,
  deleteSubmission,
} from '../controllers/rootAdminController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Strict RBAC: All Root Admin routes require authenticated ROOT_ADMIN role
router.use(authenticateToken, requireRole(['ROOT_ADMIN']));

// Metrics
router.get('/metrics', getGlobalMetrics);

// Admin Management
router.get('/admins', getAdmins);
router.post('/admins', createAdmin);
router.put('/admins/:id', updateAdmin);
router.post('/admins/:id/reset-password', resetAdminPassword);
router.patch('/admins/:id/status', toggleAdminStatus);
router.delete('/admins/:id', deleteAdmin);

// User / Member Management
router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.patch('/users/:id/status', toggleUserStatus);
router.delete('/users/:id', deleteUser);

// Global Team Management
router.get('/teams', getGlobalTeams);
router.post('/teams', createGlobalTeam);
router.put('/teams/:id', updateGlobalTeam);
router.patch('/teams/:id/status', toggleTeamStatus);
router.delete('/teams/:id', deleteGlobalTeam);

// Room Management
router.delete('/rooms/:id', deleteRoom);
router.post('/rooms/:id/regenerate-code', regenerateJoiningCode);

// Problem Statement Management
router.get('/problems', getGlobalProblems);
router.post('/problems', createGlobalProblem);
router.put('/problems/:id', updateGlobalProblem);
router.delete('/problems/:id', deleteGlobalProblem);

// Problem Assignment Management
router.get('/assignments', getGlobalAssignments);
router.post('/assignments', createGlobalAssignment);
router.delete('/assignments/:id', deleteGlobalAssignment);

// Submission Management
router.get('/submissions', getAllGlobalSubmissions);
router.patch('/submissions/:id/status', updateSubmissionStatus);
router.delete('/submissions/:id', deleteSubmission);

export default router;
