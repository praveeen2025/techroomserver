import { Response } from 'express';
import { prisma } from '../db/prisma';
import { AuthRequest } from '../middleware/auth.js';
import { assignmentSchema } from '../../validations/schemas.js';

// Assign problem to team
export const createAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const parseResult = assignmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.errors[0].message });
    }

    const { teamId, problemId } = parseResult.data;

    // Delete existing assignment for this team in this room to allow re-assignment cleanly
    await prisma.problemAssignment.deleteMany({
      where: { roomId, teamId },
    });

    const assignment = await prisma.problemAssignment.create({
      data: {
        roomId,
        teamId,
        problemId,
      },
      include: {
        team: { select: { id: true, teamCode: true, teamName: true } },
        problem: { select: { id: true, title: true } },
      },
    });

    return res.status(201).json({
      success: true,
      message: `Assigned "${assignment.problem.title}" to ${assignment.team.teamName}`,
      data: assignment,
    });
  } catch (error: any) {
    console.error('createAssignment error:', error);
    return res.status(500).json({ success: false, error: 'Failed to assign problem.' });
  }
};

// Delete assignment
export const deleteAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.problemAssignment.delete({ where: { id } });
    return res.json({ success: true, message: 'Assignment removed successfully.' });
  } catch (error: any) {
    console.error('deleteAssignment error:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove assignment.' });
  }
};
