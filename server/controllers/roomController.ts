import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma';
import { AuthRequest } from '../middleware/auth.js';
import { roomSchema } from '../../validations/schemas.js';

// Helper to generate unique room code
const generateRoomCode = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const count = await prisma.room.count();
  const seq = String(count + 1).padStart(3, '0');
  return `TR-ROOM-${year}-${seq}`;
};

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

// Get all rooms (Filtered by Admin ID if not Root Admin)
export const getRooms = async (req: AuthRequest, res: Response) => {
  try {
    const isRoot = req.user?.role === 'ROOT_ADMIN';
    const whereClause = isRoot ? {} : { adminId: req.user?.id };

    const rooms = await prisma.room.findMany({
      where: whereClause,
      include: {
        admin: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            teams: true,
            problems: true,
            assignments: true,
            submissions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: rooms });
  } catch (error: any) {
    console.error('getRooms error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch rooms.' });
  }
};

// Get single room details
export const getRoomById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        admin: { select: { id: true, name: true, email: true } },
        problems: true,
        teams: {
          include: {
            members: true,
            assignments: { include: { problem: true } },
            submissions: { include: { problem: true } },
          },
        },
        _count: {
          select: {
            teams: true,
            problems: true,
            assignments: true,
            submissions: true,
          },
        },
      },
    });

    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found.' });
    }

    // Access control check
    if (req.user?.role === 'ADMIN' && room.adminId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You do not have permission to access this room.' });
    }

    return res.json({ success: true, data: room });
  } catch (error: any) {
    console.error('getRoomById error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch room details.' });
  }
};

// Create new room
export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    const parseResult = roomSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.errors[0].message });
    }

    const roomCode = await generateRoomCode();
    const joiningCode = await generateJoiningCode();
    const { name, description, startDate, endDate, submissionDeadline, status } = parseResult.data;

    const adminId = req.user?.id!;

    const newRoom = await (prisma as any).room.create({
      data: {
        roomCode,
        joiningCode,
        name,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        submissionDeadline: new Date(submissionDeadline),
        status,
        adminId,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Hackathon ${name} created successfully (Joining Code: ${joiningCode})`,
      data: newRoom,
    });
  } catch (error: any) {
    console.error('createRoom error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create room.' });
  }
};

// Update existing room
export const updateRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const room = await prisma.room.findUnique({ where: { id } });

    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    if (req.user?.role === 'ADMIN' && room.adminId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized to update this room.' });
    }

    const parseResult = roomSchema.partial().safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.errors[0].message });
    }

    const dataToUpdate: any = { ...parseResult.data };
    if (dataToUpdate.startDate) dataToUpdate.startDate = new Date(dataToUpdate.startDate);
    if (dataToUpdate.endDate) dataToUpdate.endDate = new Date(dataToUpdate.endDate);
    if (dataToUpdate.submissionDeadline) dataToUpdate.submissionDeadline = new Date(dataToUpdate.submissionDeadline);

    const updatedRoom = await prisma.room.update({
      where: { id },
      data: dataToUpdate,
    });

    return res.json({ success: true, message: 'Room updated successfully', data: updatedRoom });
  } catch (error: any) {
    console.error('updateRoom error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update room.' });
  }
};

// Update status
export const updateRoomStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['DRAFT', 'ACTIVE', 'CLOSED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid room status' });
    }

    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    if (req.user?.role === 'ADMIN' && room.adminId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    const updated = await prisma.room.update({
      where: { id },
      data: { status },
    });

    return res.json({ success: true, message: `Room status updated to ${status}`, data: updated });
  } catch (error: any) {
    console.error('updateRoomStatus error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update status.' });
  }
};

// Bulk Problem Distribution across Teams in a specific Room
export const bulkDistributeProblems = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { mappings } = req.body; // Array<{ teamCode: string, problemTitle: string, problemDescription?: string }>

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({ success: false, error: 'Mappings list must be a non-empty array.' });
    }

    const room = await prisma.room.findUnique({
      where: { id },
      include: { teams: true },
    });

    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found.' });
    }

    if (req.user?.role === 'ADMIN' && room.adminId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized for this room.' });
    }

    const roomTeamsMap = new Map<string, string>();
    room.teams.forEach((t) => {
      roomTeamsMap.set(t.teamCode.toUpperCase(), t.id);
    });

    // Validate all mappings belong to this room
    const validationErrors: string[] = [];
    mappings.forEach((m: any, index: number) => {
      const code = (m.teamCode || '').toString().trim().toUpperCase();
      const title = (m.problemTitle || '').toString().trim();

      if (!code) {
        validationErrors.push(`Row ${index + 1}: Team ID is missing.`);
      } else if (!roomTeamsMap.has(code)) {
        validationErrors.push(`Row ${index + 1}: Team Code "${code}" does not exist in Room ${room.roomCode}.`);
      }

      if (!title) {
        validationErrors.push(`Row ${index + 1}: Problem Statement is empty.`);
      }
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationErrors[0]}`,
        details: validationErrors,
      });
    }

    // Execute bulk distribution in database transaction
    let assignmentsCreated = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of mappings) {
        const teamCode = item.teamCode.toString().trim().toUpperCase();
        const teamId = roomTeamsMap.get(teamCode)!;
        const title = item.problemTitle.toString().trim();
        const description = item.problemDescription ? item.problemDescription.toString().trim() : title;

        // Find or create Problem Statement in this Room
        let problem = await tx.problem.findFirst({
          where: { roomId: id, title },
        });

        if (!problem) {
          problem = await tx.problem.create({
            data: {
              roomId: id,
              title,
              description,
              requirements: 'Complete solution development according to problem statement specifications.',
              instructions: 'Submit final project code archive and presentation details before deadline.',
            },
          });
        }

        // Delete existing assignment for this team in this room
        await tx.problemAssignment.deleteMany({
          where: { roomId: id, teamId },
        });

        // Create new assignment
        await tx.problemAssignment.create({
          data: {
            roomId: id,
            teamId,
            problemId: problem.id,
          },
        });

        assignmentsCreated++;
      }
    });

    return res.json({
      success: true,
      message: `Successfully distributed ${assignmentsCreated} problem statements to teams in Room ${room.roomCode}.`,
      summary: {
        totalProcessed: mappings.length,
        assignmentsCreated,
        roomCode: room.roomCode,
        roomName: room.name,
      },
    });
  } catch (error: any) {
    console.error('bulkDistributeProblems error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process bulk problem distribution.' });
  }
};

