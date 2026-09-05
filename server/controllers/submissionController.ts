import { Response } from 'express';
import { prisma } from '../db/prisma';
import { AuthRequest } from '../middleware/auth.js';
import { submissionSchema } from '../../validations/schemas.js';

// Get submissions for a room (Admin view)
export const getSubmissionsByRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const submissions = await prisma.submission.findMany({
      where: { roomId },
      include: {
        team: {
          select: {
            id: true,
            teamCode: true,
            teamName: true,
            leaderName: true,
            leaderEmail: true,
            college: true,
          },
        },
        problem: {
          select: { id: true, title: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return res.json({ success: true, data: submissions });
  } catch (error: any) {
    console.error('getSubmissionsByRoom error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch submissions.' });
  }
};

// Get current team's assigned problem & submission (User view)
export const getTeamForUser = async (req: AuthRequest) => {
  const userIdOrTeamId = req.user?.id;
  if (!userIdOrTeamId) return null;

  const activeRoomId = (req.headers['x-room-id'] as string) || (req.query?.roomId as string);

  // 1. Direct lookup by team ID
  let team = await prisma.team.findUnique({
    where: { id: userIdOrTeamId },
    include: {
      room: {
        include: {
          announcements: { orderBy: { createdAt: 'desc' } },
        },
      } as any,
      members: true,
      assignments: {
        include: { problem: true },
        orderBy: { assignedAt: 'desc' },
      },
    },
  });

  if (team) {
    if (activeRoomId && team.roomId !== activeRoomId) {
      const roomTeam = await prisma.team.findFirst({
        where: { leaderEmail: team.leaderEmail, roomId: activeRoomId },
        include: {
          room: {
            include: {
              announcements: { orderBy: { createdAt: 'desc' } },
            },
          } as any,
          members: true,
          assignments: {
            include: { problem: true },
            orderBy: { assignedAt: 'desc' },
          },
        },
      });
      if (roomTeam) return roomTeam;
    }
    return team;
  }

  // 2. User lookup by ID to resolve team by email
  const user = await prisma.user.findUnique({
    where: { id: userIdOrTeamId },
  });

  if (user) {
    const userEmail = user.email.toLowerCase();
    const whereClause: any = { leaderEmail: userEmail };
    if (activeRoomId) {
      whereClause.roomId = activeRoomId;
    }

    team = await prisma.team.findFirst({
      where: whereClause,
      include: {
        room: {
          include: {
            announcements: { orderBy: { createdAt: 'desc' } },
          },
        } as any,
        members: true,
        assignments: {
          include: { problem: true },
          orderBy: { assignedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  return team;
};

// Get current team's assigned problem & submission (User view)
export const getMyTeamSubmission = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'USER') {
      return res.status(403).json({ success: false, error: 'User access required.' });
    }

    const team = await getTeamForUser(req);

    if (!team) {
      return res.status(404).json({ success: false, error: 'No Hackathon joined yet.' });
    }

    const validAssignment = team.assignments.find(
      (a) => a.roomId === team.roomId && a.problem && a.problem.roomId === team.roomId
    );

    const assignedProblem = validAssignment?.problem || null;

    let submission = null;
    if (assignedProblem) {
      submission = await prisma.submission.findUnique({
        where: {
          teamId_problemId: {
            teamId: team.id,
            problemId: assignedProblem.id,
          },
        },
      });
    }

    return res.json({
      success: true,
      data: {
        team,
        room: team.room,
        assignedProblem,
        submission,
      },
    });
  } catch (error: any) {
    console.error('getMyTeamSubmission error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch team submission status.' });
  }
};

// Create or update project draft / submission
export const saveTeamSubmission = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'USER') {
      return res.status(403).json({ success: false, error: 'User access required.' });
    }

    const team = await getTeamForUser(req);

    if (!team || !team.assignments[0]) {
      return res.status(400).json({ success: false, error: 'No problem statement has been assigned yet.' });
    }

    const room = team.room;
    const problemId = team.assignments[0].problemId;

    // --- CRITICAL BACKEND DEADLINE CHECK ---
    const now = new Date();
    const deadline = new Date(room.submissionDeadline);
    if (now > deadline) {
      return res.status(403).json({
        success: false,
        error: 'Submission deadline has ended. Editing and uploading projects is now disabled.',
      });
    }

    // Check existing submission status
    const existingSubmission = await prisma.submission.findUnique({
      where: {
        teamId_problemId: {
          teamId: team.id,
          problemId,
        },
      },
    });

    if (existingSubmission && (existingSubmission.status === 'SUBMITTED' || existingSubmission.status === 'LOCKED')) {
      return res.status(403).json({
        success: false,
        error: 'Your project has already been final submitted and locked.',
      });
    }

    const parseResult = submissionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.errors[0].message });
    }

    const { projectName, description, githubUrl, demoUrl } = parseResult.data;
    const filePath = req.file ? `/uploads/${req.file.filename}` : existingSubmission?.filePath || null;

    const submission = await prisma.submission.upsert({
      where: {
        teamId_problemId: {
          teamId: team.id,
          problemId,
        },
      },
      update: {
        projectName,
        description,
        filePath,
        githubUrl: githubUrl || null,
        demoUrl: demoUrl || null,
        status: 'DRAFT',
      },
      create: {
        roomId: room.id,
        teamId: team.id,
        problemId,
        projectName,
        description,
        filePath,
        githubUrl: githubUrl || null,
        demoUrl: demoUrl || null,
        status: 'DRAFT',
      },
    });

    return res.json({
      success: true,
      message: 'Submission saved as draft successfully.',
      data: submission,
    });
  } catch (error: any) {
    console.error('saveTeamSubmission error:', error);
    return res.status(500).json({ success: false, error: 'Failed to save submission.' });
  }
};

// Final Submit Endpoint
export const finalSubmitTeamProject = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'USER') {
      return res.status(403).json({ success: false, error: 'User access required.' });
    }

    const team = await getTeamForUser(req);

    if (!team || !team.assignments[0]) {
      return res.status(400).json({ success: false, error: 'No problem statement assigned.' });
    }

    const room = team.room;
    const problemId = team.assignments[0].problemId;

    // --- BACKEND DEADLINE CHECK ---
    const now = new Date();
    const deadline = new Date(room.submissionDeadline);
    if (now > deadline) {
      return res.status(403).json({
        success: false,
        error: 'Submission deadline has ended. Final submission is disabled.',
      });
    }

    const submission = await prisma.submission.findUnique({
      where: {
        teamId_problemId: {
          teamId: team.id,
          problemId,
        },
      },
    });

    if (!submission) {
      return res.status(400).json({
        success: false,
        error: 'Please fill in your project details and save draft before submitting.',
      });
    }

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      message: 'Project successfully final submitted!',
      data: updated,
    });
  } catch (error: any) {
    console.error('finalSubmitTeamProject error:', error);
    return res.status(500).json({ success: false, error: 'Failed to complete final submission.' });
  }
};
