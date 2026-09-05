import { Response } from 'express';
import { prisma } from '../db/prisma';
import { AuthRequest } from '../middleware/auth.js';
import { problemSchema } from '../../validations/schemas.js';
import { getTeamForUser } from './submissionController.js';

// Get problems for a specific room
export const getProblemsByRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const problems = await prisma.problem.findMany({
      where: { roomId },
      include: {
        _count: {
          select: {
            assignments: true,
            submissions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: problems });
  } catch (error: any) {
    console.error('getProblemsByRoom error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch problems.' });
  }
};

// Create a problem in a room
export const createProblem = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const parseResult = problemSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.errors[0].message });
    }

    const { title, description, requirements, instructions } = parseResult.data;
    const attachmentPath = req.file ? `/uploads/${req.file.filename}` : null;

    const newProblem = await prisma.problem.create({
      data: {
        roomId,
        title,
        description,
        requirements,
        instructions,
        attachmentPath,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Problem statement created successfully',
      data: newProblem,
    });
  } catch (error: any) {
    console.error('createProblem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create problem statement.' });
  }
};

// Update problem
export const updateProblem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const problem = await prisma.problem.findUnique({ where: { id } });
    if (!problem) {
      return res.status(404).json({ success: false, error: 'Problem not found.' });
    }

    const parseResult = problemSchema.partial().safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.errors[0].message });
    }

    const attachmentPath = req.file ? `/uploads/${req.file.filename}` : problem.attachmentPath;

    const updated = await prisma.problem.update({
      where: { id },
      data: {
        ...parseResult.data,
        attachmentPath,
      },
    });

    return res.json({ success: true, message: 'Problem updated successfully', data: updated });
  } catch (error: any) {
    console.error('updateProblem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update problem.' });
  }
};

// Delete problem
export const deleteProblem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.problem.delete({ where: { id } });
    return res.json({ success: true, message: 'Problem deleted successfully.' });
  } catch (error: any) {
    console.error('deleteProblem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete problem.' });
  }
};

// Get problem statement assigned to the authenticated team (User view)
export const getMyAssignedProblemStatement = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'USER') {
      return res.status(403).json({ success: false, error: 'User access required.' });
    }

    const team = await getTeamForUser(req);

    if (!team) {
      return res.status(404).json({ success: false, error: 'No Hackathon joined yet.' });
    }

    // Filter assignment belonging to team's room (room isolation)
    const validAssignment = team.assignments.find(
      (a) => a.roomId === team.roomId && a.problem && a.problem.roomId === team.roomId
    );

    if (!validAssignment || !validAssignment.problem) {
      return res.json({
        success: true,
        data: null,
        message: 'No Problem Statement has been assigned to your team yet.',
      });
    }

    return res.json({
      success: true,
      data: {
        problem: validAssignment.problem,
        room: team.room,
        assignedAt: validAssignment.assignedAt,
      },
    });
  } catch (error: any) {
    console.error('getMyAssignedProblemStatement error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch assigned problem statement.' });
  }
};
