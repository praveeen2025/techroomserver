import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma';
import { AuthRequest } from '../middleware/auth.js';
import { createAdminSchema, updateAdminSchema, resetPasswordSchema } from '../../validations/schemas.js';

// Helper to generate unique Joining Code for a room
const generateJoiningCode = async (): Promise<string> => {
  const rand1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const rand2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  let code = `JOIN-${rand1}-${rand2}`;
  let attempts = 0;
  while (await (prisma as any).room.findFirst({ where: { joiningCode: code } })) {
    const next1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const next2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    code = `JOIN-${next1}-${next2}`;
    attempts++;
    if (attempts > 10) break;
  }
  return code;
};

// -------------------------------------------------------------
// 1. GLOBAL METRICS
// -------------------------------------------------------------
export const getGlobalMetrics = async (_req: AuthRequest, res: Response) => {
  try {
    const [
      totalAdmins,
      activeAdmins,
      totalUsers,
      totalRooms,
      activeRooms,
      totalTeams,
      totalSubmissions,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.room.count(),
      prisma.room.count({ where: { status: 'ACTIVE' } }),
      prisma.team.count(),
      prisma.submission.count({ where: { status: 'SUBMITTED' } }),
    ]);

    return res.json({
      success: true,
      data: {
        totalAdmins,
        activeAdmins,
        totalUsers,
        totalRooms,
        activeRooms,
        totalTeams,
        totalSubmissions,
      },
    });
  } catch (error: any) {
    console.error('getGlobalMetrics error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch global metrics.' });
  }
};

// -------------------------------------------------------------
// 2. ADMIN MANAGEMENT
// -------------------------------------------------------------
export const getAdmins = async (_req: AuthRequest, res: Response) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { rooms: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: admins });
  } catch (error: any) {
    console.error('getAdmins error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch admins.' });
  }
};

export const createAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const parseResult = createAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.errors[0].message });
    }

    const { name, email, password } = parseResult.data;
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(400).json({ success: false, error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newAdmin = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ success: true, message: 'Admin account created successfully', data: newAdmin });
  } catch (error: any) {
    console.error('createAdmin error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create admin.' });
  }
};

export const updateAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parseResult = updateAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.errors[0].message });
    }

    const admin = await prisma.user.findUnique({ where: { id } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(404).json({ success: false, error: 'Admin not found.' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: parseResult.data,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        updatedAt: true,
      },
    });

    return res.json({ success: true, message: 'Admin updated successfully', data: updated });
  } catch (error: any) {
    console.error('updateAdmin error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update admin.' });
  }
};

export const resetAdminPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parseResult = resetPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.errors[0].message });
    }

    const passwordHash = await bcrypt.hash(parseResult.data.newPassword, 10);
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return res.json({ success: true, message: 'Admin password reset successfully.' });
  } catch (error: any) {
    console.error('resetAdminPassword error:', error);
    return res.status(500).json({ success: false, error: 'Failed to reset password.' });
  }
};

export const toggleAdminStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const admin = await prisma.user.findUnique({ where: { id } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(404).json({ success: false, error: 'Admin not found.' });
    }

    const newStatus = admin.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated = await prisma.user.update({
      where: { id },
      data: { status: newStatus },
      select: { id: true, name: true, status: true },
    });

    return res.json({ success: true, message: `Admin status changed to ${newStatus}`, data: updated });
  } catch (error: any) {
    console.error('toggleAdminStatus error:', error);
    return res.status(500).json({ success: false, error: 'Failed to toggle status.' });
  }
};

export const deleteAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const admin = await prisma.user.findUnique({ where: { id } });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(404).json({ success: false, error: 'Admin account not found or cannot be deleted.' });
    }

    await prisma.user.delete({ where: { id } });
    return res.json({ success: true, message: `Admin ${admin.name} deleted successfully.` });
  } catch (error: any) {
    console.error('deleteAdmin error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete admin.' });
  }
};

