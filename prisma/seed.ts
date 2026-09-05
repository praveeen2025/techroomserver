import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting TechRoom database seed...');

  // Hash standard passwords (configurable via environment variables)
  const rootEmail = process.env.ROOT_ADMIN_EMAIL || 'rootadmin@techroom.io';
  const rootPassword = process.env.ROOT_ADMIN_PASSWORD || 'RootAdmin@123';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin1@techroom.io';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

  const defaultAdminPassword = await bcrypt.hash(adminPassword, 10);
  const defaultRootPassword = await bcrypt.hash(rootPassword, 10);
  const defaultTeamPassword = await bcrypt.hash('TeamPass@123', 10);

  // 1. Create Root Admin
  const rootAdmin = await prisma.user.upsert({
    where: { email: rootEmail },
    update: {
      passwordHash: defaultRootPassword,
      status: 'ACTIVE',
    },
    create: {
      name: 'System Root Admin',
      email: rootEmail,
      passwordHash: defaultRootPassword,
      role: 'ROOT_ADMIN',
      status: 'ACTIVE',
      isVerified: true,
    },
  });
  console.log(`✅ Root Admin created: ${rootAdmin.email}`);

  // 2. Create Admins
  const admin1 = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: defaultAdminPassword,
      status: 'ACTIVE',
    },
    create: {
      name: 'Sarah Connor (Event Lead)',
      email: adminEmail,
      passwordHash: defaultAdminPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
      isVerified: true,
    },
  });

  const admin2 = await prisma.user.upsert({
    where: { email: 'admin2@techroom.io' },
    update: {
      passwordHash: defaultAdminPassword,
      status: 'ACTIVE',
    },
    create: {
      name: 'Alex Vance (Tech Co-Ordinator)',
      email: 'admin2@techroom.io',
      passwordHash: defaultAdminPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
      isVerified: true,
    },
  });
  console.log(`✅ Admins created: ${admin1.email}, ${admin2.email}`);

  // 3. Create Rooms
  const room1 = await prisma.room.upsert({
    where: { roomCode: 'TR-ROOM-2026-001' },
    update: {},
    create: {
      roomCode: 'TR-ROOM-2026-001',
      name: 'Smart Innovation Hackathon 2026',
      description: 'National level hackathon focusing on AI, IoT, and Sustainable Smart Cities technology solutions.',
      startDate: new Date('2026-09-20T09:00:00Z'),
      endDate: new Date('2026-09-21T18:00:00Z'),
      submissionDeadline: new Date('2026-09-21T18:00:00Z'),
      status: 'ACTIVE',
      adminId: admin1.id,
    },
  });

  const room2 = await prisma.room.upsert({
    where: { roomCode: 'TR-ROOM-2026-002' },
    update: {},
    create: {
      roomCode: 'TR-ROOM-2026-002',
      name: 'College AI Challenge 2026',
      description: 'Intensive 24-hour machine learning hackathon building next-gen generative AI applications.',
      startDate: new Date('2026-10-10T10:00:00Z'),
      endDate: new Date('2026-10-11T10:00:00Z'),
      submissionDeadline: new Date('2026-10-11T10:00:00Z'),
      status: 'ACTIVE',
      adminId: admin2.id,
    },
  });
  console.log(`✅ Rooms created: ${room1.roomCode}, ${room2.roomCode}`);

  // 4. Create Problems
  const problem1 = await prisma.problem.create({
    data: {
      roomId: room1.id,
      title: 'AI-Based Smart Waste Management',
      description: 'Build an intelligent system that uses computer vision and IoT sensors to automatically segregate municipal waste into recyclable, organic, and hazardous categories.',
      requirements: '1. Real-time object detection model (YOLO/TensorFlow)\n2. Web dashboard for municipality tracking\n3. Mobile app alert system for overflow bins',
      instructions: 'Upload full project repository code as ZIP, include link to working GitHub repo and live video demonstration URL.',
    },
  });

  const problem2 = await prisma.problem.create({
    data: {
      roomId: room1.id,
      title: 'Adaptive Urban Traffic Signal Control',
      description: 'Design a dynamic traffic light optimization algorithm leveraging camera feeds to reduce congestion at urban intersections during peak hours.',
      requirements: '1. Traffic flow simulation algorithm\n2. Emergency vehicle prioritization routing\n3. Real-time density analytics UI',
      instructions: 'Submit complete source code ZIP along with architecture document and performance benchmarks.',
    },
  });

  const problem3 = await prisma.problem.create({
    data: {
      roomId: room1.id,
      title: 'Autonomous Medical Drone Dispatcher',
      description: 'Develop a flight planning and payload tracking solution for emergency medical drone deliveries to remote areas.',
      requirements: '1. Waypoint optimization algorithm\n2. Weather integration safety check\n3. Live telemetry dashboard',
      instructions: 'Include simulation video link and technical documentation in the project submission.',
    },
  });

  const problem4 = await prisma.problem.create({
    data: {
      roomId: room2.id,
      title: 'Cyber Sentinel: Automated Vulnerability Scanner',
      description: 'Create an automated SAST/DAST scanner that detects security vulnerabilities in web API endpoints and suggests automated patches.',
      requirements: '1. OWASP Top 10 automated test suite\n2. Remediated code snippet generator\n3. PDF Executive Report generator',
      instructions: 'Upload source code and demo video link demonstrating scanning against a test target.',
    },
  });

  const problem5 = await prisma.problem.create({
    data: {
      roomId: room2.id,
      title: 'HealthTrack AI: Personal Preventive Care Companion',
      description: 'Build an LLM-powered patient assistant that analyzes health metrics, wearable data, and labs to predict health risks.',
      requirements: '1. Patient data encryption (HIPAA compliant approach)\n2. Wearable data simulator\n3. Conversational symptom checker',
      instructions: 'Provide working GitHub link and submission ZIP containing architecture specs.',
    },
  });
  console.log(`✅ 5 Problems created.`);

  // 5. Create Teams and Members
  const teamsData = [
    {
      teamCode: 'TR-TEAM-0101',
      teamName: 'Team Alpha Nexus',
      leaderName: 'John Doe',
      leaderEmail: 'john@alphanexus.org',
      college: 'MIT Institute of Technology',
      roomId: room1.id,
      members: ['John Doe', 'Alice Smith', 'Bob Johnson', 'David Miller'],
      problemId: problem1.id,
    },
    {
      teamCode: 'TR-TEAM-0102',
      teamName: 'Cyber Knights',
      leaderName: 'Emma Watson',
      leaderEmail: 'emma@cyberknights.io',
      college: 'Stanford Engineering College',
      roomId: room1.id,
      members: ['Emma Watson', 'Liam Neeson', 'Sophia Turner'],
      problemId: problem1.id,
    },
    {
      teamCode: 'TR-TEAM-0103',
      teamName: 'Quantum Coders',
      leaderName: 'Rahul Sharma',
      leaderEmail: 'rahul@quantumcoders.com',
      college: 'IIT Bombay',
      roomId: room1.id,
      members: ['Rahul Sharma', 'Priya Patel', 'Amit Verma', 'Sneha Roy'],
      problemId: problem2.id,
    },
    {
      teamCode: 'TR-TEAM-0104',
      teamName: 'Neural Nets',
      leaderName: 'Carlos Sainz',
      leaderEmail: 'carlos@neuralnets.dev',
      college: 'UC Berkeley',
      roomId: room1.id,
      members: ['Carlos Sainz', 'Max Verstappen', 'Lando Norris'],
      problemId: problem3.id,
    },
    {
      teamCode: 'TR-TEAM-0105',
      teamName: 'Green Techies',
      leaderName: 'Ananya Roy',
      leaderEmail: 'ananya@greentech.org',
      college: 'BITS Pilani',
      roomId: room1.id,
      members: ['Ananya Roy', 'Rohan Gupta', 'Kavita Das'],
      problemId: problem1.id,
    },
    {
      teamCode: 'TR-TEAM-0106',
      teamName: 'Byte Builders',
      leaderName: 'Michael Chang',
      leaderEmail: 'michael@bytebuilders.net',
      college: 'Georgia Tech',
      roomId: room2.id,
      members: ['Michael Chang', 'Sarah Jenkins', 'Chris Lee'],
      problemId: problem4.id,
    },
    {
      teamCode: 'TR-TEAM-0107',
      teamName: 'Visionary Devs',
      leaderName: 'Zainab Ahmed',
      leaderEmail: 'zainab@visionary.io',
      college: 'Oxford Tech',
      roomId: room2.id,
      members: ['Zainab Ahmed', 'Youssef Omar', 'Fatima Ali', 'Tariq Mansoor'],
      problemId: problem5.id,
    },
    {
      teamCode: 'TR-TEAM-0108',
      teamName: 'Code Warriors',
      leaderName: 'Alex Mercer',
      leaderEmail: 'alex@codewarriors.org',
      college: 'Carnegie Mellon University',
      roomId: room2.id,
      members: ['Alex Mercer', 'Dana Scully', 'Fox Mulder'],
      problemId: problem4.id,
    },
    {
      teamCode: 'TR-TEAM-0109',
      teamName: 'Algorithm Aces',
      leaderName: 'Vikram Singh',
      leaderEmail: 'vikram@algoaces.com',
      college: 'Delhi Technological University',
      roomId: room2.id,
      members: ['Vikram Singh', 'Deepak Kumar', 'Meera Nair'],
      problemId: problem5.id,
    },
    {
      teamCode: 'TR-TEAM-0110',
      teamName: 'Matrix Ninjas',
      leaderName: 'Neo Anderson',
      leaderEmail: 'neo@matrixninjas.com',
      college: 'Zion Institute',
      roomId: room2.id,
      members: ['Neo Anderson', 'Trinity Moss', 'Morpheus Vance'],
      problemId: problem4.id,
    },
  ];

  for (const t of teamsData) {
    const team = await prisma.team.upsert({
      where: { teamCode: t.teamCode },
      update: {},
      create: {
        teamCode: t.teamCode,
        teamName: t.teamName,
        leaderName: t.leaderName,
        leaderEmail: t.leaderEmail,
        college: t.college,
        passwordHash: defaultTeamPassword,
        status: 'ACTIVE',
        roomId: t.roomId,
      },
    });

    // Create members
    for (const memberName of t.members) {
      await prisma.teamMember.create({
        data: {
          teamId: team.id,
          name: memberName,
          email: `${memberName.toLowerCase().replace(/\s+/g, '.')}@${t.teamName.toLowerCase().replace(/\s+/g, '')}.com`,
        },
      });
    }

    // Assign Problem
    await prisma.problemAssignment.upsert({
      where: {
        teamId_problemId: {
          teamId: team.id,
          problemId: t.problemId,
        },
      },
      update: {},
      create: {
        roomId: t.roomId,
        teamId: team.id,
        problemId: t.problemId,
      },
    });

    // Create sample submission for some teams
    if (t.teamCode === 'TR-TEAM-0101') {
      await prisma.submission.upsert({
        where: {
          teamId_problemId: {
            teamId: team.id,
            problemId: t.problemId,
          },
        },
        update: {},
        create: {
          roomId: t.roomId,
          teamId: team.id,
          problemId: t.problemId,
          projectName: 'EcoSegregate AI',
          description: 'An end-to-end computer vision waste classification platform integrated with IoT smart bin telemetry and automated alerts.',
          githubUrl: 'https://github.com/alphanexus/ecosegregate-ai',
          demoUrl: 'https://youtube.com/watch?v=sample-demo-ecosegregate',
          status: 'SUBMITTED',
          submittedAt: new Date(),
        },
      });
    } else if (t.teamCode === 'TR-TEAM-0103') {
      await prisma.submission.upsert({
        where: {
          teamId_problemId: {
            teamId: team.id,
            problemId: t.problemId,
          },
        },
        update: {},
        create: {
          roomId: t.roomId,
          teamId: team.id,
          problemId: t.problemId,
          projectName: 'SmartTraffic AI',
          description: 'Draft model training pipeline and API spec for adaptive traffic light synchronization.',
          githubUrl: 'https://github.com/quantumcoders/smart-traffic-draft',
          demoUrl: '',
          status: 'DRAFT',
        },
      });
    }
  }

  console.log(`✅ 10 Teams, Members, Assignments & Sample Submissions seeded.`);
  console.log(`
🎉 Seed complete!
------------------------------------------------------
Credentials for Testing:
1. Root Admin:
   Email: rootadmin@techroom.io
   Password: RootAdmin@123

2. Admin 1:
   Email: admin1@techroom.io
   Password: Admin@123

3. Team 1 (Submitted state):
   Team Code: TR-TEAM-0101
   Password: TeamPass@123

4. Team 3 (Draft state):
   Team Code: TR-TEAM-0103
   Password: TeamPass@123
------------------------------------------------------
  `);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