// Reassign a specific problem to a team within a Room
export const reassignTeamProblem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { teamId, problemId } = req.body;

    if (!teamId || !problemId) {
      return res.status(400).json({ success: false, error: 'teamId and problemId are required.' });
    }

    // Verify team belongs to room
    const team = await prisma.team.findFirst({ where: { id: teamId, roomId: id } });
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found in this room.' });
    }

    // Verify problem belongs to room
    const problem = await prisma.problem.findFirst({ where: { id: problemId, roomId: id } });
    if (!problem) {
      return res.status(404).json({ success: false, error: 'Problem statement not found in this room.' });
    }

    // Replace existing assignment
    await prisma.problemAssignment.deleteMany({
      where: { roomId: id, teamId },
    });

    const newAssignment = await prisma.problemAssignment.create({
      data: {
        roomId: id,
        teamId,
        problemId,
      },
      include: {
        team: { select: { id: true, teamCode: true, teamName: true } },
        problem: { select: { id: true, title: true } },
      },
    });

    return res.json({
      success: true,
      message: `Reassigned "${newAssignment.problem.title}" to ${newAssignment.team.teamName}`,
      data: newAssignment,
    });
  } catch (error: any) {
    console.error('reassignTeamProblem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to reassign problem statement.' });
  }
};