// -------------------------------------------------------------
// 3. USER / MEMBER MANAGEMENT
// -------------------------------------------------------------
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { search, status } = req.query;
    const whereClause: any = { role: 'USER' };

    if (status && typeof status === 'string') {
      whereClause.status = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      whereClause.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
        { department: { contains: q } },
        { degree: { contains: q } },
        { academicYear: { contains: q } },
      ];
    }

    const users = await (prisma as any).user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        academicYear: true,
        department: true,
        degree: true,
        dob: true,
        status: true,
        createdAt: true,
        participantRooms: {
          include: {
            room: { select: { id: true, name: true, roomCode: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: users });
  } catch (error: any) {
    console.error('getUsers error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch users.' });
  }
};

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, phone, academicYear, department, degree, dob, status } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
    }

    const existingUser = await (prisma as any).user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return res.status(400).json({ success: false, error: 'User with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await (prisma as any).user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        role: 'USER',
        status: status || 'ACTIVE',
        phone: phone || null,
        academicYear: academicYear || null,
        department: department || null,
        degree: degree || null,
        dob: dob || null,
      },
    });

    return res.status(201).json({ success: true, message: 'User account created successfully.', data: newUser });
  } catch (error: any) {
    console.error('createUser error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create user.' });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, password, phone, academicYear, department, degree, dob, status } = req.body;

    const user = await (prisma as any).user.findUnique({ where: { id } });
    if (!user || user.role !== 'USER') {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const dataToUpdate: any = {
      name: name ? name.trim() : user.name,
      email: email ? email.toLowerCase().trim() : user.email,
      phone: phone !== undefined ? phone : (user as any).phone,
      academicYear: academicYear !== undefined ? academicYear : (user as any).academicYear,
      department: department !== undefined ? department : (user as any).department,
      degree: degree !== undefined ? degree : (user as any).degree,
      dob: dob !== undefined ? dob : (user as any).dob,
      status: status || user.status,
    };

    if (password && password.trim()) {
      dataToUpdate.passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const updated = await (prisma as any).user.update({
      where: { id },
      data: dataToUpdate,
    });

    return res.json({ success: true, message: 'User details updated successfully.', data: updated });
  } catch (error: any) {
    console.error('updateUser error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update user.' });
  }
};

export const toggleUserStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'USER') {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated = await prisma.user.update({
      where: { id },
      data: { status: newStatus },
    });

    return res.json({ success: true, message: `User status set to ${newStatus}`, data: updated });
  } catch (error: any) {
    console.error('toggleUserStatus error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update status.' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || user.role !== 'USER') {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    await prisma.user.delete({ where: { id } });
    return res.json({ success: true, message: `User ${user.name} deleted successfully.` });
  } catch (error: any) {
    console.error('deleteUser error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete user.' });
  }
};

// -------------------------------------------------------------
// 4. GLOBAL TEAM MANAGEMENT
// -------------------------------------------------------------
export const getGlobalTeams = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId, search } = req.query;
    const whereClause: any = {};

    if (roomId && typeof roomId === 'string') {
      whereClause.roomId = roomId;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      whereClause.OR = [
        { teamName: { contains: q } },
        { teamCode: { contains: q } },
        { leaderName: { contains: q } },
        { leaderEmail: { contains: q } },
        { college: { contains: q } },
      ];
    }

    const teams = await prisma.team.findMany({
      where: whereClause,
      include: {
        room: { select: { id: true, name: true, roomCode: true } },
        members: true,
        assignments: { include: { problem: { select: { id: true, title: true } } } },
        submissions: { select: { id: true, status: true, projectName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: teams });
  } catch (error: any) {
    console.error('getGlobalTeams error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch global teams.' });
  }
};

export const createGlobalTeam = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId, teamName, leaderName, leaderEmail, college, members } = req.body;

    if (!roomId || !teamName || !leaderName || !leaderEmail || !college) {
      return res.status(400).json({ success: false, error: 'Room ID, Team Name, Leader Name, Leader Email, and College are required.' });
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Hackathon Room not found.' });
    }

    let count = await prisma.team.count();
    let teamCodeNum = (count + 1 + Math.floor(Math.random() * 1000)).toString().padStart(4, '0');
    let teamCode = `TR-TEAM-${teamCodeNum}`;
    let attempts = 0;
    while (await prisma.team.findUnique({ where: { teamCode } })) {
      teamCodeNum = (count + 1 + Math.floor(Math.random() * 10000)).toString().padStart(4, '0');
      teamCode = `TR-TEAM-${teamCodeNum}`;
      attempts++;
      if (attempts > 10) break;
    }

    const passwordHash = await bcrypt.hash('team123', 10);
    const membersData = Array.isArray(members) && members.length > 0
      ? members.map((m: any) => ({ name: m.name, email: m.email || leaderEmail, isLeader: Boolean(m.isLeader) }))
      : [{ name: leaderName, email: leaderEmail, isLeader: true }];

    const newTeam = await prisma.team.create({
      data: {
        roomId,
        teamCode,
        teamName,
        leaderName,
        leaderEmail: leaderEmail.toLowerCase().trim(),
        college,
        passwordHash,
        status: 'ACTIVE',
        members: {
          create: membersData,
        },
      },
      include: { members: true, room: true },
    });

    return res.status(201).json({ success: true, message: 'Team created successfully.', data: newTeam });
  } catch (error: any) {
    console.error('createGlobalTeam error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create team.' });
  }
};

