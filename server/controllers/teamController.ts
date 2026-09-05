import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma';
import { AuthRequest } from '../middleware/auth.js';
import { teamSchema, resetPasswordSchema } from '../../validations/schemas.js';

// Helper to generate unique Team Code
const generateTeamCode = async (): Promise<string> => {
  const count = await prisma.team.count();
  const num = (count + 1 + Math.floor(Math.random() * 100)).toString().padStart(4, '0');
  return `TR-TEAM-${num}`;
};

// Helper to generate temporary random password
const generateTempPassword = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// Get teams in a room
export const getTeamsByRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const teams = await prisma.team.findMany({
      where: { roomId },
      include: {
        members: true,
        assignments: {
          include: { problem: { select: { id: true, title: true } } },
        },
        submissions: {
          select: { id: true, status: true, projectName: true, submittedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: teams });
  } catch (error: any) {
    console.error('getTeamsByRoom error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch teams.' });
  }
};

// Create a single team manually
export const createTeam = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const parseResult = teamSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.errors[0].message });
    }

    const { teamName, leaderName, leaderEmail, college, members } = parseResult.data;

    let teamCode = await generateTeamCode();
    // Ensure uniqueness
    let attempts = 0;
    while (await prisma.team.findUnique({ where: { teamCode } })) {
      teamCode = await generateTeamCode();
      attempts++;
      if (attempts > 10) break;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const team = await prisma.team.create({
      data: {
        roomId,
        teamCode,
        teamName,
        leaderName,
        leaderEmail,
        college,
        passwordHash,
        status: 'ACTIVE',
        members: {
          create: [
            { name: leaderName, email: leaderEmail },
            ...(members || []).map((m) => ({ name: m.name, email: m.email })),
          ],
        },
      },
      include: {
        members: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: {
        ...team,
        plainPassword: tempPassword, // Provided so Admin can copy/share credentials
      },
    });
  } catch (error: any) {
    console.error('createTeam error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create team.' });
  }
};

// CSV Import Teams Endpoint
export const importTeamsCSV = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { csvContent } = req.body; // Expecting raw CSV text or lines

    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ success: false, error: 'CSV content is required.' });
    }

    const lines = csvContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return res.status(400).json({ success: false, error: 'CSV file must contain a header and at least one data row.' });
    }

    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ row: number; reason: string }> = [];
    const createdTeams: Array<any> = [];

    // Skip header (Row 1)
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      const cols = row.split(',').map((c) => c.trim().replace(/^"(.*)"$/, '$1'));

      // Format expected: Team Name, Leader Name, Email, College, Member 2, Member 3, Member 4
      const [teamName, leaderName, email, college, ...memberNames] = cols;

      if (!teamName || !leaderName || !email || !college) {
        failedCount++;
        errors.push({ row: i + 1, reason: 'Missing required columns (Team Name, Leader Name, Email, or College)' });
        continue;
      }

      try {
        let teamCode = await generateTeamCode();
        let tempPassword = generateTempPassword();
        let passwordHash = await bcrypt.hash(tempPassword, 10);

        const memberData = [{ name: leaderName, email: email }];
        memberNames.forEach((mName, idx) => {
          if (mName && mName.trim().length > 0) {
            memberData.push({
              name: mName.trim(),
              email: `member${idx + 2}.${mName.toLowerCase().replace(/\s+/g, '')}@${teamName.toLowerCase().replace(/\s+/g, '')}.com`,
            });
          }
        });

        const newTeam = await prisma.team.create({
          data: {
            roomId,
            teamCode,
            teamName,
            leaderName,
            leaderEmail: email,
            college,
            passwordHash,
            status: 'ACTIVE',
            members: {
              create: memberData,
            },
          },
        });

        createdTeams.push({
          teamCode: newTeam.teamCode,
          teamName: newTeam.teamName,
          leaderName: newTeam.leaderName,
          plainPassword: tempPassword,
        });

        successCount++;
      } catch (err: any) {
        failedCount++;
        errors.push({ row: i + 1, reason: err.message || 'Database creation failed' });
      }
    }

    return res.json({
      success: true,
      summary: {
        totalProcessed: lines.length - 1,
        successfullyImported: successCount,
        failedCount,
        errors,
      },
      createdTeams,
    });
  } catch (error: any) {
    console.error('importTeamsCSV error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process CSV import.' });
  }
};