// User Hackathons List
export const getUserHackathons = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId || req.user?.role !== 'USER') {
      return res.status(403).json({ success: false, error: 'User access required.' });
    }

    const rooms = await (prisma as any).room.findMany({
      where: {
        status: { in: ['ACTIVE', 'DRAFT', 'CLOSED'] },
      },
      include: {
        participants: {
          where: { userId },
        },
        teams: {
          where: {
            leaderEmail: req.user?.email ? req.user.email.toLowerCase() : undefined,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Ensure all rooms have a joiningCode
    for (const r of rooms) {
      if (!r.joiningCode) {
        const jCode = await generateJoiningCode();
        await (prisma as any).room.update({
          where: { id: r.id },
          data: { joiningCode: jCode },
        });
        r.joiningCode = jCode;
      }
    }

    const formattedRooms = rooms.map((r: any) => {
      const hasJoined = (r.participants && r.participants.length > 0) || (r.teams && r.teams.length > 0);
      return {
        id: r.id,
        roomCode: r.roomCode,
        joiningCode: r.joiningCode || r.joinCode,
        name: r.name,
        description: r.description,
        startDate: r.startDate,
        endDate: r.endDate,
        submissionDeadline: r.submissionDeadline,
        status: r.status,
        hasJoined,
      };
    });

    return res.json({ success: true, data: formattedRooms });
  } catch (error: any) {
    console.error('getUserHackathons error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch hackathons.' });
  }
};

// Join Hackathon Room via Joining Code
export const joinHackathonRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId || req.user?.role !== 'USER') {
      return res.status(403).json({ success: false, error: 'User access required.' });
    }

    const { id: roomId } = req.params;
    const { joiningCode, joinCode } = req.body;
    const inputCodeRaw = joiningCode || joinCode;

    if (!inputCodeRaw || !inputCodeRaw.trim()) {
      return res.status(400).json({ success: false, error: 'Joining Code is required.' });
    }

    const room = await (prisma as any).room.findUnique({
      where: { id: roomId },
      include: {
        participants: { where: { userId } },
        teams: true,
      },
    });

    if (!room) {
      return res.status(404).json({ success: false, error: 'Hackathon Room not found.' });
    }

    if (room.status === 'CLOSED') {
      return res.status(400).json({ success: false, error: 'This Hackathon Room is closed for joining.' });
    }

    const inputCode = inputCodeRaw.trim().toUpperCase();
    const expectedCode = (room.joiningCode || room.joinCode || '').toUpperCase();

    if (!expectedCode || inputCode !== expectedCode) {
      return res.status(400).json({ success: false, error: 'Invalid Joining Code. Please check the code and try again.' });
    }

    const userObj = await (prisma as any).user.findUnique({ where: { id: userId } });
    const userEmail = userObj?.email ? userObj.email.toLowerCase() : '';

    const existingParticipant = room.participants && room.participants.length > 0;
    const existingTeam = room.teams.find((t: any) => t.leaderEmail.toLowerCase() === userEmail);

    if (existingParticipant || existingTeam) {
      return res.status(400).json({ success: false, error: 'You have already joined this Hackathon.' });
    }

    await (prisma as any).roomParticipant.create({
      data: {
        roomId: room.id,
        userId: userId,
      },
    });

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

    const tempPass = Math.random().toString(36).substring(2, 10);
    const passwordHash = await bcrypt.hash(tempPass, 10);
    const teamName = `${userObj?.name || 'Participant'}'s Team`;

    await prisma.team.create({
      data: {
        roomId: room.id,
        teamCode,
        teamName,
        leaderName: userObj?.name || 'Participant',
        leaderEmail: userEmail,
        college: userObj?.department || 'University',
        passwordHash,
        status: 'ACTIVE',
        members: {
          create: [{ name: userObj?.name || 'Participant', email: userEmail, isLeader: true } as any],
        },
      },
    });

    return res.json({
      success: true,
      message: 'Successfully joined the Hackathon.',
    });
  } catch (error: any) {
    console.error('joinHackathonRoom error:', error);
    return res.status(500).json({ success: false, error: 'Failed to join Hackathon.' });
  }
};

// Join Hackathon Room by Joining Code directly (without knowing roomId upfront)
export const joinByJoiningCode = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId || req.user?.role !== 'USER') {
      return res.status(403).json({ success: false, error: 'User access required.' });
    }

    const { joiningCode, joinCode } = req.body;
    const inputCodeRaw = joiningCode || joinCode;

    if (!inputCodeRaw || !inputCodeRaw.trim()) {
      return res.status(400).json({ success: false, error: 'Joining Code is required.' });
    }

    const inputCode = inputCodeRaw.trim().toUpperCase();

    // Find room with this joining code (case-insensitive check)
    const room = await (prisma as any).room.findFirst({
      where: {
        joiningCode: {
          equals: inputCode,
          mode: 'insensitive',
        },
      },
      include: {
        participants: { where: { userId } },
        teams: true,
      },
    });

    if (!room) {
      return res.status(404).json({ success: false, error: 'Invalid Joining Code. Please check the code and try again.' });
    }

    if (room.status === 'CLOSED') {
      return res.status(400).json({ success: false, error: 'This Hackathon Room is closed for joining.' });
    }

    const userObj = await (prisma as any).user.findUnique({ where: { id: userId } });
    const userEmail = userObj?.email ? userObj.email.toLowerCase() : '';

    const existingParticipant = room.participants && room.participants.length > 0;
    const existingTeam = room.teams.find((t: any) => t.leaderEmail.toLowerCase() === userEmail);

    if (existingParticipant || existingTeam) {
      return res.status(400).json({ success: false, error: 'You have already joined this Hackathon.' });
    }

    await (prisma as any).roomParticipant.create({
      data: {
        roomId: room.id,
        userId: userId,
      },
    });

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

    const tempPass = Math.random().toString(36).substring(2, 10);
    const passwordHash = await bcrypt.hash(tempPass, 10);
    const teamName = `${userObj?.name || 'Participant'}'s Team`;

    await prisma.team.create({
      data: {
        roomId: room.id,
        teamCode,
        teamName,
        leaderName: userObj?.name || 'Participant',
        leaderEmail: userEmail,
        college: userObj?.department || 'University',
        passwordHash,
        status: 'ACTIVE',
        members: {
          create: [{ name: userObj?.name || 'Participant', email: userEmail, isLeader: true } as any],
        },
      },
    });

    return res.json({
      success: true,
      message: `Successfully joined ${room.name}.`,
      data: { roomId: room.id, roomName: room.name },
    });
  } catch (error: any) {
    console.error('joinByJoiningCode error:', error);
    return res.status(500).json({ success: false, error: 'Failed to join Hackathon.' });
  }
};