export const updateGlobalTeam = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { teamName, leaderName, leaderEmail, college, status, members } = req.body;

    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    await prisma.team.update({
      where: { id },
      data: {
        teamName: teamName || team.teamName,
        leaderName: leaderName || team.leaderName,
        leaderEmail: leaderEmail ? leaderEmail.toLowerCase().trim() : team.leaderEmail,
        college: college || team.college,
        status: status || team.status,
      },
    });

    if (Array.isArray(members)) {
      await prisma.teamMember.deleteMany({ where: { teamId: id } });
      await prisma.teamMember.createMany({
        data: members.map((m: any) => ({
          teamId: id,
          name: m.name,
          email: m.email || leaderEmail,
          isLeader: Boolean(m.isLeader),
        })),
      });
    }

    const updated = await prisma.team.findUnique({
      where: { id },
      include: { members: true, room: true },
    });

    return res.json({ success: true, message: 'Team updated successfully.', data: updated });
  } catch (error: any) {
    console.error('updateGlobalTeam error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update team.' });
  }
};

export const toggleTeamStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const newStatus = team.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated = await prisma.team.update({
      where: { id },
      data: { status: newStatus },
    });

    return res.json({ success: true, message: `Team status set to ${newStatus}`, data: updated });
  } catch (error: any) {
    console.error('toggleTeamStatus error:', error);
    return res.status(500).json({ success: false, error: 'Failed to toggle status.' });
  }
};

export const deleteGlobalTeam = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    await prisma.team.delete({ where: { id } });
    return res.json({ success: true, message: `Team ${team.teamName} deleted successfully.` });
  } catch (error: any) {
    console.error('deleteGlobalTeam error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete team.' });
  }
};

// -------------------------------------------------------------
// 5. ROOM / EVENT MANAGEMENT (DELETE & REGENERATE)
// -------------------------------------------------------------
export const deleteRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found.' });
    }

    await prisma.room.delete({ where: { id } });
    return res.json({ success: true, message: `Hackathon Room ${room.name} deleted successfully.` });
  } catch (error: any) {
    console.error('deleteRoom error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete room.' });
  }
};

export const regenerateJoiningCode = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found.' });
    }

    const newCode = await generateJoiningCode();
    const updated = await (prisma as any).room.update({
      where: { id },
      data: { joiningCode: newCode },
    });

    return res.json({
      success: true,
      message: `Joining Code regenerated for ${room.name}: ${newCode}`,
      data: updated,
    });
  } catch (error: any) {
    console.error('regenerateJoiningCode error:', error);
    return res.status(500).json({ success: false, error: 'Failed to regenerate Joining Code.' });
  }
};

// -------------------------------------------------------------
// 6. PROBLEM STATEMENT & ASSIGNMENT MANAGEMENT
// -------------------------------------------------------------
export const getGlobalProblems = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.query;
    const whereClause: any = {};
    if (roomId && typeof roomId === 'string') {
      whereClause.roomId = roomId;
    }

    const problems = await prisma.problem.findMany({
      where: whereClause,
      include: {
        room: { select: { id: true, name: true, roomCode: true } },
        assignments: {
          include: {
            team: { select: { id: true, teamCode: true, teamName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: problems });
  } catch (error: any) {
    console.error('getGlobalProblems error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch global problems.' });
  }
};

export const createGlobalProblem = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId, title, description, requirements, instructions } = req.body;
    if (!roomId || !title || !description) {
      return res.status(400).json({ success: false, error: 'Room ID, Title, and Description are required.' });
    }

    const newProblem = await prisma.problem.create({
      data: {
        roomId,
        title: title.trim(),
        description: description.trim(),
        requirements: requirements || 'Standard project requirements apply.',
        instructions: instructions || 'Follow guidelines provided.',
      },
    });

    return res.status(201).json({ success: true, message: 'Problem Statement created successfully.', data: newProblem });
  } catch (error: any) {
    console.error('createGlobalProblem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create problem.' });
  }
};

