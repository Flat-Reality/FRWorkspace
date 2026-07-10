import type { GuidePage, JumpLink, Level, Reward, WorkspaceMember } from './types';

export const benefitProgramOptions = ['FR Partners', 'The Nick', 'RAIN HEART'] as const;

export const emptyMember: WorkspaceMember = {
  id: '',
  employmentId: '',
  fullName: '',
  preferredName: '',
  workStartDate: '',
  contractType: 'INDEPENDENT PARTNER',
  addressOfResidence: '',
  citizenshipCountry: '',
  iban: '',
  personalEmail: '',
  jobRole: '',
  workEmail: '',
  estimatedHours: '',
  phoneNumber: '',
  benefitPrograms: [],
  timeZone: '',
  strikeSystem: 0,
  portfolio: '',
  languages: '',
  software: '',
  seniority: '',
  onboarding: {
    gdprSigned: false,
    ndaSigned: false,
    contractType: 'None',
  },
  xp: 0,
  status: 'active',
  statusUntil: '',
  isAdmin: false,
};

export const initialLevels: Level[] = [
  { id: 'level-1', number: 1, name: 'Level 1', xpRequired: 0, description: 'Workspace access unlocked.' },
  { id: 'level-2', number: 2, name: 'Level 2', xpRequired: 250, description: 'LevelUp! progress milestone.' },
  { id: 'level-3', number: 3, name: 'Level 3', xpRequired: 500, description: 'LevelUp! progress milestone.' },
  { id: 'level-4', number: 4, name: 'Level 4', xpRequired: 1000, description: 'LevelUp! progress milestone.' },
];

export const initialRewards: Reward[] = [
  { id: 'reward-1', levelId: 'level-2', rewardName: 'Flat Reality Sweatshirt', description: 'Unlocked at Level 2.' },
  { id: 'reward-2', levelId: 'level-3', rewardName: 'Priority workspace perks', description: 'Unlocked at Level 3.' },
];

export const initialJumpLinks: JumpLink[] = [
  { id: 'jump-1', title: 'Social Benefits', icon: 'HeartHandshake', url: 'https://tally.so/r/EkYpQq', order: 1 },
  { id: 'jump-2', title: 'Code of Conduct', icon: 'ShieldCheck', url: '#code-of-conduct', order: 2 },
  { id: 'jump-3', title: 'Signed Documents', icon: 'FileCheck2', url: '#signed-documents', order: 3 },
  { id: 'jump-4', title: 'Work Records', icon: 'ClipboardList', url: '#work-records', order: 4 },
  { id: 'jump-5', title: 'Update Profile', icon: 'UserRound', url: '#profile', order: 5, internalView: 'profile' },
  { id: 'jump-6', title: 'Contact Head Office', icon: 'Building2', url: 'https://forms.office.com/r/LhHw6WFCgk', order: 6 },
];

export const initialGuidePages: GuidePage[] = [
  {
    id: 'guide-1',
    title: 'Workspace Guide',
    content:
      '# Workspace Guide\n\nUse this area for internal documentation, operating rules, onboarding notes, and team resources.\n\n## Editing\n\nAdministrators can create and update guide pages from the Admin area.',
    order: 1,
  },
];

export const initialMembers: WorkspaceMember[] = [
  {
    ...emptyMember,
    id: 'member-1',
    employmentId: 'FR-1001',
    fullName: 'Workspace Member',
    preferredName: 'Member',
    workStartDate: '2026-07-01',
    contractType: 'INDEPENDENT PARTNER',
    citizenshipCountry: 'Spain',
    personalEmail: 'member@example.com',
    jobRole: '3D Artist',
    estimatedHours: '20 hours / week',
    phoneNumber: '+34 600 000 001',
    benefitPrograms: ['FR Partners'],
    timeZone: 'Europe/Madrid',
    strikeSystem: 0,
    portfolio: 'https://portfolio.example.com',
    languages: 'English, Spanish',
    software: 'Blender, Unreal Engine',
    seniority: 'Mid-level',
    onboarding: {
      gdprSigned: true,
      ndaSigned: true,
      contractType: 'MASTER SERVICE AGREEMENT',
    },
    xp: 720,
  },
  {
    ...emptyMember,
    id: 'member-2',
    employmentId: 'FR-ADMIN',
    fullName: 'Workspace Administrator',
    preferredName: 'Admin',
    workStartDate: '2026-07-01',
    contractType: 'CORE TEAM',
    citizenshipCountry: 'Spain',
    personalEmail: 'admin@example.com',
    jobRole: 'Operations Manager',
    workEmail: 'admin@flatreality.example',
    estimatedHours: 'Full-time',
    phoneNumber: '+34 600 000 002',
    benefitPrograms: ['FR Partners', 'The Nick'],
    timeZone: 'Europe/Madrid',
    languages: 'English, Spanish',
    software: 'Notion, Linear, Microsoft 365',
    seniority: 'Senior',
    onboarding: {
      gdprSigned: true,
      ndaSigned: true,
      contractType: 'MASTER SERVICE AGREEMENT',
    },
    xp: 1420,
    isAdmin: true,
  },
];
