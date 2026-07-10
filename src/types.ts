export type MemberStatus = 'active' | 'suspended' | 'sick_leave' | 'mental_health_days' | 'paused';
export type ContractType = 'CORE TEAM' | 'INDEPENDENT PARTNER';
export type BenefitProgram = 'FR Partners' | 'The Nick' | 'RAIN HEART';
export type OnboardingContractType = 'None' | 'MASTER SERVICE AGREEMENT';

export type WorkspaceMember = {
  id: string;
  employmentId: string;
  fullName: string;
  preferredName: string;
  workStartDate: string;
  contractType: ContractType;
  addressOfResidence: string;
  citizenshipCountry: string;
  iban: string;
  personalEmail: string;
  jobRole: string;
  workEmail: string;
  estimatedHours: string;
  phoneNumber: string;
  benefitPrograms: BenefitProgram[];
  timeZone: string;
  strikeSystem: number;
  portfolio: string;
  languages: string;
  software: string;
  seniority: string;
  onboarding: {
    gdprSigned: boolean;
    ndaSigned: boolean;
    contractType: OnboardingContractType;
  };
  xp: number;
  status: MemberStatus;
  statusUntil: string;
  isAdmin: boolean;
};

export type Level = {
  id: string;
  number: number;
  name: string;
  xpRequired: number;
  description: string;
};

export type Reward = {
  id: string;
  levelId: string;
  rewardName: string;
  description: string;
};

export type JumpLink = {
  id: string;
  title: string;
  icon: string;
  url: string;
  order: number;
  internalView?: 'profile' | 'guides';
};

export type GuidePage = {
  id: string;
  title: string;
  content: string;
  order: number;
};

export type WorkspaceState = {
  members: WorkspaceMember[];
  levels: Level[];
  rewards: Reward[];
  guidePages: GuidePage[];
};