export const updateGlobalProblem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, requirements, instructions } = req.body;

    const problem = await prisma.problem.findUnique({ where: { id } });
    if (!problem) {
      return res.status(404).json({ success: false, error: 'Problem Statement not found.' });
    }

    const updated = await prisma.problem.update({
      where: { id },
      data: {
        title: title || problem.title,
        description: description || problem.description,
        requirements: requirements || problem.requirements,
        instructions: instructions || problem.instructions,
      },
    });

    return res.json({ success: true, message: 'Problem Statement updated successfully.', data: updated });
  } catch (error: any) {
    console.error('updateGlobalProblem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update problem.' });
  }
};

export const deleteGlobalProblem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const problem = await prisma.problem.findUnique({ where: { id } });
    if (!problem) {
      return res.status(404).json({ success: false, error: 'Problem Statement not found.' });
    }

    await prisma.problem.delete({ where: { id } });
    return res.json({ success: true, message: `Problem Statement "${problem.title}" deleted successfully.` });
  } catch (error: any) {
    console.error('deleteGlobalProblem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete problem.' });
  }
};

export const getGlobalAssignments = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.query;
    const whereClause: any = {};
    if (roomId && typeof roomId === 'string') {
      whereClause.roomId = roomId;
    }

    const assignments = await prisma.problemAssignment.findMany({
      where: whereClause,
      include: {
        room: { select: { id: true, name: true, roomCode: true } },
        team: { select: { id: true, teamCode: true, teamName: true, college: true } },
        problem: { select: { id: true, title: true, description: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return res.json({ success: true, data: assignments });
  } catch (error: any) {
    console.error('getGlobalAssignments error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch assignments.' });
  }
};

export const createGlobalAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId, teamId, problemId } = req.body;
    if (!roomId || !teamId || !problemId) {
      return res.status(400).json({ success: false, error: 'Room ID, Team ID, and Problem ID are required.' });
    }

    // Delete existing assignment for team in room
    await prisma.problemAssignment.deleteMany({
      where: { roomId, teamId },
    });

    const newAssignment = await prisma.problemAssignment.create({
      data: { roomId, teamId, problemId },
      include: {
        team: { select: { teamName: true } },
        problem: { select: { title: true } },
      },
    });

    return res.status(201).json({
      success: true,
      message: `Assigned "${newAssignment.problem.title}" to ${newAssignment.team.teamName}.`,
      data: newAssignment,
    });
  } catch (error: any) {
    console.error('createGlobalAssignment error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create assignment.' });
  }
};

export const deleteGlobalAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const assignment = await prisma.problemAssignment.findUnique({ where: { id } });
    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Assignment not found.' });
    }

    await prisma.problemAssignment.delete({ where: { id } });
    return res.json({ success: true, message: 'Problem assignment removed successfully.' });
  } catch (error: any) {
    console.error('deleteGlobalAssignment error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete assignment.' });
  }
};

// -------------------------------------------------------------
// 7. SUBMISSION MANAGEMENT ENHANCEMENTS
// -------------------------------------------------------------
export const getAllGlobalSubmissions = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId, status } = req.query;
    const whereClause: any = {};
    if (roomId && typeof roomId === 'string') {
      whereClause.roomId = roomId;
    }
    if (status && typeof status === 'string') {
      whereClause.status = status;
    }

    const submissions = await prisma.submission.findMany({
      where: whereClause,
      include: {
        room: { select: { id: true, name: true, roomCode: true } },
        team: { select: { id: true, teamCode: true, teamName: true, leaderName: true, leaderEmail: true, college: true } },
        problem: { select: { id: true, title: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return res.json({ success: true, data: submissions });
  } catch (error: any) {
    console.error('getAllGlobalSubmissions error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch global submissions.' });
  }
};

export const updateSubmissionStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['NOT_SUBMITTED', 'DRAFT', 'SUBMITTED', 'LOCKED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid submission status.' });
    }

    const updated = await prisma.submission.update({
      where: { id },
      data: { status },
    });

    return res.json({ success: true, message: `Submission status updated to ${status}.`, data: updated });
  } catch (error: any) {
    console.error('updateSubmissionStatus error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update submission status.' });
  }
};

export const deleteSubmission = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const submission = await prisma.submission.findUnique({ where: { id } });
    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found.' });
    }

    await prisma.submission.delete({ where: { id } });
    return res.json({ success: true, message: 'Submission record deleted successfully.' });
  } catch (error: any) {
    console.error('deleteSubmission error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete submission.' });
  }
};