// Reset Team Password
export const resetTeamPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const passwordToSet = newPassword || generateTempPassword();
    const passwordHash = await bcrypt.hash(passwordToSet, 10);

    const team = await prisma.team.update({
      where: { id },
      data: { passwordHash },
      select: { id: true, teamCode: true, teamName: true },
    });

    return res.json({
      success: true,
      message: `Password reset successfully for ${team.teamCode}`,
      data: {
        teamCode: team.teamCode,
        newPassword: passwordToSet,
      },
    });
  } catch (error: any) {
    console.error('resetTeamPassword error:', error);
    return res.status(500).json({ success: false, error: 'Failed to reset team password.' });
  }
};

// Delete or Deactivate Team
export const deleteTeam = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.team.delete({ where: { id } });
    return res.json({ success: true, message: 'Team deleted successfully.' });
  } catch (error: any) {
    console.error('deleteTeam error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete team.' });
  }
};

import { getTeamForUser } from './submissionController';

// Get Team Profile (User view)
export const getMyTeamProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'USER') {
      return res.status(403).json({ success: false, error: 'User access required.' });
    }

    const team = await getTeamForUser(req);

    if (!team) {
      return res.status(404).json({ success: false, error: 'No Hackathon joined yet.' });
    }

    const { passwordHash, ...teamWithoutPassword } = team;

    return res.json({
      success: true,
      data: teamWithoutPassword,
    });
  } catch (error: any) {
    console.error('getMyTeamProfile error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch team profile.' });
  }
};

// Update Team Profile (User view)
export const updateMyTeamProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'USER') {
      return res.status(403).json({ success: false, error: 'User access required.' });
    }

    const existingTeam = await getTeamForUser(req);

    if (!existingTeam) {
      return res.status(404).json({ success: false, error: 'No Hackathon joined yet.' });
    }

    const teamId = existingTeam.id;

    const { teamName, members: membersRaw } = req.body;

    let parsedMembers: Array<{ name: string; email: string; phone?: string; isLeader?: boolean }> = [];
    if (typeof membersRaw === 'string') {
      try {
        parsedMembers = JSON.parse(membersRaw);
      } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid members data format.' });
      }
    } else if (Array.isArray(membersRaw)) {
      parsedMembers = membersRaw;
    }

    const finalTeamName = teamName ? teamName.trim() : existingTeam.teamName;
    if (!finalTeamName) {
      return res.status(400).json({ success: false, error: 'Team name cannot be empty.' });
    }

    if (parsedMembers.length < 1 || parsedMembers.length > 4) {
      return res.status(400).json({ success: false, error: 'Team must have between 1 and 4 members.' });
    }

    for (let i = 0; i < parsedMembers.length; i++) {
      const m = parsedMembers[i];
      if (!m.name || !m.name.trim()) {
        return res.status(400).json({ success: false, error: `Member ${i + 1} name is required.` });
      }
      if (!m.email || !m.email.trim()) {
        return res.status(400).json({ success: false, error: `Member ${i + 1} email is required.` });
      }
    }

    let leaderIndex = parsedMembers.findIndex((m) => m.isLeader === true);
    if (leaderIndex === -1) {
      leaderIndex = 0;
    }

    const leaderMember = parsedMembers[leaderIndex];
    const logoUrl = req.file ? `/uploads/${req.file.filename}` : (existingTeam as any).logoUrl;

    const updatedTeam = await (prisma as any).$transaction(async (tx: any) => {
      await tx.teamMember.deleteMany({
        where: { teamId },
      });

      const updated = await tx.team.update({
        where: { id: teamId },
        data: {
          teamName: finalTeamName,
          leaderName: leaderMember.name.trim(),
          leaderEmail: leaderMember.email.trim().toLowerCase(),
          logoUrl,
          members: {
            create: parsedMembers.map((m, idx) => ({
              name: m.name.trim(),
              email: m.email.trim().toLowerCase(),
              phone: m.phone ? m.phone.trim() : null,
              isLeader: idx === leaderIndex,
            })),
          },
        },
        include: {
          room: true,
          members: {
            orderBy: [
              { isLeader: 'desc' },
              { createdAt: 'asc' },
            ],
          },
        },
      });

      return updated;
    });

    const { passwordHash, ...teamWithoutPassword } = updatedTeam;

    return res.json({
      success: true,
      message: 'Team profile updated successfully.',
      data: teamWithoutPassword,
    });
  } catch (error: any) {
    console.error('updateMyTeamProfile error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update team profile.' });
  }
};
