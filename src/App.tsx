import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  Activity,
  AlertTriangle,
  Award,
  Ban,
  Bell,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleOff,
  Clock,
  ClipboardList,
  CirclePause,
  Contact,
  Download,
  DollarSign,
  ExternalLink,
  FileCheck2,
  FileText,
  Folder,
  FlaskConical,
  Gift,
  Github,
  Gavel,
  HeartHandshake,
  HeartPulse,
  KeyRound,
  Link2,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  MonitorSmartphone,
  LogOut,
  PenLine,
  Phone,
  Plus,
  RotateCcw,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  TrendingUp,
  Timer,
  Umbrella,
  Upload,
  UserRound,
  UsersRound,
  WalletCards,
  Zap,
} from 'lucide-react';
import { benefitProgramOptions, emptyMember, initialFileProjects, initialGuidePages, initialJumpLinks, initialLevels, initialMembers, initialRewards } from './data';
import { HrOnboardingWizard } from './HrOnboardingWizard';
import { isSupabaseConfigured } from './supabase';
import { checkRecoveryOptions as checkRecoveryOptionsServer, completeEntraSetup, connectGitHub, connectSteam, connectUpwork, createUpworkContract, defaultWorkspaceState, disconnectGitHub, disconnectSteam, disconnectUpwork, getEntraAvatar, getEntraDevices, getEntraWorkspaceLogin, getGitHubSnapshot, getRetainerSnapshot, getSteamSnapshot, getUpworkSnapshot, impersonateWorkspaceMember, listWorkspaceAuditLogs, loadWorkspaceState, loginWorkspace, recoverWorkspacePassword, resetWorkspacePassword, saveRetainerOffering, saveWorkspaceState, signOutEntra, startEntraLogin, updateRetainerInquiry } from './storage';
import type { WorkspaceSession } from './storage';
import type {
  AuditLogEntry,
  BenefitProgram,
  ContractType,
  FileProject,
  FileResourceType,
  EntraDevice,
  GitHubSnapshot,
  GuidePage,
  JumpLink,
  Level,
  MemberDocument,
  MemberStatus,
  OnboardingContractType,
  PartnerStatus,
  Reward,
  RetainerOffering,
  RetainerSnapshot,
  ScheduleDayCompletion,
  ScheduleDayStatus,
  ScheduleShift,
  SteamSnapshot,
  UpworkContractDraft,
  UpworkSnapshot,
  WorkRecord,
  WorkRecordType,
  WorkspaceMember,
  WorkspaceState,
} from './types';

type View = 'dashboard' | 'profile' | 'levelup' | 'admin' | 'guides' | 'workRecords' | 'signedDocuments' | 'benefits' | 'installs' | 'careerGrowth' | 'schedule' | 'files';
type AdminModule = 'home' | 'hr' | 'partners' | 'retainer' | 'guides' | 'levelup' | 'logs' | 'supabase';
type HrTab = 'overview' | 'contact' | 'records' | 'access' | 'devices' | 'levelup' | 'payments' | 'documents' | 'careerGrowth' | 'partners' | 'experiments';
type ProfileTab = 'profile' | 'contact' | 'payments' | 'skills' | 'integrations';
type WorkspaceUpdate = (nextMembers: WorkspaceMember[], nextRecords?: WorkRecord[]) => void;

const SESSION_KEY = 'flat-reality-workspace-session';
const ENTRA_REMEMBERED_KEY = 'flat-reality-workspace-entra-remembered';
const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const publicAsset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
const BRAND_ICON = publicAsset('resources/favicon/favicon-32x32.png');
const ENTRA_ICON = publicAsset('resources/logos/entra-id.png');
const ENTRA_SCAN_ANIMATION = 'https://assets-v2.lottiefiles.com/a/5ef1272e-117c-11ee-b2c4-a7c896093f14/z2bONj3JN4.lottie';
const ENTRA_EMAIL_DOMAINS = ['flatreality.eu', 'flatrealitycompany.onmicrosoft.com'];
const EMPTY_UPWORK_SNAPSHOT: UpworkSnapshot = {
  eligible: false,
  connected: false,
  available: true,
  connectionStatus: 'not_connected',
  message: '',
  lastSyncedAt: '',
  profile: null,
  contracts: [],
  payments: null,
  timeEntries: [],
};
const EMPTY_GITHUB_SNAPSHOT: GitHubSnapshot = {
  connected: false,
  username: '',
  profileUrl: '',
  avatarUrl: '',
  email: '',
  membershipState: 'not_connected',
  teamSlugs: [],
  syncError: '',
  lastSyncedAt: '',
};
const EMPTY_STEAM_SNAPSHOT: SteamSnapshot = {
  connected: false,
  steamId: '',
  profileUrl: '',
  packageStatus: 'not_connected',
  connectedAt: '',
};

function isAllowedEntraEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  const [localPart, domain, ...rest] = normalized.split('@');
  return Boolean(localPart && domain && !rest.length && ENTRA_EMAIL_DOMAINS.includes(domain));
}

const iconMap: Record<string, LucideIcon> = {
  HeartHandshake,
  ShieldCheck,
  FileCheck2,
  ClipboardList,
  UserRound,
  BookOpen,
  Building2,
  Trophy,
  TrendingUp,
  CalendarDays,
  Download,
  Folder,
  Settings2,
};

const statusOptions: Array<{ value: MemberStatus; label: string; icon: LucideIcon; needsDate: boolean; blocksLogin: boolean }> = [
  { value: 'active', label: 'Active', icon: CheckCircle2, needsDate: false, blocksLogin: false },
  { value: 'suspended', label: 'Suspended', icon: Ban, needsDate: false, blocksLogin: true },
  { value: 'sick_leave', label: 'Sick Leave', icon: HeartPulse, needsDate: true, blocksLogin: false },
  { value: 'mental_health_days', label: 'Mental Health Days', icon: Brain, needsDate: true, blocksLogin: false },
  { value: 'paused', label: 'Paused', icon: CalendarClock, needsDate: true, blocksLogin: false },
];

const recordTypes: Array<{ value: WorkRecordType; label: string; icon: string }> = [
  { value: 'standard', label: 'Standard', icon: '✎' },
  { value: 'positive', label: 'Positive', icon: '🎉' },
  { value: 'strike', label: 'Strike', icon: '⚖' },
  { value: 'negative', label: 'Other negative', icon: '!' },
  { value: 'explanation_request', label: 'Request explanation', icon: '!' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(date: string, months: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setMonth(value.getMonth() + months);
  return value.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  if (!value) return 'Never online';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never online';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function isOnline(member: WorkspaceMember) {
  if (!member.lastSeenAt) return false;
  return Date.now() - new Date(member.lastSeenAt).getTime() < 5 * 60 * 1000;
}

function presenceLabel(member: WorkspaceMember) {
  return isOnline(member) ? 'Online now' : `Last online: ${formatDateTime(member.lastSeenAt)}`;
}

function displayName(member: WorkspaceMember) {
  return member.preferredName.trim() || member.fullName || member.employmentId;
}

function isIndependentPartner(member: WorkspaceMember) {
  return String(member.contractType).toUpperCase().includes('INDEPENDENT');
}

function isCoreTeam(member: WorkspaceMember) {
  return String(member.contractType).toUpperCase().includes('CORE');
}

function isUpworkContract(member: WorkspaceMember) {
  return member.onboarding.contractType === 'UPWORK CONTRACT';
}

function isUpworkProfileUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && (url.hostname === 'upwork.com' || url.hostname.endsWith('.upwork.com')) && url.pathname !== '/';
  } catch {
    return false;
  }
}

function isFrPartnersConnected(member: WorkspaceMember) {
  return member.benefitPrograms.includes('FR Partners');
}

function projectLabel(project: BenefitProgram) {
  return project === 'FR Partners' ? 'Partners™' : project;
}

function openExplanationRequestCount(records: WorkRecord[], memberId: string) {
  return records.filter((record) => record.memberId === memberId && record.type === 'explanation_request' && !record.explanationText).length;
}

function calculatePartnerQualityIndex(member: WorkspaceMember, snapshot: UpworkSnapshot, openExplanationRequests = 0) {
  const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
  const strikes = clamp(Number(member.strikeSystem) || 0, 0, 3);
  const reliabilityScore = [35, 24, 10, 0][strikes];
  const completedTasks = Math.max(0, Number(member.completedTasks) || 0);
  const deliveryScore = 25 * (1 - Math.exp(-completedTasks / 8));

  const startedAt = member.workStartDate ? new Date(`${member.workStartDate}T00:00:00`) : null;
  const tenureMonths = startedAt && !Number.isNaN(startedAt.getTime())
    ? Math.max(0, (Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.4375))
    : 0;
  const tenureScore = 15 * clamp(tenureMonths / 12, 0, 1);

  const profileSignals = [member.jobRole, member.seniority, member.timeZone, member.portfolio, member.rate];
  const profileScore = 15 * (profileSignals.filter((value) => String(value ?? '').trim()).length / profileSignals.length);

  const closedContracts = snapshot.contracts.filter((contract) => contract.status === 'Closed').length;
  const hasActiveContract = snapshot.contracts.some((contract) => contract.status === 'Active');
  const trackedHours = snapshot.timeEntries.reduce((total, entry) => total + Math.max(0, entry.hours), 0);
  const hasUpworkIdentity = snapshot.connected || isUpworkProfileUrl(member.upworkUrl);
  const platformScore = hasUpworkIdentity
    ? 3 + Math.min(4, closedContracts * 2) + (hasActiveContract ? 1 : 0) + Math.min(2, trackedHours / 20)
    : 0;

  const baseScore = clamp(reliabilityScore + deliveryScore + tenureScore + profileScore + platformScore, 0, 100);
  const endorsedSkillCount = new Set((member.endorsedSkills ?? []).map((skill) => skill.trim().toLowerCase()).filter(Boolean)).size;
  const endorsedSkillBonus = 0.06 * (1 - Math.exp(-endorsedSkillCount / 5));
  const explanationPenalty = 0.15 * (1 - Math.exp(-Math.max(0, openExplanationRequests) / 4));

  return Math.round(clamp(baseScore * (1 + endorsedSkillBonus) * (1 - explanationPenalty), 0, 100));
}

function partnerStatusPriority(status: PartnerStatus) {
  return ({ available: 0, working_hours: 1, inactive: 2 } as Record<PartnerStatus, number>)[status] ?? 3;
}

function VerifiedMark({ member, size = 'md' }: { member: WorkspaceMember; size?: 'sm' | 'md' }) {
  if (!isIndependentPartner(member) && !member.entraSetupCompleted) return null;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${isIndependentPartner(member) ? 'bg-amber-400' : 'bg-forest'} ${size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'}`}>
      <Check size={size === 'sm' ? 11 : 13} strokeWidth={3} />
    </span>
  );
}

function ProfileAvatar({ src, name, size = 'lg' }: { src?: string; name: string; size?: 'sm' | 'lg' }) {
  const dimensions = size === 'sm' ? 'h-11 w-11' : 'h-20 w-20';
  if (src) return <img className={`${dimensions} shrink-0 rounded-full border border-line object-cover`} src={src} alt={`${name} profile`} />;
  return (
    <span className={`flex ${dimensions} shrink-0 items-center justify-center rounded-full border border-line bg-mist text-zinc-400`} aria-label={`${name} profile placeholder`}>
      <UserRound size={size === 'sm' ? 21 : 34} />
    </span>
  );
}

function getCurrentLevel(levels: Level[], xp: number) {
  return [...levels].sort((a, b) => b.xpRequired - a.xpRequired).find((level) => xp >= level.xpRequired) ?? levels[0];
}

function getNextLevel(levels: Level[], xp: number) {
  return [...levels].sort((a, b) => a.xpRequired - b.xpRequired).find((level) => level.xpRequired > xp) ?? null;
}

function statusLabel(status: MemberStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function formatEuroAmount(amount: number | undefined) {
  return `${Number(amount ?? 0).toFixed(2)}€`;
}

function formatUpworkMoney(value: { amount: number; currency: string } | null | undefined) {
  if (!value) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: value.currency || 'USD' }).format(value.amount);
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function legacySha256(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password: string) {
  const iterations = 210000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, storedHash: string) {
  if (storedHash.startsWith('pbkdf2$')) {
    const [, iterationsValue, saltValue, hashValue] = storedHash.split('$');
    const iterations = Number(iterationsValue);
    if (!iterations || !saltValue || !hashValue) return { ok: false, needsUpgrade: false };
    const salt = base64ToBytes(saltValue);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    return { ok: timingSafeEqual(bytesToBase64(new Uint8Array(bits)), hashValue), needsUpgrade: false };
  }

  return { ok: timingSafeEqual(await legacySha256(password), storedHash), needsUpgrade: true };
}

function getStoredSession() {
  try {
    const session = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null') as WorkspaceSession | null;
    const expiresAt = typeof session?.expiresAt === 'string' ? new Date(session.expiresAt).getTime() : Number(session?.expiresAt ?? 0);
    if (!session?.memberId || !expiresAt || expiresAt < Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(memberId: string, token?: string, expiresAt?: string | number, authMethod?: WorkspaceSession['authMethod']) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ memberId, token, expiresAt: expiresAt ?? Date.now() + SESSION_DURATION_MS, authMethod }));
}

function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

function getWeekStart(date = new Date()) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function minutesToHours(minutes: number) {
  return Math.max(0, minutes) / 60;
}

function plannedHours(shifts: ScheduleShift[]) {
  return shifts.reduce((total, shift) => total + minutesToHours(timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime)), 0);
}

function formatHours(hours: number) {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

function formatPlannerTime(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!wholeHours && minutes) return `${minutes} min`;
  if (wholeHours && minutes) return `${wholeHours}h ${minutes}m`;
  return `${wholeHours}h`;
}

function parseEstimatedHours(value: string) {
  const match = value.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function formatTime12(time: string) {
  const [rawHours, rawMinutes] = time.split(':').map(Number);
  const period = rawHours >= 12 ? 'PM' : 'AM';
  const hours = rawHours % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${String(rawMinutes || 0).padStart(2, '0')} ${period}`;
}

function shiftTimeLabel(shift: ScheduleShift) {
  return `${formatTime12(shift.startTime)} - ${formatTime12(shift.endTime)}`;
}

function recordStyle(type: WorkRecordType) {
  if (type === 'explanation_request') return { icon: '!', border: 'border-red-600', bg: 'bg-red-600' };
  if (type === 'positive') return { icon: '🎉', border: 'border-emerald-300', bg: 'bg-emerald-50' };
  if (type === 'strike') return { icon: '⚖', border: 'border-red-300', bg: 'bg-red-50' };
  if (type === 'negative') return { icon: '!', border: 'border-red-200', bg: 'bg-white' };
  return { icon: '✎', border: 'border-line', bg: 'bg-white' };
}

function sortRecordsNewestFirst(records: WorkRecord[]) {
  return [...records].sort((a, b) => {
    if (a.type === 'explanation_request' && b.type !== 'explanation_request') return -1;
    if (b.type === 'explanation_request' && a.type !== 'explanation_request') return 1;
    return (b.date || today()).localeCompare(a.date || today());
  });
}

function normalizeMemberRuntime(member: WorkspaceMember) {
  const statusUntil = member.statusUntil ?? '';

  if (statusUntil && ['sick_leave', 'mental_health_days', 'paused'].includes(member.status)) {
    const endDate = new Date(`${statusUntil}T23:59:59`);
    if (!Number.isNaN(endDate.getTime()) && endDate < new Date()) {
      return { ...member, status: 'active' as const, statusUntil: '' };
    }
  }

  return { ...member, statusUntil };
}

function reconcileWorkspace(members: WorkspaceMember[], records: WorkRecord[]) {
  let nextRecords = [...records];
  const nextMembers = members.map(normalizeMemberRuntime).map((member) => {
    const expiredStrikes = nextRecords.filter(
      (record) =>
        record.memberId === member.id &&
        record.type === 'strike' &&
        record.expiresAt &&
        new Date(`${record.expiresAt}T23:59:59`) < new Date() &&
        !nextRecords.some((item) => item.relatedStrikeDate === record.date && item.memberId === member.id),
    );

    if (expiredStrikes.length) {
      expiredStrikes.forEach((strike) => {
        nextRecords.push({
          id: `record-${Date.now()}-${strike.id}`,
          memberId: member.id,
          type: 'standard',
          date: today(),
          text: `Strike from ${formatDate(strike.date)} was removed automatically.`,
          relatedStrikeDate: strike.date,
          autoGenerated: true,
        });
      });
    }

    const activeStrikeCount = nextRecords.filter(
      (record) =>
        record.memberId === member.id &&
        record.type === 'strike' &&
        (!record.expiresAt || new Date(`${record.expiresAt}T23:59:59`) >= new Date()) &&
        !nextRecords.some((item) => item.relatedStrikeDate === record.date && item.memberId === member.id),
    ).length;

    const strikeSystem = Math.min(3, activeStrikeCount);
    const shouldSuspend = strikeSystem >= 3;
    const alreadyHasSuspensionRecord = nextRecords.some((record) => record.memberId === member.id && record.text.includes('automatically suspended after reaching 3 strikes'));

    if (shouldSuspend && member.status !== 'suspended' && !alreadyHasSuspensionRecord) {
      nextRecords.push({
        id: `record-${Date.now()}-suspension-${member.id}`,
        memberId: member.id,
        type: 'negative',
        date: today(),
        text: `${displayName(member)} was automatically suspended after reaching 3 strikes.`,
        autoGenerated: true,
      });
    }

    return { ...member, strikeSystem, status: shouldSuspend ? ('suspended' as const) : member.status };
  });

  return { members: nextMembers, records: nextRecords };
}

function registrationRecord(member: WorkspaceMember): WorkRecord {
  return {
    id: `record-${Date.now()}-${member.id}`,
    memberId: member.id,
    type: 'standard',
    date: member.workStartDate || today(),
    text: `${displayName(member)} was registered as ${member.contractType} for ${member.jobRole || 'an unspecified role'}.`,
    autoGenerated: true,
  };
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-600">{label}</span>
      <input
        className="h-11 rounded-lg border border-line bg-white px-3 text-sm outline-none transition disabled:bg-mist disabled:text-zinc-500 focus:border-forest focus:ring-4 focus:ring-forest/10"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function EntraEmailField({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  const invalid = Boolean(draft.trim()) && !isAllowedEntraEmail(draft);

  useEffect(() => setDraft(value), [value]);

  function commit() {
    if (!invalid) onChange(draft.trim().toLowerCase());
  }

  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-600">Entra ID Email</span>
      <input
        className={`h-11 rounded-lg border px-3 text-sm outline-none transition ${disabled ? 'border-[#71c9ee]/45 bg-[#1686c8]/10 font-medium text-[#1686c8]' : 'bg-white'} ${invalid ? 'border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-line focus:border-forest focus:ring-4 focus:ring-forest/10'}`}
        type="email"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
      {disabled ? (
        <span className="text-xs font-medium text-[#1686c8]">Locked after the first successful Entra ID sign-in.</span>
      ) : (
        <span className={`text-xs ${invalid ? 'text-red-600' : 'text-zinc-500'}`}>
          Use @flatreality.eu or @flatrealitycompany.onmicrosoft.com.
        </span>
      )}
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-600">{label}</span>
      <select
        className="h-11 rounded-lg border border-line bg-white px-3 text-sm outline-none disabled:bg-mist disabled:text-zinc-500 focus:border-forest focus:ring-4 focus:ring-forest/10"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function AccountTypeRadios({ value, onChange }: { value: ContractType; onChange: (value: ContractType) => void }) {
  const options: ContractType[] = ['CORE TEAM', 'INDEPENDENT PARTNER'];

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium text-zinc-600">Account Type</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm font-medium ${value === option ? 'border-forest bg-forest/10 text-forest' : 'border-line bg-white text-zinc-600'}`}>
            <input type="radio" name="accountType" checked={value === option} onChange={() => onChange(option)} />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function renderTextMarkup(content: string) {
  return content.split('\n').map((line, index) => {
    const key = `${line}-${index}`;
    if (line.startsWith('# ')) return <h1 key={key} className="mt-1 text-3xl font-semibold">{line.replace('# ', '')}</h1>;
    if (line.startsWith('## ')) return <h2 key={key} className="mt-6 text-xl font-semibold">{line.replace('## ', '')}</h2>;
    if (line.startsWith('- ')) return <li key={key} className="ml-5 list-disc text-zinc-600">{line.replace('- ', '')}</li>;
    if (!line.trim()) return <div key={key} className="h-3" />;
    return <p key={key} className="leading-7 text-zinc-600">{line}</p>;
  });
}

export default function App() {
  const [members, setMembers] = useState<WorkspaceMember[]>(initialMembers);
  const [levels, setLevels] = useState<Level[]>(initialLevels);
  const [rewards, setRewards] = useState<Reward[]>(initialRewards);
  const [workRecords, setWorkRecords] = useState<WorkRecord[]>([]);
  const [scheduleShifts, setScheduleShifts] = useState<ScheduleShift[]>([]);
  const [scheduleCompletions, setScheduleCompletions] = useState<ScheduleDayCompletion[]>([]);
  const [fileProjects, setFileProjects] = useState<FileProject[]>(initialFileProjects);
  const [jumpLinks] = useState<JumpLink[]>(initialJumpLinks);
  const [guidePages, setGuidePages] = useState<GuidePage[]>(initialGuidePages);
  const [employmentId, setEmploymentId] = useState('');
  const [password, setPassword] = useState('');
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [loginIntroName, setLoginIntroName] = useState('');
  const [entraSetupStage, setEntraSetupStage] = useState<'welcome' | 'identity' | 'orbit' | 'setup' | 'complete' | null>(null);
  const [entraSetupMemberId, setEntraSetupMemberId] = useState<string | null>(null);
  const [entraPreferredName, setEntraPreferredName] = useState('');
  const [isCompletingEntraSetup, setIsCompletingEntraSetup] = useState(false);
  const [hasRememberedEntra, setHasRememberedEntra] = useState(() => window.localStorage.getItem(ENTRA_REMEMBERED_KEY) === '1');
  const [showLegacyLogin, setShowLegacyLogin] = useState(false);
  const [view, setView] = useState<View>(() => window.location.hash.startsWith('#/hr') ? 'admin' : 'dashboard');
  const [profileTab, setProfileTab] = useState<ProfileTab>('profile');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [adminFocusMode, setAdminFocusMode] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isEntraLoginPending, setIsEntraLoginPending] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading workspace data...');
  const [upworkSnapshot, setUpworkSnapshot] = useState<UpworkSnapshot>(EMPTY_UPWORK_SNAPSHOT);
  const [upworkStatus, setUpworkStatus] = useState('');
  const [entraAvatarUrl, setEntraAvatarUrl] = useState('');

  function applyLoadedState(state: WorkspaceState, sessionMemberId?: string | null) {
    const reconciled = reconcileWorkspace(state.members, state.workRecords);
    setMembers(reconciled.members);
    setLevels(state.levels.length ? state.levels : defaultWorkspaceState.levels);
    setRewards(state.rewards);
    setGuidePages(state.guidePages);
    setWorkRecords(reconciled.records);
    setScheduleShifts(state.scheduleShifts);
    setScheduleCompletions(state.scheduleCompletions);
    setFileProjects(state.fileProjects);
    if (sessionMemberId && reconciled.members.some((member) => member.id === sessionMemberId)) {
      setCurrentMemberId(sessionMemberId);
    }
    return reconciled.members.find((member) => member.id === sessionMemberId) ?? null;
  }

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      const storedSession = getStoredSession();
      try {
        if (storedSession?.token) {
          try {
            const state = await loadWorkspaceState(storedSession.token);
            if (!isMounted) return;
            applyLoadedState(state, storedSession.memberId);
            setSaveStatus(isSupabaseConfigured ? 'Database connected' : 'Saved locally in this browser');
            return;
          } catch {
            clearSession();
            await signOutEntra().catch(() => undefined);
          }
        }

        const callbackQuery = new URLSearchParams(window.location.search);
        const callbackHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const isEntraCallback = window.sessionStorage.getItem('flat-reality-workspace-entra-pending') === '1'
          || window.localStorage.getItem('flat-reality-workspace-entra-pending') === '1'
          || callbackQuery.has('code')
          || callbackQuery.has('error')
          || callbackHash.has('access_token')
          || callbackHash.has('error');
        if (isSupabaseConfigured && isEntraCallback) {
          try {
            const response = await getEntraWorkspaceLogin();
            if (!response) throw new Error('Microsoft sign-in returned without an authenticated session. Please try again.');
            if (response && isMounted) {
              const member = applyLoadedState(response.state, response.session.memberId);
              if (!member) throw new Error('The linked Workspace profile was not returned.');
              saveSession(member.id, response.session.token, response.session.expiresAt, response.session.authMethod);
              window.localStorage.setItem(ENTRA_REMEMBERED_KEY, '1');
              window.sessionStorage.removeItem('flat-reality-workspace-entra-pending');
              window.localStorage.removeItem('flat-reality-workspace-entra-pending');
              setHasRememberedEntra(true);
              if (response.firstLink) {
                setEntraSetupMemberId(member.id);
                setEntraPreferredName(member.preferredName);
                setEntraSetupStage('welcome');
                window.setTimeout(() => setEntraSetupStage('identity'), 5400);
                window.setTimeout(() => setEntraSetupStage('orbit'), 7400);
                window.setTimeout(() => setEntraSetupStage('setup'), 15400);
              } else {
                setLoginIntroName(displayName(member));
                window.setTimeout(() => setLoginIntroName(''), 1150);
              }
              setSaveStatus('Database connected');
              setLoginError('');
              return;
            }
          } catch (error) {
            window.sessionStorage.removeItem('flat-reality-workspace-entra-pending');
            window.localStorage.removeItem('flat-reality-workspace-entra-pending');
            await signOutEntra().catch(() => undefined);
            if (isMounted) setLoginError(error instanceof Error ? error.message : 'Microsoft sign-in could not be completed.');
          }
        }

        const state = await loadWorkspaceState();
        if (!isMounted) return;
        applyLoadedState(state);
        setSaveStatus(isSupabaseConfigured ? 'Sign in to connect database' : 'Saved locally in this browser');
      } catch {
        clearSession();
        if (isMounted) setSaveStatus('Using local workspace data');
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    }

    void initialize();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const state: WorkspaceState = { members, levels, rewards, guidePages, workRecords, scheduleShifts, scheduleCompletions, fileProjects };
    const sessionToken = getStoredSession()?.token;
    if (isSupabaseConfigured && !sessionToken) {
      setSaveStatus('Sign in to connect database');
      return;
    }

    saveWorkspaceState(state, sessionToken)
      .then(() => setSaveStatus(isSupabaseConfigured ? 'Saved to database' : 'Saved locally in this browser'))
      .catch(() => setSaveStatus('Could not save to database. Local copy is still saved.'));
  }, [members, levels, rewards, guidePages, workRecords, scheduleShifts, scheduleCompletions, fileProjects, isLoaded]);

  const currentMember = members.find((member) => member.id === currentMemberId) ?? null;

  async function refreshUpwork(memberId = currentMemberId ?? '', force = false) {
    const token = getStoredSession()?.token;
    if (!token || !memberId || !isSupabaseConfigured) return;
    try {
      const snapshot = await getUpworkSnapshot(token, memberId, force);
      if (memberId === currentMemberId) setUpworkSnapshot(snapshot);
      setUpworkStatus(snapshot.message);
    } catch (error) {
      setUpworkStatus(error instanceof Error ? error.message : 'Upwork data could not be loaded.');
    }
  }

  useEffect(() => {
    if (!isLoaded || !currentMemberId) {
      setUpworkSnapshot(EMPTY_UPWORK_SNAPSHOT);
      return;
    }
    void refreshUpwork(currentMemberId);
  }, [isLoaded, currentMemberId]);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.token || !currentMemberId || !currentMember?.entraEmail) {
      setEntraAvatarUrl('');
      return;
    }
    let active = true;
    getEntraAvatar(session.token, currentMemberId)
      .then((url) => { if (active) setEntraAvatarUrl(url); })
      .catch(() => { if (active) setEntraAvatarUrl(''); });
    return () => { active = false; };
  }, [currentMemberId, currentMember?.entraEmail]);

  useEffect(() => {
    if (!isLoaded || !currentMemberId) return;
    const url = new URL(window.location.href);
    const connected = url.searchParams.get('upwork') === 'connected';
    const upworkError = url.searchParams.get('upwork_error');
    if (!connected && !upworkError) return;
    if (connected) {
      setUpworkStatus('Upwork connected successfully.');
      void refreshUpwork(currentMemberId, true);
    } else if (upworkError) {
      setUpworkStatus(upworkError);
    }
    url.searchParams.delete('upwork');
    url.searchParams.delete('upwork_error');
    window.history.replaceState({}, '', url.toString());
  }, [isLoaded, currentMemberId]);
  const currentLevel = currentMember ? getCurrentLevel(levels, currentMember.xp) : levels[0];
  const nextLevel = currentMember ? getNextLevel(levels, currentMember.xp) : null;
  const nextRewards = nextLevel ? rewards.filter((reward) => reward.levelId === nextLevel.id) : [];
  const previousXp = currentLevel?.xpRequired ?? 0;
  const nextXp = nextLevel?.xpRequired ?? Math.max(currentMember?.xp ?? 1, 1);
  const progress = currentMember ? Math.min(100, Math.round(((currentMember.xp - previousXp) / Math.max(nextXp - previousXp, 1)) * 100)) : 0;

  const navItems: Array<[View, LucideIcon, string]> =
    currentMember?.status === 'suspended'
      ? [
          ['dashboard', LayoutDashboard, 'Home'],
        ]
      : [
          ['dashboard', LayoutDashboard, 'Home'],
          ...(currentMember?.scheduleEnabled ? ([['schedule', CalendarDays, 'Schedule β']] as Array<[View, LucideIcon, string]>) : []),
          ['guides', BookOpen, 'Guide'],
          ['levelup', Trophy, 'LevelUp!'],
        ];

  if (currentMember?.isAdmin && currentMember.status !== 'suspended') navItems.push(['admin', UsersRound, 'Admin']);

  const mobileNavItems = [...navItems];
  const mobileAdminIndex = mobileNavItems.findIndex(([key]) => key === 'admin');
  mobileNavItems.splice(mobileAdminIndex === -1 ? mobileNavItems.length : mobileAdminIndex, 0, ['profile', UserRound, 'Profile']);

  function updateMembers(nextMembers: WorkspaceMember[], nextRecords = workRecords) {
    const reconciled = reconcileWorkspace(nextMembers, nextRecords);
    setMembers(reconciled.members);
    setWorkRecords(reconciled.records);
  }

  function updateWorkRecords(nextRecords: SetStateAction<WorkRecord[]>) {
    const records = typeof nextRecords === 'function' ? nextRecords(workRecords) : nextRecords;
    updateMembers(members, records);
  }

  async function login() {
    if (isSupabaseConfigured) {
      try {
        const response = await loginWorkspace(employmentId, password);
        const reconciled = reconcileWorkspace(response.state.members, response.state.workRecords);
        const member = reconciled.members.find((item) => item.id === response.session.memberId);
        if (!member) throw new Error('Session member was not returned.');
        setMembers(reconciled.members);
        setLevels(response.state.levels.length ? response.state.levels : defaultWorkspaceState.levels);
        setRewards(response.state.rewards);
        setGuidePages(response.state.guidePages);
        setWorkRecords(reconciled.records);
        setScheduleShifts(response.state.scheduleShifts);
        setScheduleCompletions(response.state.scheduleCompletions);
        setFileProjects(response.state.fileProjects);
        setCurrentMemberId(member.id);
        saveSession(member.id, response.session.token, response.session.expiresAt, response.session.authMethod);
        setLoginIntroName(displayName(member));
        window.setTimeout(() => setLoginIntroName(''), 1150);
        setView('dashboard');
        setLoginError('');
        setPassword('');
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : 'Employment ID or password is incorrect.');
      }
      return;
    }

    const rawMember = members.find((item) => item.employmentId.toLowerCase() === employmentId.trim().toLowerCase());
    const member = rawMember ? normalizeMemberRuntime(rawMember) : null;
    if (!member) {
      setLoginError('Employment ID was not found.');
      return;
    }
    if (!member.passwordHash) {
      setLoginError('Password is not set. Use recovery options to create one.');
      return;
    }
    const passwordCheck = await verifyPassword(password, member.passwordHash);
    if (!passwordCheck.ok) {
      setLoginError('Employment ID or password is incorrect.');
      return;
    }
    if (rawMember && (rawMember.status !== member.status || passwordCheck.needsUpgrade)) {
      const upgradedMember = passwordCheck.needsUpgrade ? { ...member, passwordHash: await hashPassword(password) } : member;
      updateMembers(members.map((item) => (item.id === member.id ? upgradedMember : item)));
    }
    setCurrentMemberId(member.id);
    saveSession(member.id);
    setLoginIntroName(displayName(member));
    window.setTimeout(() => setLoginIntroName(''), 1150);
    setView('dashboard');
    setLoginError('');
    setPassword('');
  }

  async function loginWithEntra() {
    setLoginError('');
    setIsEntraLoginPending(true);
    try {
      await startEntraLogin();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Microsoft sign-in could not be started.');
      setIsEntraLoginPending(false);
    }
  }

  async function finishEntraSetup() {
    const token = getStoredSession()?.token;
    if (!token || !entraSetupMemberId) return;
    setIsCompletingEntraSetup(true);
    try {
      const state = await completeEntraSetup(token, entraPreferredName);
      applyLoadedState(state, entraSetupMemberId);
      setEntraSetupStage('complete');
      window.setTimeout(() => {
        setEntraSetupStage(null);
        setEntraSetupMemberId(null);
      }, 650);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Account linking could not be completed.');
    } finally {
      setIsCompletingEntraSetup(false);
    }
  }

  function updateCurrentMember(changes: Partial<WorkspaceMember>) {
    if (!currentMember) return;
    updateMembers(members.map((member) => (member.id === currentMember.id ? { ...member, ...changes } : member)));
  }

  async function impersonateMember(memberId: string) {
    if (isSupabaseConfigured) {
      const token = getStoredSession()?.token;
      if (!token) return;
      try {
        const response = await impersonateWorkspaceMember(token, memberId);
        const reconciled = reconcileWorkspace(response.state.members, response.state.workRecords);
        const member = reconciled.members.find((item) => item.id === response.session.memberId);
        if (!member) return;
        setMembers(reconciled.members);
        setLevels(response.state.levels.length ? response.state.levels : defaultWorkspaceState.levels);
        setRewards(response.state.rewards);
        setGuidePages(response.state.guidePages);
        setWorkRecords(reconciled.records);
        setScheduleShifts(response.state.scheduleShifts);
        setScheduleCompletions(response.state.scheduleCompletions);
        setFileProjects(response.state.fileProjects);
        setCurrentMemberId(member.id);
        saveSession(member.id, response.session.token, response.session.expiresAt, response.session.authMethod);
        setView('dashboard');
      } catch {
        setSaveStatus('Could not sign in as this user.');
      }
      return;
    }

    setCurrentMemberId(memberId);
    saveSession(memberId);
    setView('dashboard');
  }

  async function resetMemberPassword(memberId: string) {
    const token = getStoredSession()?.token;
    if (isSupabaseConfigured && token) {
      await resetWorkspacePassword(token, memberId);
      return;
    }
    updateMembers(members.map((member) => (member.id === memberId ? { ...member, passwordHash: '' } : member)));
  }

  async function signOut() {
    clearSession();
    setCurrentMemberId(null);
    setShowLegacyLogin(false);
    await signOutEntra().catch(() => undefined);
  }

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-mist px-5 py-8 text-ink">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl place-items-center">
          <div className="grid justify-items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-white shadow-soft">
              <img className="h-7 w-7" src={BRAND_ICON} alt="" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Flat Reality Entertainment Group</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-normal text-ink">Loading Workspace</h1>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!currentMember && hasRememberedEntra && !showLegacyLogin) {
    return (
      <main className="min-h-screen bg-mist px-5 py-8 text-ink">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-md place-items-center">
          <section className="login-card grid w-full justify-items-center gap-5 rounded-xl border border-line bg-paper p-6 text-center shadow-soft">
            <div className="h-44 w-44 overflow-hidden">
              <DotLottieReact src={ENTRA_SCAN_ANIMATION} autoplay loop />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#1686c8]">Microsoft Entra ID</p>
              <h1 className="mt-2 text-3xl font-semibold">Welcome back</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-600">This browser remembers that you use your Flat Reality identity.</p>
            </div>
            {loginError && <p className="text-sm text-red-600">{loginError}</p>}
            <button
              className="entra-gradient-button inline-flex h-12 w-full items-center justify-center gap-3 rounded-lg px-4 font-semibold text-white disabled:cursor-wait disabled:opacity-70"
              type="button"
              disabled={isEntraLoginPending}
              onClick={() => void loginWithEntra()}
            >
              <img className="h-5 w-5 brightness-0 invert" src={ENTRA_ICON} alt="" />
              {isEntraLoginPending ? 'Opening Microsoft...' : 'Log In again with Entra ID'}
            </button>
            <button className="text-xs font-medium text-zinc-500 hover:text-ink" type="button" onClick={() => setShowLegacyLogin(true)}>
              Legacy log in with eID
            </button>
          </section>
        </div>
      </main>
    );
  }

  if (!currentMember) {
    return (
      <main className="min-h-screen bg-mist px-5 py-8 text-ink">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl content-center gap-8">
          <div className="login-brand grid gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-white">
              <img className="h-7 w-7" src={BRAND_ICON} alt="" />
            </div>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Flat Reality Entertainment Group</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-normal text-ink md:text-6xl">Workspace</h1>
            </div>
          </div>

          <form
            className="login-card grid gap-4 rounded-xl border border-line bg-paper p-5 shadow-soft md:max-w-md"
            autoComplete="on"
            onSubmit={(event) => {
              event.preventDefault();
              void login();
            }}
          >
            <div>
              <p className="text-sm font-semibold text-ink">Legacy Sign In</p>
              <p className="mt-1 text-xs text-zinc-500">Use your Employment ID and Workspace password.</p>
            </div>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-600">Employment ID</span>
              <input
                className="h-12 rounded-lg border border-line px-4 text-base outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
                name="username"
                autoComplete="username"
                value={employmentId}
                onChange={(event) => setEmploymentId(event.target.value)}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-600">Password</span>
              <input
                className="h-12 rounded-lg border border-line px-4 text-base outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {loginError && <p className="text-sm text-red-600">{loginError}</p>}
            <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-ink px-4 font-medium text-white transition hover:bg-zinc-700" type="submit">
              <BadgeCheck size={18} />
              Open Workspace
            </button>
            <button className="justify-self-start text-sm font-medium text-forest" type="button" onClick={() => setIsRecoveryOpen(true)}>
              Trouble signing in?
            </button>
            <div className="flex items-center gap-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">
              <span className="h-px flex-1 bg-line" />
              Or
              <span className="h-px flex-1 bg-line" />
            </div>
            <button
              className="inline-flex h-12 items-center justify-center gap-3 rounded-lg bg-[#0067b8] px-4 font-medium text-white transition hover:bg-[#005a9e] disabled:cursor-wait disabled:opacity-70"
              type="button"
              disabled={isEntraLoginPending}
              onClick={() => void loginWithEntra()}
            >
              <img className="h-5 w-5 brightness-0 invert" src={ENTRA_ICON} alt="" />
              {isEntraLoginPending ? 'Opening Microsoft...' : 'Log In with Entra ID'}
            </button>
          </form>
        </div>
        {isRecoveryOpen && (
          <RecoveryWizard
            members={members}
            updateMembers={updateMembers}
            onClose={() => setIsRecoveryOpen(false)}
          />
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-mist pb-24 text-ink lg:pb-0">
      {loginIntroName && (
        <div className="login-intro fixed inset-0 z-[60] grid place-items-center bg-mist">
          <h1 className="px-6 text-center text-4xl font-semibold text-ink md:text-6xl">Welcome back, {loginIntroName}</h1>
        </div>
      )}
      {entraSetupStage && currentMember && (
        <div className={`entra-setup-overlay fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-mist px-4 py-8 ${entraSetupStage === 'complete' ? 'is-complete' : ''}`}>
          {entraSetupStage === 'welcome' && (
            <div className="entra-welcome-sequence px-6 text-center">
              <h1 className="entra-welcome-title entra-welcome-title-base text-4xl font-semibold md:text-6xl">Welcome back, {displayName(currentMember)}.</h1>
              <h1 aria-hidden="true" className="entra-welcome-title entra-welcome-title-gradient text-4xl font-semibold md:text-6xl">Welcome back, {displayName(currentMember)}.</h1>
            </div>
          )}
          {entraSetupStage === 'identity' && (
            <div className="entra-identity-loader grid justify-items-center">
              <img className="entra-icon-pulse h-28 w-28" src={ENTRA_ICON} alt="Microsoft Entra ID" />
            </div>
          )}
          {entraSetupStage === 'orbit' && (
            <div className="entra-orbit-scene" aria-label="Инициализация Workspace">
              <div className="entra-orbit-system">
                <div className="entra-orbit-track">
                  {[
                    { label: 'RAIN HEART', icon: publicAsset('resources/icons/rain-heart.png'), angle: '0deg', counterAngle: '0deg' },
                    { label: 'Partners', icon: publicAsset('resources/icons/partners.png'), angle: '90deg', counterAngle: '-90deg' },
                    { label: 'The Nick', icon: publicAsset('resources/icons/the-nick.png'), angle: '180deg', counterAngle: '-180deg' },
                    { label: 'Workspace', icon: BRAND_ICON, angle: '270deg', counterAngle: '-270deg' },
                  ].map((project) => (
                    <span key={project.label} className="entra-orbit-node" style={{ '--orbit-angle': project.angle, '--counter-angle': project.counterAngle } as CSSProperties}>
                      <span className="entra-orbit-bubble"><img src={project.icon} alt={project.label} /></span>
                    </span>
                  ))}
                </div>
                <img className="entra-icon-pulse entra-orbit-center" src={ENTRA_ICON} alt="Microsoft Entra ID" />
              </div>
              <p className="entra-initializing-label">Инициализация...</p>
            </div>
          )}
          {entraSetupStage === 'setup' && (
            <section className="entra-setup-card grid w-full max-w-lg gap-5 rounded-xl border border-[#71c9ee]/40 bg-paper p-6 shadow-soft">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1686c8]/10">
                  <img className="h-8 w-8" src={ENTRA_ICON} alt="" />
                </span>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#1686c8]">Microsoft Entra ID</p>
                  <h1 className="mt-1 text-3xl font-semibold">Finish your setup</h1>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">Confirm the Workspace profile that will be linked to your organization identity.</p>
                </div>
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-600">Preferred Name <span className="font-normal text-zinc-400">(optional)</span></span>
                <input className="h-12 rounded-lg border border-line bg-paper px-4 outline-none transition focus:border-[#1686c8] focus:ring-4 focus:ring-[#1686c8]/10" value={entraPreferredName} onChange={(event) => setEntraPreferredName(event.target.value)} />
              </label>
              <Field label="Full Name" value={currentMember.fullName} disabled onChange={() => undefined} />
              <Field label="Entra ID Email" value={currentMember.entraEmail} disabled onChange={() => undefined} />
              {loginError && <p className="text-sm text-red-600">{loginError}</p>}
              <button className="entra-gradient-button inline-flex h-12 items-center justify-center gap-3 rounded-lg px-4 font-semibold text-white disabled:cursor-wait disabled:opacity-70" type="button" disabled={isCompletingEntraSetup} onClick={() => void finishEntraSetup()}>
                <img className="h-5 w-5 brightness-0 invert" src={ENTRA_ICON} alt="" />
                {isCompletingEntraSetup ? 'Linking...' : 'Link your accounts'}
              </button>
            </section>
          )}
          {entraSetupStage === 'complete' && (
            <div className="entra-link-complete grid justify-items-center gap-4 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1686c8] text-white"><Check size={38} strokeWidth={3} /></span>
              <h2 className="text-2xl font-semibold">Identity linked</h2>
            </div>
          )}
        </div>
      )}
      <div className={`workspace-shell mx-auto grid gap-6 transition-all duration-500 ${adminFocusMode ? 'max-w-none px-0 py-0 lg:grid-cols-[0_minmax(0,1fr)]' : 'max-w-7xl px-4 py-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-6'}`}>
        <aside className={`workspace-sidebar hidden rounded-xl border border-line bg-paper p-4 shadow-soft transition-all duration-500 lg:sticky lg:top-5 lg:block lg:h-[calc(100vh-2.5rem)] ${adminFocusMode ? 'pointer-events-none -translate-x-8 overflow-hidden opacity-0' : 'opacity-100'}`}>
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-white">
              <img className="h-6 w-6" src={BRAND_ICON} alt="" />
            </div>
            <div>
              <p className="font-semibold">Flat Reality</p>
              <p className="text-sm text-zinc-500">Workspace</p>
            </div>
          </div>

          <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {navItems.map(([key, Icon, label]) => (
              <button
                key={key}
                className={`flex h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition ${
                  view === key ? 'bg-mist text-ink' : 'text-zinc-600 hover:bg-mist'
                }`}
                onClick={() => setView(key)}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>

          <button className="mt-6 flex w-full items-center gap-3 rounded-lg border border-line bg-mist p-3 text-left transition hover:border-forest/35 hover:bg-forest/5" onClick={() => setProfileMenuOpen((value) => !value)}>
            <ProfileAvatar src={entraAvatarUrl || upworkSnapshot.profile?.photoUrl || currentMember.githubAvatarUrl} name={displayName(currentMember)} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                {displayName(currentMember)}
                <VerifiedMark member={currentMember} size="sm" />
              </span>
              <span className="mt-1 block truncate text-xs text-zinc-500">{currentMember.employmentId}</span>
            </span>
            <ChevronDown size={16} className={`shrink-0 text-zinc-400 transition ${profileMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {profileMenuOpen && (
            <div className="profile-quick-menu mt-2 grid gap-1 rounded-lg border border-line bg-paper p-2 shadow-soft">
              {([['profile', UserRound], ['contact', Contact], ['payments', WalletCards], ['skills', Sparkles], ['integrations', Link2]] as Array<[ProfileTab, LucideIcon]>).map(([key, Icon]) => (
                <button key={key} className="flex h-9 items-center gap-3 rounded-md px-3 text-left text-sm font-medium capitalize text-zinc-600 hover:bg-mist" onClick={() => { setProfileTab(key); setProfileMenuOpen(false); setView('profile'); }}><Icon size={16} />{key}</button>
              ))}
            </div>
          )}
          <p className="mt-2 px-1 text-xs text-zinc-500">{saveStatus}</p>

          <button className="mt-4 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-600 hover:bg-mist" onClick={signOut}>
            <LogOut size={17} />
            Sign out
          </button>
        </aside>

        <div className="workspace-content grid min-w-0 gap-6 transition-all duration-500">
          {view === 'dashboard' && currentMember.upworkRequired && !upworkSnapshot.connected ? (
            <UpworkRequiredGate member={currentMember} />
          ) : view === 'dashboard' && (
            <Dashboard
              member={currentMember}
              currentLevel={currentLevel}
              nextLevel={nextLevel}
              nextRewards={nextRewards}
              progress={progress}
              jumpLinks={jumpLinks}
              workRecords={workRecords}
              upwork={upworkSnapshot}
              setView={setView}
              openProfileSkills={() => {
                setProfileTab('skills');
                setView('profile');
              }}
            />
          )}
          {view === 'profile' && <Profile member={currentMember} avatarUrl={entraAvatarUrl || upworkSnapshot.profile?.photoUrl || currentMember.githubAvatarUrl || ''} records={workRecords.filter((record) => record.memberId === currentMember.id)} upwork={upworkSnapshot} upworkStatus={upworkStatus} refreshUpwork={() => void refreshUpwork(currentMember.id, true)} updateCurrentMember={updateCurrentMember} onLogout={signOut} setView={setView} tab={profileTab} setTab={setProfileTab} />}
          {view === 'levelup' && <LevelUp member={currentMember} levels={levels} rewards={rewards} />}
          {view === 'careerGrowth' && <CareerGrowth member={currentMember} />}
          {view === 'schedule' && currentMember.scheduleEnabled && (
            <Schedule
              member={currentMember}
              shifts={scheduleShifts.filter((shift) => shift.memberId === currentMember.id)}
              completions={scheduleCompletions.filter((completion) => completion.memberId === currentMember.id)}
              setScheduleShifts={setScheduleShifts}
              setScheduleCompletions={setScheduleCompletions}
              upwork={upworkSnapshot}
            />
          )}
          {view === 'workRecords' && <WorkRecordsPage member={currentMember} records={workRecords.filter((record) => record.memberId === currentMember.id)} setWorkRecords={updateWorkRecords} />}
          {view === 'signedDocuments' && <SignedDocuments member={currentMember} />}
          {view === 'files' && <FilesPage member={currentMember} fileProjects={fileProjects} setFileProjects={setFileProjects} />}
          {view === 'benefits' && <Placeholder title="Benefits" text="We are working on integrating this feature into Workspace!" />}
          {view === 'installs' && <InstallsPage member={currentMember} />}
          {view === 'guides' && <Guides pages={guidePages} />}
          {view === 'admin' && currentMember.isAdmin && (
            <Admin
              members={members}
              levels={levels}
              rewards={rewards}
              guidePages={guidePages}
              workRecords={workRecords}
              setMembers={(next) => updateMembers(typeof next === 'function' ? next(members) : next)}
              setLevels={setLevels}
              setRewards={setRewards}
              setGuidePages={setGuidePages}
              setWorkRecords={updateWorkRecords}
              updateWorkspace={updateMembers}
              impersonateMember={impersonateMember}
              resetMemberPassword={resetMemberPassword}
              onFocusModeChange={setAdminFocusMode}
            />
          )}
        </div>
      </div>
      <nav className="mobile-tabbar fixed inset-x-0 bottom-0 z-40 grid grid-flow-col auto-cols-fr gap-1 rounded-t-[24px] border-x-0 border-b-0 border-t border-line bg-paper/95 px-2 pt-2 shadow-soft backdrop-blur lg:hidden">
        {mobileNavItems.map(([key, Icon, label]) => (
          <button
            key={key}
            className={`grid min-h-[58px] place-items-center gap-1 rounded-[18px] px-2 text-[11px] font-medium transition ${
              view === key ? 'text-forest' : 'text-zinc-600'
            }`}
            onClick={() => setView(key)}
          >
            <Icon size={18} />
            <span>{key === 'schedule' ? 'Schedule' : label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

function RecoveryWizard({ members, updateMembers, onClose }: { members: WorkspaceMember[]; updateMembers: WorkspaceUpdate; onClose: () => void }) {
  const [employmentId, setEmploymentId] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  async function checkRecoveryOptions() {
    if (isSupabaseConfigured) {
      try {
        await checkRecoveryOptionsServer(employmentId);
        setError('');
        setMemberId('__server__');
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Recovery wizard cannot be used with these details. Contact your manager for manual recovery.');
        setMemberId(null);
      }
      return;
    }

    const member = members.find((item) => item.employmentId.toLowerCase() === employmentId.trim().toLowerCase());
    if (!member || member.passwordHash) {
      setError('Recovery wizard cannot be used with these details. Contact your manager for manual recovery.');
      setMemberId(null);
      return;
    }
    setError('');
    setMemberId(member.id);
  }

  async function saveNewPassword() {
    if (newPassword.length < 10) {
      setError('Password must contain at least 10 characters.');
      return;
    }
    if (isSupabaseConfigured) {
      try {
        await recoverWorkspacePassword(employmentId, newPassword);
        onClose();
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Recovery wizard cannot be used with these details. Contact your manager for manual recovery.');
      }
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    updateMembers(members.map((member) => (member.id === memberId ? { ...member, passwordHash } : member)));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/35 p-3 sm:place-items-center">
      <div className="w-full max-w-md rounded-xl border border-line bg-paper p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Recovery Wizard</p>
            <h2 className="mt-2 text-2xl font-semibold">{memberId ? 'Create new password' : 'Trouble signing in?'}</h2>
          </div>
          <button className="text-sm font-medium text-zinc-500" onClick={onClose}>Close</button>
        </div>

        {!memberId ? (
          <form
            className="mt-5 grid gap-4"
            autoComplete="on"
            onSubmit={(event) => {
              event.preventDefault();
              void checkRecoveryOptions();
            }}
          >
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-600">Employment ID</span>
              <input
                className="h-12 rounded-lg border border-line px-4 text-base outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
                name="username"
                autoComplete="username"
                value={employmentId}
                onChange={(event) => setEmploymentId(event.target.value)}
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="h-12 rounded-lg bg-ink px-4 font-medium text-white" type="submit">
              Check recovery options
            </button>
          </form>
        ) : (
          <form
            className="mt-5 grid gap-4"
            autoComplete="on"
            onSubmit={(event) => {
              event.preventDefault();
              void saveNewPassword();
            }}
          >
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-600">New Password</span>
              <input
                className="h-12 rounded-lg border border-line px-4 text-base outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="h-12 rounded-lg bg-forest px-4 font-medium text-white" type="submit">
              Save Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function hasOnboardingSkills(member: WorkspaceMember) {
  return Boolean(
    member.skills?.some((skill) => skill.trim())
    || member.software.split(',').some((software) => software.trim())
    || member.languages.split(',').some((language) => language.trim()),
  );
}

function onboardingChecklist(member: WorkspaceMember) {
  return [
    { id: 'entra', label: 'Microsoft Entra ID connected', done: Boolean(member.entraSetupCompleted) },
    { id: 'github', label: 'GitHub connected', done: Boolean(member.githubConnected) },
    { id: 'documents', label: 'NDA and GDPR signed', done: member.onboarding.ndaSigned && member.onboarding.gdprSigned },
    { id: 'skills', label: 'Skills, software or languages added', done: hasOnboardingSkills(member) },
  ];
}

function Dashboard({
  member,
  currentLevel,
  nextLevel,
  nextRewards,
  progress,
  jumpLinks,
  workRecords,
  upwork,
  setView,
  openProfileSkills,
}: {
  member: WorkspaceMember;
  currentLevel: Level;
  nextLevel: Level | null;
  nextRewards: Reward[];
  progress: number;
  jumpLinks: JumpLink[];
  workRecords: WorkRecord[];
  upwork: UpworkSnapshot;
  setView: (view: View) => void;
  openProfileSkills: () => void;
}) {
  const [isGitHubConnecting, setIsGitHubConnecting] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState('');
  const pendingUserRequest = workRecords.find((record) => record.memberId === member.id && record.type === 'explanation_request' && !record.explanationText);
  const unreadExplanationCount = member.isAdmin ? workRecords.filter((record) => record.type === 'explanation_request' && record.explanationText).length : 0;
  const isSuspended = member.status === 'suspended';
  const suspendedJumpLinks: JumpLink[] = [
    { id: 'suspended-signed-documents', title: 'Signed Documents', icon: 'FileCheck2', url: '#signed-documents', order: 1, internalView: 'signedDocuments' },
    { ...(jumpLinks.find((link) => link.title === 'Contact Head Office') ?? { id: 'jump-contact-head-office', title: 'Contact Head Office', icon: 'Building2', url: 'https://forms.office.com/r/LhHw6WFCgk', order: 2 }), order: 2 },
    { ...(jumpLinks.find((link) => link.internalView === 'workRecords') ?? { id: 'jump-work-records', title: 'Work Records', icon: 'ClipboardList', url: '#work-records', order: 3, internalView: 'workRecords' }), order: 3 },
  ];
  const baseJumpLinks = isSuspended ? suspendedJumpLinks : jumpLinks;
  const visibleJumpLinks = baseJumpLinks.filter((link) => {
    if (isIndependentPartner(member) && link.title === 'Social Benefits') return false;
    if (isUpworkContract(member) && link.title === 'Contact Head Office') return false;
    return true;
  });
  const onboardingSteps = onboardingChecklist(member);
  const completedOnboardingSteps = onboardingSteps.filter((step) => step.done).length;

  async function beginGitHubConnection() {
    const token = getStoredSession()?.token;
    if (!token) {
      setOnboardingMessage('Your Workspace session has expired. Please sign in again.');
      return;
    }
    setIsGitHubConnecting(true);
    setOnboardingMessage('');
    try {
      await connectGitHub(token);
    } catch (error) {
      setOnboardingMessage(error instanceof Error ? error.message : 'GitHub connection could not be started.');
      setIsGitHubConnecting(false);
    }
  }
  const inactiveStatus = member.status !== 'active' && member.status !== 'suspended'
    ? {
        sick_leave: {
          title: 'Get well soon!',
          body: `Your sick leave is scheduled until ${formatDate(member.statusUntil)}.`,
          icon: HeartPulse,
        },
        mental_health_days: {
          title: 'Focus on yourself!',
          body: `Your mental health days are scheduled until ${formatDate(member.statusUntil)}.`,
          icon: Brain,
        },
        paused: {
          title: 'Rest up!',
          body: `Your pause is scheduled until ${formatDate(member.statusUntil)}.`,
          icon: Umbrella,
        },
      }[member.status]
    : null;
  const InactiveStatusIcon = inactiveStatus?.icon;
  const activeUpworkContract = isUpworkContract(member) ? upwork.contracts.find((contract) => contract.status === 'Active' && contract.currentMilestone) : undefined;

  return (
    <>
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Flat Reality Entertainment Group</p>
        <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Welcome back, {displayName(member)}</h1>
      </section>

      {!isSuspended && isCoreTeam(member) && Boolean(member.entraEmail.trim()) && !member.entraSetupCompleted && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-soft">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-soft">
              <KeyRound size={24} />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-700">SSO Migration</p>
              <h2 className="mt-2 text-2xl font-semibold">Entra ID sign-in will soon be required</h2>
              <p className="mt-2 text-zinc-700">Your account is already linked to {member.entraEmail}. Sign out, then log in with Entra ID to finish connecting your identity.</p>
            </div>
          </div>
        </section>
      )}

      {isSuspended && (
        <section className="rounded-xl border border-red-700 bg-red-600 p-6 text-white shadow-soft">
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Ban size={24} />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Limited Access</p>
                <h2 className="mt-2 text-2xl font-semibold">Your account has been suspended</h2>
                <p className="mt-2 max-w-2xl text-white/85">You can still use limited Workspace features. All withheld funds will be transferred using the Supplier Form payout details available in your profile.</p>
              </div>
            </div>
            <div className="rounded-xl bg-white px-5 py-4 text-right text-red-700">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-500">Withheld Balance</p>
              <p className="mt-1 text-3xl font-semibold">{formatEuroAmount(member.withheldBalance)}</p>
            </div>
          </div>
        </section>
      )}

      {InactiveStatusIcon && inactiveStatus && (
        <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-forest/10 text-forest">
              <InactiveStatusIcon size={24} />
            </span>
            <div>
              <h2 className="text-2xl font-semibold">{inactiveStatus.title}</h2>
              <p className="mt-2 text-zinc-600">{inactiveStatus.body}</p>
            </div>
          </div>
        </section>
      )}

      {!isSuspended && !member.onboarding.completed && (
        <section className="onboarding-progress overflow-hidden rounded-xl border border-forest/20 p-5 shadow-soft sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-forest shadow-soft"><Sparkles size={22} /></span>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Onboarding Journey</p>
                  <h2 className="mt-1 text-2xl font-semibold">Complete onboarding</h2>
                  <p className="mt-1 text-sm text-zinc-600">{completedOnboardingSteps} of {onboardingSteps.length} steps completed. Earn 100 XP after confirmation.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                {onboardingSteps.map((step) => (
                  <div key={step.id} className="flex flex-col gap-3 rounded-lg border border-white/70 bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step.done ? 'bg-emerald-500 text-white' : 'border border-line bg-paper text-zinc-400'}`}>
                        {step.done ? <Check size={15} /> : <span className="h-2 w-2 rounded-full bg-current" />}
                      </span>
                      <span className={step.done ? 'font-medium' : 'text-zinc-600'}>{step.label}</span>
                    </div>
                    {step.id === 'github' && !step.done && (
                      <button type="button" disabled={isGitHubConnecting} onClick={() => void beginGitHubConnection()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60">
                        <Github size={18} /> {isGitHubConnecting ? 'Connecting...' : 'Connect GitHub'}
                      </button>
                    )}
                    {step.id === 'skills' && !step.done && (
                      <button type="button" onClick={openProfileSkills} className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-paper px-4 text-sm font-semibold transition hover:border-forest hover:text-forest">Add skills</button>
                    )}
                  </div>
                ))}
              </div>
              {onboardingMessage && <p className="mt-3 text-sm font-medium text-red-600">{onboardingMessage}</p>}
            </div>
          </div>
        </section>
      )}

      {!isSuspended && activeUpworkContract?.currentMilestone && (
        <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-forest/10 text-forest">
                <BriefcaseBusiness size={24} />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Your Current Goal</p>
                <h2 className="mt-2 text-2xl font-semibold">{activeUpworkContract.currentMilestone.description || activeUpworkContract.title}</h2>
                <p className="mt-2 text-sm text-zinc-500">{activeUpworkContract.title}</p>
              </div>
            </div>
            <p className="text-3xl font-semibold">{formatUpworkMoney(activeUpworkContract.currentMilestone.amount)}</p>
          </div>
        </section>
      )}

      {!isSuspended && pendingUserRequest && (
        <section className="rounded-xl border border-red-600 bg-red-600 p-6 text-white shadow-soft">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Action Required</p>
              <h2 className="mt-2 text-2xl font-semibold">Explanation requested</h2>
              <p className="mt-2 text-white/85">{pendingUserRequest.text}</p>
            </div>
            <button className="h-11 rounded-lg bg-white px-4 text-sm font-semibold text-red-600" onClick={() => setView('workRecords')}>
              Provide Explanation
            </button>
          </div>
        </section>
      )}

      {!isSuspended && unreadExplanationCount > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-soft">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-amber-700">
              <Bell size={22} />
            </span>
            <div>
              <h2 className="text-2xl font-semibold">Unread explanations</h2>
              <p className="mt-2 text-zinc-600">There are unread explanations. Check HR.</p>
            </div>
          </div>
        </section>
      )}

      {!isSuspended && <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-line bg-paper p-6 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-500">LevelUp! Program</p>
              <h2 className="mt-2 text-4xl font-semibold">{currentLevel.name}</h2>
            </div>
            <div className="rounded-lg bg-forest/10 px-3 py-2 text-sm font-semibold text-forest">{member.xp} XP</div>
          </div>
          <div className="mt-8">
            <div className="h-3 overflow-hidden rounded-full bg-mist">
              <div className="h-full rounded-full bg-forest" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-zinc-600">
              <span>{member.xp} / {nextLevel?.xpRequired ?? member.xp} XP</span>
              <span>{nextLevel ? `${nextLevel.xpRequired - member.xp} XP until ${nextLevel.name}` : 'Top level reached'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-paper p-6 shadow-soft">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-coral/10 text-coral">
            <Gift size={22} />
          </div>
          <p className="mt-5 text-sm font-medium text-zinc-500">Next Rewards</p>
          <h2 className="mt-2 text-2xl font-semibold">{nextLevel?.name ?? 'All rewards unlocked'}</h2>
          <div className="mt-3 grid gap-2 text-sm text-zinc-600">
            {nextRewards.length > 0 ? nextRewards.map((reward) => <p key={reward.id}>{reward.rewardName}</p>) : <p>No rewards configured for the next level.</p>}
          </div>
        </div>
      </section>}

      <Section title="Jump To">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...visibleJumpLinks].sort((a, b) => a.order - b.order).map((link) => {
            const Icon = iconMap[link.icon] ?? BookOpen;
            const content = (
              <>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mist text-zinc-700">
                  <Icon size={19} />
                </span>
                <span className="font-medium">{link.title}</span>
              </>
            );
            if (link.internalView) {
              return (
                <button key={link.id} className="flex min-h-20 items-center gap-4 rounded-xl border border-line bg-paper p-4 text-left shadow-soft transition hover:-translate-y-0.5" onClick={() => setView(link.internalView as View)}>
                  {content}
                </button>
              );
            }
            return (
              <a key={link.id} className="flex min-h-20 items-center gap-4 rounded-xl border border-line bg-paper p-4 shadow-soft transition hover:-translate-y-0.5" href={link.url} target={link.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                {content}
              </a>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function UpworkRequiredGate({ member }: { member: WorkspaceMember }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');

  async function beginConnection() {
    const token = getStoredSession()?.token;
    if (!token) return;
    setIsConnecting(true);
    setError('');
    try {
      await connectUpwork(token);
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : 'Upwork connection could not be started.');
      setIsConnecting(false);
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-2xl place-items-center rounded-xl border border-line bg-paper p-8 text-center shadow-soft sm:p-12">
      <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-black p-3"><img className="w-full brightness-0 invert" src={publicAsset('resources/logos/upworklogo.webp')} alt="Upwork" /></span>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-forest">Partners™ onboarding</p>
      <h1 className="mt-3 text-3xl font-semibold">Connect Upwork to continue</h1>
      <p className="mt-3 max-w-lg text-zinc-600">Upwork connection is required for {displayName(member)} before the Workspace Dashboard can be opened.</p>
      {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
      <button className="mt-7 inline-flex h-12 items-center justify-center gap-3 rounded-lg bg-black px-6 font-semibold text-white disabled:opacity-60" disabled={isConnecting} onClick={() => void beginConnection()}>
        <img className="h-5 w-auto brightness-0 invert" src={publicAsset('resources/logos/upworklogo.webp')} alt="" />
        {isConnecting ? 'Opening Upwork...' : 'Connect Upwork'}
      </button>
    </section>
  );
}

function memberStatusStyle(status: MemberStatus) {
  return ({
    active: { icon: Check, color: 'bg-emerald-500', label: 'Active' },
    suspended: { icon: Ban, color: 'bg-red-500', label: 'Suspended' },
    sick_leave: { icon: HeartPulse, color: 'bg-sky-500', label: 'Sick Leave' },
    mental_health_days: { icon: Brain, color: 'bg-violet-500', label: 'Mental Health' },
    paused: { icon: CirclePause, color: 'bg-amber-500', label: 'Paused' },
  } as const)[status];
}

function MemberHero({ member, avatarUrl, compact = false }: { member: WorkspaceMember; avatarUrl: string; compact?: boolean }) {
  const status = memberStatusStyle(member.status);
  const StatusIcon = status.icon;
  return (
    <section className={`member-hero rounded-xl border border-line bg-paper shadow-soft ${compact ? 'p-4 sm:p-5' : 'p-4 sm:p-8'}`}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative w-fit">
          <ProfileAvatar src={avatarUrl} name={displayName(member)} />
          <span className={`absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-4 border-paper text-white ${status.color}`} title={status.label}><StatusIcon size={14} strokeWidth={2.6} /></span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="flex min-w-0 items-center gap-2 text-3xl font-semibold sm:text-4xl"><span className="min-w-0 break-words">{displayName(member)}</span><VerifiedMark member={member} /></h1>
          <p className="mt-2 break-words text-sm text-zinc-600 sm:text-base">{[member.seniority, member.jobRole].filter(Boolean).join(' · ') || 'Role not assigned'} <span className="mx-2 text-zinc-300">•</span> {isCoreTeam(member) ? 'Core Team' : 'Independent Partner'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {member.benefitPrograms.map((project) => <span key={project} className="inline-flex h-9 items-center rounded-full border border-line bg-mist px-3 text-sm font-semibold">{projectLabel(project)}</span>)}
          </div>
        </div>
      </div>
    </section>
  );
}

function GaugeCard({ label, value, suffix = '%', colors = true, displayValue }: { label: string; value: number; suffix?: string; colors?: boolean; displayValue?: string }) {
  const safe = Math.min(100, Math.max(0, value));
  const color = !colors ? '#7F00FF' : safe >= 85 ? '#10b981' : safe >= 60 ? '#84cc16' : safe >= 50 ? '#eab308' : safe >= 35 ? '#f97316' : '#ef4444';
  return <div className="kpi-card grid min-h-48 place-items-center rounded-xl border border-line bg-paper p-5 text-center shadow-soft"><div><div className="kpi-gauge" style={{ '--gauge-value': `${safe * 3.6}deg`, '--gauge-color': color } as CSSProperties}><div><strong>{displayValue ?? `${Math.round(value)}${suffix}`}</strong></div></div><p className="mt-3 text-sm font-semibold text-zinc-600">{label}</p></div></div>;
}

function SkillsPanel({ member, editable = false, admin = false, updateMember }: { member: WorkspaceMember; editable?: boolean; admin?: boolean; updateMember?: (changes: Partial<WorkspaceMember>) => void }) {
  const verified = new Set(member.endorsedSkills ?? []);
  const skills = member.skills ?? [];
  const software = member.software.split(',').map((item) => item.trim()).filter(Boolean);
  const languages = member.languages.split(',').map((item) => item.trim()).filter(Boolean);
  const [drafts, setDrafts] = useState({ skills: '', software: '', languages: '' });

  function addItem(key: 'skills' | 'software' | 'languages', items: string[]) {
    const next = drafts[key].trim();
    if (!next || items.some((item) => item.toLowerCase() === next.toLowerCase()) || !updateMember) return;
    if (key === 'skills') updateMember({ skills: [...skills, next] });
    if (key === 'software') updateMember({ software: [...software, next].join(', ') });
    if (key === 'languages') updateMember({ languages: [...languages, next].join(', ') });
    setDrafts((current) => ({ ...current, [key]: '' }));
  }

  function toggleVerified(skill: string) {
    if (!admin || !updateMember) return;
    updateMember({ endorsedSkills: verified.has(skill) ? [...verified].filter((item) => item !== skill) : [...verified, skill] });
  }

  const groups = [
    { key: 'skills' as const, title: 'Skills', items: skills, placeholder: 'Add a skill' },
    { key: 'software' as const, title: 'Software Knowledge', items: software, placeholder: 'Add software' },
    { key: 'languages' as const, title: 'Languages', items: languages, placeholder: 'Add a language' },
  ];

  return (
    <section className="rounded-xl border border-line bg-paper p-5 shadow-soft sm:p-6">
      <div className="flex items-center gap-3"><Sparkles className="text-forest" size={20} /><h2 className="text-xl font-semibold">Skills</h2></div>
      <div className="mt-5 grid gap-6">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{group.title}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {group.items.map((item) => (
                <button type="button" key={item} disabled={!admin} onClick={() => toggleVerified(item)} className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${verified.has(item) ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-line bg-mist text-zinc-600'} ${admin ? 'cursor-pointer hover:border-sky-300' : 'cursor-default'}`}>
                  {verified.has(item) && <BadgeCheck size={15} />}{item}
                </button>
              ))}
              {!group.items.length && <span className="text-sm text-zinc-400">Nothing added yet</span>}
            </div>
            {editable && updateMember && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-sm outline-none focus:border-forest" value={drafts[group.key]} placeholder={group.placeholder} onChange={(event) => setDrafts((current) => ({ ...current, [group.key]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addItem(group.key, group.items); } }} />
                <button className="h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-white" onClick={() => addItem(group.key, group.items)}>Add</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectCards({ member }: { member: WorkspaceMember }) {
  const icons: Record<BenefitProgram, string> = { 'FR Partners': publicAsset('resources/icons/partners.png'), 'The Nick': publicAsset('resources/icons/the-nick.png'), 'RAIN HEART': publicAsset('resources/icons/rain-heart.png') };
  return <section className="rounded-xl border border-line bg-paper p-5 shadow-soft sm:p-6"><h2 className="text-xl font-semibold">Assigned Projects</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{member.benefitPrograms.map((project) => <div key={project} className="flex items-center gap-3 rounded-lg border border-line bg-mist p-3"><img className="h-10 w-10 object-contain" src={icons[project]} alt="" /><span className="font-semibold">{projectLabel(project)}</span></div>)}{!member.benefitPrograms.length && <p className="text-sm text-zinc-500">No projects assigned.</p>}</div></section>;
}

function Profile({ member, avatarUrl, records, upwork, upworkStatus, refreshUpwork, updateCurrentMember, onLogout, setView, tab, setTab }: { member: WorkspaceMember; avatarUrl: string; records: WorkRecord[]; upwork: UpworkSnapshot; upworkStatus: string; refreshUpwork: () => void; updateCurrentMember: (changes: Partial<WorkspaceMember>) => void; onLogout: () => void; setView: (view: View) => void; tab: ProfileTab; setTab: (tab: ProfileTab) => void }) {
  const [isUpworkBusy, setIsUpworkBusy] = useState(false);
  const [isManualUpworkOpen, setIsManualUpworkOpen] = useState(false);
  const [manualUpworkUrl, setManualUpworkUrl] = useState(member.upworkUrl);
  const [manualUpworkError, setManualUpworkError] = useState('');
  const [github, setGitHub] = useState<GitHubSnapshot>(EMPTY_GITHUB_SNAPSHOT);
  const [githubMessage, setGitHubMessage] = useState('');
  const [isGitHubBusy, setIsGitHubBusy] = useState(false);
  const [steam, setSteam] = useState<SteamSnapshot>(EMPTY_STEAM_SNAPSHOT);
  const [steamMessage, setSteamMessage] = useState('');
  const [isSteamBusy, setIsSteamBusy] = useState(false);
  const partner = isFrPartnersConnected(member);
  const index = calculatePartnerQualityIndex(member, upwork, openExplanationRequestCount(records, member.id));
  const health = Math.max(0, 3 - member.strikeSystem);
  const trackedHours = upwork.timeEntries.reduce((total, entry) => total + entry.hours, 0);
  async function beginUpworkConnection() { const token = getStoredSession()?.token; if (!token) return; setIsUpworkBusy(true); try { await connectUpwork(token); } catch (error) { window.alert(error instanceof Error ? error.message : 'Upwork connection could not be started.'); setIsUpworkBusy(false); } }
  async function removeUpworkConnection() { const token = getStoredSession()?.token; if (!token || !window.confirm('Disconnect Upwork from this Workspace profile?')) return; setIsUpworkBusy(true); try { await disconnectUpwork(token); refreshUpwork(); } finally { setIsUpworkBusy(false); } }
  function openManualUpwork() {
    setManualUpworkUrl(member.upworkUrl);
    setManualUpworkError('');
    setIsManualUpworkOpen(true);
  }
  function saveManualUpwork() {
    const value = manualUpworkUrl.trim();
    if (value && !isUpworkProfileUrl(value)) {
      setManualUpworkError('Enter a full Upwork profile URL, for example https://www.upwork.com/freelancers/~...');
      return;
    }
    updateCurrentMember({ upworkUrl: value });
    setIsManualUpworkOpen(false);
  }
  async function refreshGitHub() {
    const token = getStoredSession()?.token;
    if (!token || !isSupabaseConfigured) return;
    try {
      setGitHub(await getGitHubSnapshot(token));
      const message = new URL(window.location.href).searchParams.get('github_error');
      setGitHubMessage(message || '');
    } catch (error) {
      setGitHubMessage(error instanceof Error ? error.message : 'GitHub data could not be loaded.');
    }
  }
  useEffect(() => { void refreshGitHub(); }, [member.id]);
  async function refreshSteam() {
    const token = getStoredSession()?.token;
    if (!token || !isSupabaseConfigured) return;
    try {
      setSteam(await getSteamSnapshot(token));
      const url = new URL(window.location.href);
      setSteamMessage(url.searchParams.get('steam_error') || (url.searchParams.get('steam') === 'connected' ? 'Steam identity connected.' : ''));
    } catch (error) {
      setSteamMessage(error instanceof Error ? error.message : 'Steam connection could not be loaded.');
    }
  }
  useEffect(() => { void refreshSteam(); }, [member.id]);
  async function beginGitHubConnection() {
    const token = getStoredSession()?.token;
    if (!token) return;
    setIsGitHubBusy(true);
    try { await connectGitHub(token); } catch (error) { setGitHubMessage(error instanceof Error ? error.message : 'GitHub connection could not be started.'); setIsGitHubBusy(false); }
  }
  async function removeGitHubConnection() {
    const token = getStoredSession()?.token;
    if (!token || !window.confirm('Disconnect GitHub from this Workspace profile?')) return;
    setIsGitHubBusy(true);
    try { await disconnectGitHub(token); setGitHub(EMPTY_GITHUB_SNAPSHOT); setGitHubMessage('GitHub disconnected.'); } catch (error) { setGitHubMessage(error instanceof Error ? error.message : 'GitHub could not be disconnected.'); } finally { setIsGitHubBusy(false); }
  }
  async function beginSteamConnection() {
    const token = getStoredSession()?.token;
    if (!token) return;
    setIsSteamBusy(true);
    setSteamMessage('');
    try { await connectSteam(token); } catch (error) { setSteamMessage(error instanceof Error ? error.message : 'Steam connection could not be started.'); setIsSteamBusy(false); }
  }
  async function removeSteamConnection() {
    const token = getStoredSession()?.token;
    if (!token || !window.confirm('Disconnect Steam from this Workspace profile?')) return;
    setIsSteamBusy(true);
    try { await disconnectSteam(token); setSteam(EMPTY_STEAM_SNAPSHOT); setSteamMessage('Steam disconnected.'); } catch (error) { setSteamMessage(error instanceof Error ? error.message : 'Steam could not be disconnected.'); } finally { setIsSteamBusy(false); }
  }
  const tabs: Array<[ProfileTab, LucideIcon, string]> = [['profile', UserRound, 'Profile'], ['contact', Contact, 'Contact'], ['payments', WalletCards, 'Payments'], ['skills', Sparkles, 'Skills'], ['integrations', Link2, 'Integrations']];
  return <div className="profile-viva grid gap-5 pb-8">
    <MemberHero member={member} avatarUrl={avatarUrl} />
    <nav className="profile-tabs flex gap-1 overflow-x-auto rounded-xl border border-line bg-paper p-2 shadow-soft">{tabs.map(([key, Icon, label]) => <button key={key} className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${tab === key ? 'bg-mist text-forest' : 'text-zinc-600 hover:bg-mist'}`} onClick={() => setTab(key)}><Icon size={17} />{label}</button>)}</nav>
    {tab === 'profile' && <div className="grid gap-5"><div className={`grid gap-4 ${partner ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>{partner && <GaugeCard label="Partner Index" value={index} />}<GaugeCard label="Account Health" value={health * 33.33} displayValue={`${health}/3`} /><div className="kpi-card rounded-xl border border-line bg-paper p-5 shadow-soft"><Timer className="text-forest" size={24} /><p className="mt-8 text-4xl font-semibold">{formatPlannerTime(trackedHours)}</p><p className="mt-2 text-sm font-semibold text-zinc-600">Tracked Work Time</p></div></div><VerificationCard member={member} />{member.entraEmail && <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-800"><img className="h-8 w-8" src={ENTRA_ICON} alt="" /><span className="font-semibold">Microsoft Entra ID is linked to this identity.</span></div>}<ProjectCards member={member} /><SkillsPanel member={member} /></div>}
    {tab === 'contact' && <div className="grid gap-5"><section className="grid gap-4 rounded-xl border border-line bg-paper p-6 shadow-soft md:grid-cols-2"><Field label="Employment ID" value={member.employmentId} disabled onChange={() => undefined} /><Field label="Full Name" value={member.fullName} disabled onChange={() => undefined} /><Field label="Preferred Name" value={member.preferredName} onChange={(value) => updateCurrentMember({ preferredName: value })} /><Field label="Entra ID Email" value={member.entraEmail} disabled onChange={() => undefined} /><Field label="Personal Email" value={member.personalEmail} disabled onChange={() => undefined} /><Field label="Phone Number" value={member.phoneNumber} onChange={(value) => updateCurrentMember({ phoneNumber: value })} /><Field label="Slack Tag" value={member.slackTag ?? ''} disabled onChange={() => undefined} /><Field label="Time Zone" value={member.timeZone} onChange={(value) => updateCurrentMember({ timeZone: value })} /><Field label="Portfolio" value={member.portfolio} onChange={(value) => updateCurrentMember({ portfolio: value })} /></section><a className="flex items-center justify-between rounded-xl border border-line bg-paper p-5 shadow-soft" href="https://join.slack.com/t/flatrealityeu/shared_invite/zt-3eeknccsz-MWbN2vlNbRNwu3blGs11kw" target="_blank" rel="noreferrer"><span><span className="block font-semibold">Need to change something else?</span><span className="mt-1 block text-sm text-zinc-500">Contact your manager via Slack.</span></span><span className="rounded-lg bg-[#4A154B] px-4 py-2 text-sm font-semibold text-white">Open Slack</span></a></div>}
    {tab === 'payments' && <div className="grid gap-5"><section className="flex items-center justify-between rounded-xl border border-line bg-paper p-6 shadow-soft"><div><p className="text-sm font-semibold text-zinc-500">Withheld Balance</p><p className="mt-2 text-sm text-zinc-500">Workspace reconciliation balance</p></div><strong className="text-4xl">{formatEuroAmount(member.withheldBalance)}</strong></section><section className="rounded-xl border border-line bg-paper p-6 shadow-soft"><h2 className="text-xl font-semibold">SupplierForm</h2><p className="mt-2 text-zinc-600">Update your payout and supplier information securely.</p><a className="mt-5 inline-flex h-11 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-white" href={isUpworkContract(member) ? 'https://www.upwork.com/nx/payments/disbursement-methods' : 'https://forms.office.com/r/maSdSX94Ui'} target="_blank" rel="noreferrer">{isUpworkContract(member) ? 'Open Upwork Payments' : 'Open Supplier Form'}</a></section></div>}
    {tab === 'skills' && <SkillsPanel member={member} editable updateMember={updateCurrentMember} />}
    {tab === 'integrations' && <div className="grid gap-4"><section className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-paper p-5 shadow-soft sm:flex-row sm:items-center"><div className="flex items-center gap-4"><img className="h-11 w-11" src={ENTRA_ICON} alt="" /><div><h2 className="font-semibold">Microsoft Entra ID</h2><p className="mt-1 text-sm text-zinc-500">{member.entraEmail || 'Not connected'}</p></div></div>{member.entraEmail && <a className="rounded-lg bg-[#1686c8] px-4 py-2 text-sm font-semibold text-white" href="https://mysignins.microsoft.com/security-info" target="_blank" rel="noreferrer">SSO Settings</a>}</section>{(isIndependentPartner(member) || partner) && <section className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-paper p-5 shadow-soft sm:flex-row sm:items-center"><div><h2 className="font-semibold">Upwork</h2><p className="mt-1 text-sm text-zinc-500">{!upwork.connected && isUpworkProfileUrl(member.upworkUrl) ? 'Manual Upwork profile linked.' : upworkStatus || upwork.message || 'Synchronize partner contracts and payments.'}</p></div><div className="flex flex-wrap gap-2">{upwork.connected ? <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold" disabled={isUpworkBusy} onClick={() => void removeUpworkConnection()}>Disconnect</button> : <button className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white" disabled={isUpworkBusy} onClick={() => void beginUpworkConnection()}><img className="h-5 w-auto brightness-0 invert" src={publicAsset('resources/logos/upworklogo.webp')} alt="" />Connect Upwork</button>}<button className="rounded-lg bg-[#7F00FF] px-4 py-2 text-sm font-semibold text-white" onClick={openManualUpwork}>{isUpworkProfileUrl(member.upworkUrl) ? 'Edit' : 'Having trouble?'}</button></div></section>}<section className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-paper p-5 shadow-soft sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-4">{github.avatarUrl ? <img className="h-11 w-11 rounded-full object-cover" src={github.avatarUrl} alt="" /> : <Github size={38} />}<div className="min-w-0"><h2 className="font-semibold">GitHub</h2><p className="mt-1 truncate text-sm text-zinc-500">{github.connected ? `@${github.username} · ${github.membershipState === 'active' ? 'Organization access active' : github.membershipState === 'pending' ? 'Organization invitation pending' : 'Access needs attention'}` : 'Connect your developer identity and project repositories.'}</p>{(githubMessage || github.syncError) && <p className="mt-1 text-sm text-amber-700">{githubMessage || github.syncError}</p>}</div></div>{github.connected ? <div className="flex shrink-0 flex-wrap gap-2"><a className="rounded-lg bg-[#24292f] px-4 py-2 text-sm font-semibold text-white" href={github.profileUrl} target="_blank" rel="noreferrer">Open GitHub</a><button className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600" disabled={isGitHubBusy} onClick={() => void removeGitHubConnection()}>Disconnect</button></div> : <button className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#24292f] px-4 py-2 text-sm font-semibold text-white" disabled={isGitHubBusy} onClick={() => void beginGitHubConnection()}><Github size={18} />Connect GitHub</button>}</section></div>}
    {tab === 'integrations' && <div className="grid gap-4"><div className="flex items-center gap-3 pt-2"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest/10 text-forest"><Gift size={21} /></span><div><h2 className="text-xl font-semibold">Autogrant Packages</h2><p className="text-sm text-zinc-500">Link your Steam identity for project packages and developer access.</p></div></div><section className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-paper p-5 shadow-soft sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black"><img className="h-full w-full object-contain" src={publicAsset('resources/logos/steam.jpg')} alt="" /></span><div className="min-w-0"><h3 className="font-semibold">Steamworks</h3><p className="mt-1 text-sm text-zinc-500">{steam.connected ? (steam.packageStatus === 'ready' ? 'Autogrant packages ready.' : 'Connected · Ready for Steamworks group assignment.') : 'Connect Steam to prepare automatic project package access.'}</p>{steamMessage && <p className={`mt-1 text-sm ${steamMessage.includes('connected') ? 'text-emerald-700' : 'text-amber-700'}`}>{steamMessage}</p>}</div></div>{steam.connected ? <div className="flex shrink-0 flex-wrap gap-2"><a className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white" href={steam.profileUrl} target="_blank" rel="noreferrer">Open Steam</a><button className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600" disabled={isSteamBusy} onClick={() => void removeSteamConnection()}>Disconnect</button></div> : <button className="inline-flex h-11 shrink-0 items-center justify-center gap-3 rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={isSteamBusy} onClick={() => void beginSteamConnection()}><img className="h-6 w-6 object-contain" src={publicAsset('resources/logos/steamworks.png')} alt="" />{isSteamBusy ? 'Connecting...' : 'Connect Steamworks'}</button>}</section></div>}
    {isManualUpworkOpen && <div className="fixed inset-0 z-[80] grid place-items-end bg-ink/35 p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="manual-upwork-title"><form className="w-full max-w-md rounded-xl border border-line bg-paper p-5 shadow-soft" onSubmit={(event) => { event.preventDefault(); saveManualUpwork(); }}><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#7F00FF]">Partner Identity</p><h2 id="manual-upwork-title" className="mt-2 text-2xl font-semibold">Add your Upwork profile</h2><p className="mt-2 text-sm leading-6 text-zinc-600">Use your public profile URL while direct Upwork connection is unavailable.</p></div><button className="text-sm font-medium text-zinc-500" type="button" onClick={() => setIsManualUpworkOpen(false)}>Close</button></div><label className="mt-5 grid gap-2"><span className="text-sm font-medium text-zinc-600">Upwork profile URL</span><input className="h-12 rounded-lg border border-line bg-paper px-4 outline-none transition focus:border-[#7F00FF] focus:ring-4 focus:ring-[#7F00FF]/10" type="url" autoFocus placeholder="https://www.upwork.com/freelancers/~..." value={manualUpworkUrl} onChange={(event) => { setManualUpworkUrl(event.target.value); setManualUpworkError(''); }} /></label>{manualUpworkError && <p className="mt-3 text-sm text-red-600">{manualUpworkError}</p>}<div className="mt-5 flex flex-wrap gap-2"><button className="h-11 rounded-lg bg-[#7F00FF] px-4 text-sm font-semibold text-white" type="submit">Save profile</button>{member.upworkUrl && <button className="h-11 rounded-lg border border-line px-4 text-sm font-semibold text-zinc-600" type="button" onClick={() => { updateCurrentMember({ upworkUrl: '' }); setManualUpworkUrl(''); setIsManualUpworkOpen(false); }}>Remove</button>}</div></form></div>}
    <div className="flex flex-wrap gap-3 lg:hidden"><button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold" onClick={() => setView('dashboard')}>Home</button><button className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600" onClick={onLogout}>Log Out</button></div>
  </div>;
}

function LegacyProfile({ member, avatarUrl, records, upwork, upworkStatus, refreshUpwork, updateCurrentMember, onLogout, setView }: { member: WorkspaceMember; avatarUrl: string; records: WorkRecord[]; upwork: UpworkSnapshot; upworkStatus: string; refreshUpwork: () => void; updateCurrentMember: (changes: Partial<WorkspaceMember>) => void; onLogout: () => void; setView: (view: View) => void }) {
  const upworkMode = isUpworkContract(member);
  const activeUpworkContract = upwork.contracts.find((contract) => contract.status === 'Active');
  const contractName = activeUpworkContract && upworkMode ? `${activeUpworkContract.title} (UPWORK CONTRACT)` : member.onboarding.contractType;
  const projectIcons: Record<BenefitProgram, LucideIcon> = { 'FR Partners': UsersRound, 'The Nick': Sparkles, 'RAIN HEART': HeartPulse };
  const recentRecord = [...records].sort((a, b) => b.date.localeCompare(a.date))[0];
  const [isUpworkBusy, setIsUpworkBusy] = useState(false);

  async function beginUpworkConnection() {
    const token = getStoredSession()?.token;
    if (!token) return;
    setIsUpworkBusy(true);
    try {
      await connectUpwork(token);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Upwork connection could not be started.');
      setIsUpworkBusy(false);
    }
  }

  async function removeUpworkConnection() {
    const token = getStoredSession()?.token;
    if (!token || !window.confirm('Disconnect Upwork from this Workspace profile?')) return;
    setIsUpworkBusy(true);
    try {
      await disconnectUpwork(token);
      refreshUpwork();
    } finally {
      setIsUpworkBusy(false);
    }
  }

  return (
    <div className="grid gap-5 pb-8">
      <section className="rounded-xl border border-line bg-paper p-5 shadow-soft sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <ProfileAvatar src={avatarUrl} name={displayName(member)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Profile</p>
            <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold">
              <span className="truncate">{displayName(member)}</span>
              <VerifiedMark member={member} />
            </h1>
            <p className="mt-2 text-sm text-zinc-500">{member.employmentId}</p>
            <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg bg-mist px-3 py-2 text-sm">
              <BriefcaseBusiness size={16} className="text-forest" />
              <span className="text-zinc-500">Current contract</span>
              <span className="font-semibold">{contractName}</span>
            </div>
          </div>
          <div className="grid gap-2 sm:w-auto lg:hidden">
            <button className="h-11 rounded-lg bg-forest px-4 text-sm font-semibold text-white" type="button">Update Profile</button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-paper px-4 text-sm font-semibold text-zinc-700" type="button" onClick={onLogout}><LogOut size={17} />Log Out</button>
          </div>
        </div>
      </section>

      <VerificationCard member={member} />
      {!isIndependentPartner(member) && member.entraEmail.trim() && (
        <div className="flex flex-col gap-3 rounded-xl border border-[#71c9ee]/35 bg-[#1686c8]/5 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <img className="h-8 w-8 shrink-0" src={ENTRA_ICON} alt="" />
            <p className="text-sm font-medium text-zinc-700">Microsoft Entra ID is linked to this account identity.</p>
          </div>
          <a className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[#1686c8] px-4 text-sm font-semibold text-white transition hover:bg-[#0f73ad]" href="https://mysignins.microsoft.com/security-info" target="_blank" rel="noreferrer">
            SSO Settings
          </a>
        </div>
      )}

      {(isIndependentPartner(member) || isFrPartnersConnected(member)) && (
        <section className="grid gap-4 rounded-xl border border-line bg-mist p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Partner Identity</p>
              <h2 className="mt-1 text-xl font-semibold">Upwork</h2>
              <p className="mt-2 text-sm text-zinc-600">{upworkStatus || upwork.message || 'Connect your account to synchronize contracts, payments and tracked time.'}</p>
            </div>
            {!upwork.connected ? (
              <button className="inline-flex h-11 shrink-0 items-center justify-center gap-3 rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={isUpworkBusy} onClick={() => void beginUpworkConnection()}>
                <img className="h-5 w-auto brightness-0 invert" src={publicAsset('resources/logos/upworklogo.webp')} alt="" />
                {isUpworkBusy ? 'Connecting...' : 'Connect Upwork'}
              </button>
            ) : (
              <button className="h-10 rounded-lg border border-line bg-paper px-4 text-sm font-medium text-zinc-600" disabled={isUpworkBusy} onClick={() => void removeUpworkConnection()}>Disconnect</button>
            )}
          </div>
          {upwork.connected && upwork.profile && (
            <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <div><p className="text-xs text-zinc-500">Profile</p>{upwork.profile.url ? <a className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-forest" href={upwork.profile.url} target="_blank" rel="noreferrer">Open profile <ExternalLink size={14} /></a> : <p className="mt-1 text-sm">Not provided</p>}</div>
              <div><p className="text-xs text-zinc-500">Title</p><p className="mt-1 text-sm font-semibold">{upwork.profile.title || 'Not provided'}</p></div>
              <div><p className="text-xs text-zinc-500">Rate</p><p className="mt-1 text-sm font-semibold">{formatUpworkMoney(upwork.profile.rate)}</p></div>
            </div>
          )}
        </section>
      )}

      <Section title="Your Projects">
        {member.benefitPrograms.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {member.benefitPrograms.map((project) => {
              const Icon = projectIcons[project];
              return <div key={project} className="flex min-h-20 items-center gap-3 rounded-xl border border-line bg-paper p-4 shadow-soft"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest/10 text-forest"><Icon size={20} /></span><span className="font-semibold">{projectLabel(project)}</span></div>;
            })}
          </div>
        ) : <p className="text-sm text-zinc-500">No projects are connected to this profile yet.</p>}
      </Section>

      <Section title="Workspace Information">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Employment ID" value={member.employmentId} disabled onChange={() => undefined} />
          <Field label="Full Name" value={member.fullName} disabled onChange={() => undefined} />
          <Field label="Preferred Name" value={member.preferredName} onChange={(value) => updateCurrentMember({ preferredName: value })} />
          <Field label="Work Start Date" value={member.workStartDate} disabled onChange={() => undefined} />
          <Field label="Account Type" value={member.contractType} disabled onChange={() => undefined} />
          <Field label="Contracts" value={contractName} disabled onChange={() => undefined} />
          <Field label="Job Role" value={member.jobRole} disabled onChange={() => undefined} />
          <Field label="Entra ID Email" value={member.entraEmail} disabled onChange={() => undefined} />
          <Field label="Personal Email" value={member.personalEmail} disabled onChange={() => undefined} />
          <Field label="Phone Number" value={member.phoneNumber} onChange={(value) => updateCurrentMember({ phoneNumber: value })} />
          <Field label="Time Zone" value={member.timeZone} onChange={(value) => updateCurrentMember({ timeZone: value })} />
          <Field label="Portfolio" value={member.portfolio} onChange={(value) => updateCurrentMember({ portfolio: value })} />
          {(isFrPartnersConnected(member) || isIndependentPartner(member)) && <Field label="Upwork Profile" value={upwork.profile?.url || member.upworkUrl} disabled={upwork.connected} onChange={(value) => updateCurrentMember({ upworkUrl: value })} />}
          {upwork.connected && <Field label="Upwork Title" value={upwork.profile?.title || ''} disabled onChange={() => undefined} />}
          {upwork.connected && <Field label="Upwork Rate" value={formatUpworkMoney(upwork.profile?.rate)} disabled onChange={() => undefined} />}
          <Field label="Estimated Hours" value={member.estimatedHours} disabled onChange={() => undefined} />
          <Field label="Rate" value={member.rate} disabled onChange={() => undefined} />
          <Field label="Withheld Balance (€)" value={Number(member.withheldBalance ?? 0).toFixed(2)} disabled onChange={() => undefined} />
        </div>
      </Section>

      <Section title="Skills">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Languages" value={member.languages} disabled onChange={() => undefined} />
          <Field label="Software" value={member.software} disabled onChange={() => undefined} />
          <Field label="Seniority" value={member.seniority} disabled onChange={() => undefined} />
        </div>
      </Section>

      <Section title="Payment Information">
        <div className="rounded-xl border border-line bg-mist p-4">
          {upworkMode && <img className="mb-4 h-8 w-auto" src={publicAsset('resources/logos/upworklogo.webp')} alt="Upwork" />}
          <p className="leading-7 text-zinc-600">
            {upworkMode ? 'To update payout information, edit your Upwork disbursement methods.' : 'To update payout information, edit your profile through the Supplier portal.'}
          </p>
          <a className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-white" href={upworkMode ? 'https://www.upwork.com/nx/payments/disbursement-methods' : 'https://forms.office.com/r/maSdSX94Ui'} target="_blank" rel="noreferrer">
            {upworkMode ? 'Open Upwork Payments' : 'Open Supplier Form'}
          </a>
        </div>
      </Section>

      <Section title="Additional Information">
        <div className="rounded-xl border border-line bg-mist p-4">
          {upworkMode ? (
            <>
              <p className="leading-7 text-zinc-600">Contact your Account Manager via Upwork.</p>
              <a className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-forest px-4 text-sm font-medium text-white" href="https://www.upwork.com" target="_blank" rel="noreferrer">
                Open Upwork
              </a>
            </>
          ) : (
            <>
              <p className="leading-7 text-zinc-600">To update additional information, contact your manager.</p>
              <a className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-forest px-4 text-sm font-medium text-white" href="https://join.slack.com/t/flatrealityeu/shared_invite/zt-3eeknccsz-MWbN2vlNbRNwu3blGs11kw" target="_blank" rel="noreferrer">
                Open Slack
              </a>
            </>
          )}
        </div>
      </Section>

      <Section title="Workspace Activity">
        <div className="grid gap-4 md:grid-cols-2">
          <button className="flex min-h-32 items-start gap-4 rounded-xl border border-line bg-paper p-5 text-left shadow-soft transition hover:-translate-y-0.5" onClick={() => setView('workRecords')}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-mist text-forest"><ClipboardList size={21} /></span>
            <span><span className="block text-sm text-zinc-500">Work Records</span><span className="mt-1 block text-xl font-semibold">{records.length} records</span><span className="mt-2 block text-sm text-zinc-500">{recentRecord ? `Latest: ${formatDate(recentRecord.date)}` : 'No records yet'}</span></span>
          </button>
          <button className="flex min-h-32 items-start gap-4 rounded-xl border border-line bg-paper p-5 text-left shadow-soft transition hover:-translate-y-0.5" onClick={() => setView('careerGrowth')}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-mist text-forest"><TrendingUp size={21} /></span>
            <span><span className="block text-sm text-zinc-500">Career Growth</span><span className="mt-1 block text-xl font-semibold">{member.seniority || 'Not assigned'}</span><span className="mt-2 block text-sm text-zinc-500">View your current seniority and growth information.</span></span>
          </button>
        </div>
      </Section>
    </div>
  );
}

function VerificationCard({ member }: { member: WorkspaceMember }) {
  const isPartner = isIndependentPartner(member);
  if (!isPartner && !member.entraSetupCompleted) {
    return (
      <section className="flex items-start gap-4 rounded-xl border border-line bg-mist p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-paper text-zinc-500">
          <KeyRound size={22} />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Identity Pending</p>
          <h2 className="mt-1 text-xl font-semibold">Core Team verification is not complete</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{member.entraEmail.trim() ? `Sign in with ${member.entraEmail} through Entra ID to finish verification.` : 'Ask an administrator to assign your Entra ID email to enable verified access.'}</p>
        </div>
      </section>
    );
  }
  const title = isPartner ? 'Vetted Network Verified Partner' : 'Core Team Verified Member';
  const video = publicAsset(isPartner ? 'resources/videos/yellowgradient.mp4' : 'resources/videos/purplegradient.mp4');
  const items = isPartner
    ? ['Access to Flat Reality and partner projects', 'Vetted Network Partner badge', 'Access to LevelUp! and other Flat Reality partner programs']
    : ['Flat Reality social programs', 'Additional protection', 'Association with Flat Reality'];

  return (
    <section className="relative overflow-hidden rounded-xl p-6 text-white shadow-soft">
      <video className="absolute inset-0 h-full w-full object-cover" src={video} autoPlay muted loop playsInline />
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative grid gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur">
            <BadgeCheck size={23} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/75">Verified Access</p>
            <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-white/85">You have access to:</p>
          <ul className="mt-2 grid gap-2 text-sm text-white/85">
            {items.map((item) => (
              <li key={item} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        {isPartner && (
          <button className="justify-self-start rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white/60" type="button" disabled>
            Download Badge
          </button>
        )}
      </div>
    </section>
  );
}

function LevelUp({ member, levels, rewards }: { member: WorkspaceMember; levels: Level[]; rewards: Reward[] }) {
  const sortedLevels = [...levels].sort((a, b) => a.xpRequired - b.xpRequired);
  const currentLevel = getCurrentLevel(sortedLevels, member.xp);

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">LevelUp!</p>
        <h1 className="mt-3 text-3xl font-semibold md:text-5xl">{displayName(member)} rewards</h1>
        <p className="mt-3 text-zinc-600">
          Current level: <span className="font-semibold text-ink">{currentLevel.name}</span> · {member.xp} XP
        </p>
      </section>
      <section className="grid gap-4">
        {sortedLevels.map((level) => {
          const levelRewards = rewards.filter((reward) => reward.levelId === level.id);
          const isUnlocked = member.xp >= level.xpRequired;
          const isCurrent = currentLevel.id === level.id;

          return (
            <article key={level.id} className={`rounded-xl border bg-paper p-5 shadow-soft ${isCurrent ? 'border-forest' : 'border-line'}`}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{level.name}</h2>
                    {isCurrent && <span className="rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white">Current</span>}
                    {isUnlocked && !isCurrent && <span className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-zinc-600">Unlocked</span>}
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">{level.xpRequired} XP required</p>
                  {level.description && <p className="mt-2 leading-7 text-zinc-600">{level.description}</p>}
                </div>
                {!isUnlocked && <p className="rounded-lg bg-mist px-3 py-2 text-sm font-medium text-zinc-600">{level.xpRequired - member.xp} XP left</p>}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {levelRewards.length > 0 ? (
                  levelRewards.map((reward) => (
                    <div key={reward.id} className="rounded-lg border border-line bg-mist p-4">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${isUnlocked ? 'bg-forest text-white' : 'bg-white text-zinc-500'}`}>
                          <Gift size={18} />
                        </span>
                        <div>
                          <p className="font-medium">{reward.rewardName}</p>
                          {reward.description && <p className="mt-1 text-sm text-zinc-600">{reward.description}</p>}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No rewards configured for this level.</p>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function CareerGrowth({ member }: { member: WorkspaceMember }) {
  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Career Growth</p>
        <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Career Growth</h1>
      </section>
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Your Seniority</p>
        <h2 className="mt-3 text-3xl font-semibold">{member.seniority || 'Not set yet'}</h2>
        <p className="mt-4 max-w-2xl leading-7 text-zinc-600">We are working on integrating career growth into Workspace.</p>
      </section>
    </div>
  );
}

function getCompletionStatus(actualHours: number, planned: number): ScheduleDayStatus {
  if (actualHours === 0) return 'day_off';
  return actualHours > planned ? 'overworked' : 'completed';
}

function Schedule({
  member,
  shifts,
  completions,
  setScheduleShifts,
  setScheduleCompletions,
  upwork,
}: {
  member: WorkspaceMember;
  shifts: ScheduleShift[];
  completions: ScheduleDayCompletion[];
  setScheduleShifts: Dispatch<SetStateAction<ScheduleShift[]>>;
  setScheduleCompletions: Dispatch<SetStateAction<ScheduleDayCompletion[]>>;
  upwork: UpworkSnapshot;
}) {
  const weekStart = getWeekStart();
  const [editingShift, setEditingShift] = useState<ScheduleShift | null>(null);
  const [creatingDayIndex, setCreatingDayIndex] = useState<number | null>(null);
  const [completingDayIndex, setCompletingDayIndex] = useState<number | null>(null);
  const [isPlanningNextWeek, setIsPlanningNextWeek] = useState(false);
  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hours = Array.from({ length: 17 }, (_, index) => index + 6);
  const weekShifts = shifts.filter((shift) => shift.weekStart === weekStart);
  const weekCompletions = completions.filter((completion) => completion.weekStart === weekStart);
  const nextWeekStart = addDays(weekStart, 7);
  const previousWeekStart = addDays(weekStart, -7);
  const nextWeekShifts = shifts.filter((shift) => shift.weekStart === nextWeekStart);
  const previousWeekShifts = shifts.filter((shift) => shift.weekStart === previousWeekStart);
  const previousWeekCompletions = completions.filter((completion) => completion.weekStart === previousWeekStart);
  const actualHoursTotal = Math.floor(weekCompletions.reduce((total, completion) => total + completion.actualHours, 0));
  const estimatedHours = parseEstimatedHours(member.estimatedHours);
  const isOverEstimated = estimatedHours > 0 && actualHoursTotal > estimatedHours;
  const isExactEstimated = estimatedHours > 0 && actualHoursTotal === estimatedHours;
  const HeaderIcon = isOverEstimated ? Ban : CalendarDays;

  if (upwork.connected) return <UpworkSchedule member={member} upwork={upwork} />;

  function dayShifts(dayIndex: number) {
    return weekShifts.filter((shift) => shift.dayIndex === dayIndex).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  function dayCompletion(dayIndex: number) {
    return weekCompletions.find((completion) => completion.dayIndex === dayIndex);
  }

  function canComplete(dayIndex: number) {
    return addDays(weekStart, dayIndex) <= today();
  }

  function removeShift(id: string) {
    setScheduleShifts((items) => items.filter((shift) => shift.id !== id));
    setEditingShift(null);
  }

  return (
    <div className="grid gap-6">
      <section className="animate-panel rounded-xl border border-line bg-paper p-6 shadow-soft">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${isOverEstimated ? 'bg-red-100 text-red-600' : 'bg-forest/10 text-forest'}`}>
              <HeaderIcon size={24} />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">SCHEDULE BETA</p>
              <h1 className={`mt-2 text-3xl font-semibold md:text-5xl ${isOverEstimated ? 'text-red-600' : isExactEstimated ? 'text-emerald-600' : 'text-ink'}`}>
                Estimated hours: {actualHoursTotal}h / {estimatedHours || 0}h
              </h1>
            </div>
          </div>
          <span className="rounded-lg bg-mist px-3 py-2 text-sm font-medium">{formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}</span>
        </div>
      </section>

      <section className="animate-panel overflow-x-auto rounded-xl border border-line bg-paper p-4 shadow-soft">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[70px_repeat(7,minmax(125px,1fr))] border-b border-line">
            <div className="p-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">Time</div>
            {weekDays.map((day, dayIndex) => {
              const planned = plannedHours(dayShifts(dayIndex));
              const completion = dayCompletion(dayIndex);
              const status = completion ? getCompletionStatus(completion.actualHours, planned) : null;
              const statusClass = status === 'completed' ? 'bg-emerald-500' : status === 'overworked' ? 'bg-orange-500' : status === 'day_off' ? 'bg-blue-500' : 'bg-ink';
              return (
                <div key={day} className="border-l border-line p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{day}</p>
                      <p className="text-xs text-zinc-500">{formatDate(addDays(weekStart, dayIndex))}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${completion ? `${statusClass} text-white` : 'bg-mist text-zinc-700'}`}>
                      <span className={`h-2 w-2 rounded-full ${completion ? 'bg-white' : 'bg-ink'}`} />
                      {formatPlannerTime(completion?.actualHours ?? planned)}
                    </span>
                  </div>
                  <button className="mt-3 h-9 w-full rounded-lg bg-forest px-2 text-sm font-medium text-white" onClick={() => { setIsPlanningNextWeek(false); setCreatingDayIndex(dayIndex); }}>
                    + Create Shift
                  </button>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-[70px_repeat(7,minmax(125px,1fr))]">
            <div className="grid">
              {hours.map((hour) => (
                <div key={hour} className="h-16 border-b border-line pr-2 pt-1 text-right text-xs text-zinc-500">{String(hour).padStart(2, '0')}:00</div>
              ))}
            </div>
            {weekDays.map((day, dayIndex) => {
              const shiftsForDay = dayShifts(dayIndex);
              const completion = dayCompletion(dayIndex);
              const planned = plannedHours(shiftsForDay);
              const status = completion ? getCompletionStatus(completion.actualHours, planned) : null;
              return (
                <div key={day} className="relative border-l border-line">
                  {hours.map((hour) => (
                    <div key={hour} className="h-16 border-b border-line" />
                  ))}
                  {shiftsForDay.map((shift) => {
                    const top = ((timeToMinutes(shift.startTime) - 6 * 60) / 60) * 64;
                    const height = Math.max(44, ((timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime)) / 60) * 64);
                    return (
                      <button
                        key={shift.id}
                        className="absolute left-2 right-2 rounded-xl bg-forest/90 p-3 text-left text-white shadow-soft transition hover:bg-forest"
                        style={{ top, height }}
                        onClick={() => setEditingShift(shift)}
                      >
                        <span className="block text-sm font-semibold">{shiftTimeLabel(shift)}</span>
                        <span className="mt-1 block text-xs">{formatHours(minutesToHours(timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime)))}</span>
                      </button>
                    );
                  })}
                  <div className="sticky bottom-0 z-10 border-t border-line bg-paper/95 p-2 backdrop-blur">
                    {completion && (
                      <p className={`mb-2 rounded-lg px-2 py-1 text-center text-xs font-semibold text-white ${status === 'completed' ? 'bg-emerald-500' : status === 'overworked' ? 'bg-orange-500' : 'bg-blue-500'}`}>
                        {status === 'completed' ? 'Completed' : status === 'overworked' ? 'Overworked' : 'Day Off'}
                      </p>
                    )}
                    {completion ? (
                      <button className="mx-auto block text-xs font-semibold text-forest" onClick={() => setCompletingDayIndex(dayIndex)}>
                        Edit
                      </button>
                    ) : (
                      <button className="h-9 w-full rounded-lg border border-line bg-white px-2 text-xs font-medium disabled:text-zinc-400" disabled={!canComplete(dayIndex)} onClick={() => setCompletingDayIndex(dayIndex)}>
                        Complete Shift
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <NextWeekPlanningCard
        memberId={member.id}
        weekDays={weekDays}
        hours={hours}
        currentWeekStart={weekStart}
        nextWeekStart={nextWeekStart}
        currentWeekShifts={weekShifts}
        nextWeekShifts={nextWeekShifts}
        estimatedHours={estimatedHours}
        isPlanning={isPlanningNextWeek}
        setIsPlanning={setIsPlanningNextWeek}
        setEditingShift={setEditingShift}
        setCreatingDayIndex={setCreatingDayIndex}
        setScheduleShifts={setScheduleShifts}
      />

      <PastWeekStatsCard
        weekStart={previousWeekStart}
        shifts={previousWeekShifts}
        completions={previousWeekCompletions}
        estimatedHours={estimatedHours}
      />

      {(creatingDayIndex !== null || editingShift) && (
        <ShiftEditor
          dayName={weekDays[editingShift?.dayIndex ?? creatingDayIndex ?? 0]}
          shift={editingShift}
          defaultDayIndex={creatingDayIndex ?? 0}
          weekStart={editingShift?.weekStart ?? (isPlanningNextWeek ? nextWeekStart : weekStart)}
          memberId={member.id}
          onClose={() => {
            setCreatingDayIndex(null);
            setEditingShift(null);
          }}
          onDelete={removeShift}
          setScheduleShifts={setScheduleShifts}
        />
      )}

      {completingDayIndex !== null && (
        <CompleteShiftSheet
          dayName={weekDays[completingDayIndex]}
          planned={plannedHours(dayShifts(completingDayIndex))}
          completion={dayCompletion(completingDayIndex)}
          onClose={() => setCompletingDayIndex(null)}
          onSave={(actualHours) => {
            setScheduleCompletions((items) => {
              const existing = items.find((item) => item.memberId === member.id && item.weekStart === weekStart && item.dayIndex === completingDayIndex);
              const nextCompletion: ScheduleDayCompletion = {
                id: existing?.id ?? `completion-${Date.now()}`,
                memberId: member.id,
                weekStart,
                dayIndex: completingDayIndex,
                actualHours,
                completedAt: new Date().toISOString(),
              };
              return existing ? items.map((item) => (item.id === existing.id ? nextCompletion : item)) : [...items, nextCompletion];
            });
            setCompletingDayIndex(null);
          }}
        />
      )}
    </div>
  );
}

function UpworkSchedule({ member, upwork }: { member: WorkspaceMember; upwork: UpworkSnapshot }) {
  const weekStart = getWeekStart();
  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const entries = upwork.timeEntries.filter((entry) => entry.date >= weekStart && entry.date <= addDays(weekStart, 6));
  const totalHours = entries.reduce((total, entry) => total + entry.hours, 0);
  const totalCharges = entries.reduce((total, entry) => total + entry.charges, 0);
  const currency = entries[0]?.currency ?? 'USD';

  return (
    <div className="grid gap-6">
      <section className="animate-panel rounded-xl border border-line bg-paper p-6 shadow-soft">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white"><Clock size={24} /></span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">SCHEDULE BETA · UPWORK TIME TRACKER</p>
              <h1 className="mt-2 text-3xl font-semibold md:text-5xl">{formatPlannerTime(totalHours)} tracked</h1>
            </div>
          </div>
          <div className="text-right"><p className="text-sm text-zinc-500">Current week earnings</p><p className="mt-1 text-xl font-semibold">{formatUpworkMoney({ amount: totalCharges, currency })}</p></div>
        </div>
      </section>
      <section className="animate-panel overflow-x-auto rounded-xl border border-line bg-paper p-4 shadow-soft">
        <div className="grid min-w-[900px] grid-cols-7 divide-x divide-line">
          {weekDays.map((day, dayIndex) => {
            const date = addDays(weekStart, dayIndex);
            const dayEntries = entries.filter((entry) => entry.date === date);
            const hours = dayEntries.reduce((total, entry) => total + entry.hours, 0);
            return (
              <div key={day} className="min-h-[360px] p-3">
                <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
                  <div><p className="font-semibold">{day}</p><p className="text-xs text-zinc-500">{formatDate(date)}</p></div>
                  <span className="rounded-full bg-black px-2 py-1 text-xs font-semibold text-white">{formatPlannerTime(hours)}</span>
                </div>
                <div className="mt-3 grid gap-3">
                  {dayEntries.map((entry) => (
                    <article key={entry.id} className="rounded-lg border border-line bg-mist p-3">
                      <p className="text-sm font-semibold">{entry.contractTitle || 'Upwork contract'}</p>
                      <p className="mt-2 text-xs text-zinc-500">{formatPlannerTime(entry.hours)} · {formatUpworkMoney({ amount: entry.charges, currency: entry.currency })}</p>
                      {entry.memo && <p className="mt-2 text-xs leading-5 text-zinc-600">{entry.memo}</p>}
                    </article>
                  ))}
                  {!dayEntries.length && <p className="pt-3 text-xs text-zinc-400">No tracked time</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <p className="text-sm text-zinc-500">Time is synchronized from Upwork Time Tracker. Estimated hours: {member.estimatedHours || 'Not set'}.</p>
    </div>
  );
}

function ShiftEditor({
  dayName,
  shift,
  defaultDayIndex,
  weekStart,
  memberId,
  onClose,
  onDelete,
  setScheduleShifts,
}: {
  dayName: string;
  shift: ScheduleShift | null;
  defaultDayIndex: number;
  weekStart: string;
  memberId: string;
  onClose: () => void;
  onDelete: (id: string) => void;
  setScheduleShifts: Dispatch<SetStateAction<ScheduleShift[]>>;
}) {
  const [startTime, setStartTime] = useState(shift?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(shift?.endTime ?? '17:00');
  const [error, setError] = useState('');

  function saveShift() {
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      setError('End time must be later than start time.');
      return;
    }
    setScheduleShifts((items) => {
      const nextShift: ScheduleShift = {
        id: shift?.id ?? `shift-${Date.now()}`,
        memberId,
        weekStart,
        dayIndex: shift?.dayIndex ?? defaultDayIndex,
        startTime,
        endTime,
      };
      return shift ? items.map((item) => (item.id === shift.id ? nextShift : item)) : [...items, nextShift];
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/35 p-3 sm:place-items-center">
      <div className="w-full max-w-md rounded-xl border border-line bg-paper p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">{dayName}</p>
            <h2 className="mt-2 text-2xl font-semibold">{shift ? 'Edit Shift' : 'Create Shift'}</h2>
          </div>
          <button className="text-sm font-medium text-zinc-500" onClick={onClose}>Close</button>
        </div>
        <div className="mt-5 grid gap-4">
          <Field label="Start Time" type="time" value={startTime} onChange={setStartTime} />
          <Field label="End Time" type="time" value={endTime} onChange={setEndTime} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button className="h-11 rounded-lg bg-forest px-4 text-sm font-medium text-white" onClick={saveShift}>Save Shift</button>
            {shift && <button className="h-11 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600" onClick={() => onDelete(shift.id)}>Delete Shift</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompleteShiftSheet({ dayName, planned, completion, onClose, onSave }: { dayName: string; planned: number; completion?: ScheduleDayCompletion; onClose: () => void; onSave: (actualHours: number) => void }) {
  const initialHours = completion?.actualHours ?? Math.floor(planned);
  const [actualHours, setActualHours] = useState(String(Math.floor(initialHours)));
  const [actualMinutes, setActualMinutes] = useState(String(Math.round((initialHours - Math.floor(initialHours)) * 60)));

  function saveActualTime() {
    const hours = Math.max(0, Number(actualHours) || 0);
    const minutes = Math.min(59, Math.max(0, Number(actualMinutes) || 0));
    onSave(hours + minutes / 60);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/35 p-3 sm:place-items-center">
      <div className="w-full max-w-md rounded-xl border border-line bg-paper p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">{dayName}</p>
            <h2 className="mt-2 text-2xl font-semibold">Complete Shift</h2>
            <p className="mt-2 text-sm text-zinc-600">Planned time: {formatHours(planned)}</p>
          </div>
          <button className="text-sm font-medium text-zinc-500" onClick={onClose}>Close</button>
        </div>
        <div className="mt-5 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Actual Hours" type="number" value={actualHours} onChange={setActualHours} />
            <Field label="Actual Minutes" type="number" value={actualMinutes} onChange={setActualMinutes} />
          </div>
          <button className="h-11 rounded-lg bg-forest px-4 text-sm font-medium text-white" onClick={saveActualTime}>
            Save Actual Time
          </button>
        </div>
      </div>
    </div>
  );
}

function NextWeekPlanningCard({
  memberId,
  weekDays,
  hours,
  currentWeekStart,
  nextWeekStart,
  currentWeekShifts,
  nextWeekShifts,
  estimatedHours,
  isPlanning,
  setIsPlanning,
  setEditingShift,
  setCreatingDayIndex,
  setScheduleShifts,
}: {
  memberId: string;
  weekDays: string[];
  hours: number[];
  currentWeekStart: string;
  nextWeekStart: string;
  currentWeekShifts: ScheduleShift[];
  nextWeekShifts: ScheduleShift[];
  estimatedHours: number;
  isPlanning: boolean;
  setIsPlanning: (value: boolean) => void;
  setEditingShift: (shift: ScheduleShift | null) => void;
  setCreatingDayIndex: (dayIndex: number | null) => void;
  setScheduleShifts: Dispatch<SetStateAction<ScheduleShift[]>>;
}) {
  const todayDay = new Date().getDay();
  const canPlanNextWeek = todayDay === 0 || todayDay >= 3;
  const plannedNextHours = plannedHours(nextWeekShifts);
  const isReady = nextWeekShifts.length > 0 && !isPlanning;

  if (!canPlanNextWeek) return null;

  function startPlanning() {
    setScheduleShifts((items) => {
      const alreadyHasNextWeek = items.some((shift) => shift.memberId === memberId && shift.weekStart === nextWeekStart);
      if (alreadyHasNextWeek) return items;
      const duplicated = currentWeekShifts.map((shift) => ({
        ...shift,
        id: `shift-${Date.now()}-${shift.dayIndex}-${shift.startTime}`,
        weekStart: nextWeekStart,
      }));
      return [...items, ...duplicated];
    });
    setIsPlanning(true);
  }

  function dayShifts(dayIndex: number) {
    return nextWeekShifts.filter((shift) => shift.dayIndex === dayIndex).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return (
    <section className="animate-panel rounded-xl border border-line bg-paper p-5 shadow-soft">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-forest/10 text-forest">
            {isReady ? <CheckCircle2 size={22} /> : <CalendarDays size={22} />}
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Next Week</p>
            <h2 className="mt-2 text-2xl font-semibold">{isReady ? 'Your next week is ready!' : 'Plan your next week!'}</h2>
            {isReady && <p className="mt-2 text-zinc-600">Estimated hours: {Math.floor(plannedNextHours)} / {estimatedHours || 0} hours</p>}
            {!isReady && !isPlanning && <p className="mt-2 text-zinc-600">Start from a copy of your current week and adjust shifts before saving.</p>}
          </div>
        </div>
        {isReady ? (
          <button className="rounded-lg border border-line bg-white p-2 text-zinc-600 hover:text-forest" aria-label="Edit next week planning" onClick={() => setIsPlanning(true)}>
            <PenLine size={18} />
          </button>
        ) : !isPlanning ? (
          <button className="h-11 rounded-lg bg-forest px-4 text-sm font-medium text-white" onClick={startPlanning}>
            Start Planning
          </button>
        ) : null}
      </div>

      {isPlanning && (
        <div className="mt-5 grid gap-4">
          <div className="overflow-x-auto rounded-xl border border-line">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[70px_repeat(7,minmax(125px,1fr))] border-b border-line">
                <div className="p-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">Time</div>
                {weekDays.map((day, dayIndex) => (
                  <div key={day} className="border-l border-line p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{day}</p>
                        <p className="text-xs text-zinc-500">{formatDate(addDays(nextWeekStart, dayIndex))}</p>
                      </div>
                      <span className="rounded-full bg-mist px-2 py-1 text-xs font-semibold text-zinc-700">{formatPlannerTime(plannedHours(dayShifts(dayIndex)))}</span>
                    </div>
                    <button className="mt-3 h-9 w-full rounded-lg bg-forest px-2 text-sm font-medium text-white" onClick={() => { setIsPlanning(true); setCreatingDayIndex(dayIndex); }}>
                      + Create Shift
                    </button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[70px_repeat(7,minmax(125px,1fr))]">
                <div className="grid">
                  {hours.map((hour) => (
                    <div key={hour} className="h-16 border-b border-line pr-2 pt-1 text-right text-xs text-zinc-500">{String(hour).padStart(2, '0')}:00</div>
                  ))}
                </div>
                {weekDays.map((day, dayIndex) => (
                  <div key={day} className="relative border-l border-line">
                    {hours.map((hour) => (
                      <div key={hour} className="h-16 border-b border-line" />
                    ))}
                    {dayShifts(dayIndex).map((shift) => {
                      const top = ((timeToMinutes(shift.startTime) - 6 * 60) / 60) * 64;
                      const height = Math.max(44, ((timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime)) / 60) * 64);
                      return (
                        <button
                          key={shift.id}
                          className="absolute left-2 right-2 rounded-xl bg-forest/90 p-3 text-left text-white shadow-soft transition hover:bg-forest"
                          style={{ top, height }}
                          onClick={() => {
                            setIsPlanning(true);
                            setEditingShift(shift);
                          }}
                        >
                          <span className="block text-sm font-semibold">{shiftTimeLabel(shift)}</span>
                          <span className="mt-1 block text-xs">{formatHours(minutesToHours(timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime)))}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button className="justify-self-start rounded-lg bg-forest px-4 py-3 text-sm font-semibold text-white" onClick={() => setIsPlanning(false)}>
            Finish Planning
          </button>
        </div>
      )}
    </section>
  );
}

function PastWeekStatsCard({ weekStart, shifts, completions, estimatedHours }: { weekStart: string; shifts: ScheduleShift[]; completions: ScheduleDayCompletion[]; estimatedHours: number }) {
  const actualHours = Math.floor(completions.reduce((total, completion) => total + completion.actualHours, 0));
  const overworkedDays = completions.filter((completion) => completion.actualHours > plannedHours(shifts.filter((shift) => shift.dayIndex === completion.dayIndex))).length;
  const dayOffCount = completions.filter((completion) => completion.actualHours === 0).length;

  return (
    <section className="animate-panel rounded-xl border border-line bg-paper p-5 shadow-soft">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-mist text-forest">
          <TrendingUp size={22} />
        </span>
        <div className="grid gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Past Week Stats</p>
            <h2 className="mt-2 text-2xl font-semibold">Past Week Stats</h2>
          </div>
          <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
            <p><span className="font-medium text-ink">Period:</span> {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}</p>
            <p><span className="font-medium text-ink">Hours:</span> {actualHours} / {estimatedHours || 0}</p>
            <p className="inline-flex items-center gap-2">
              <span><span className="font-medium text-ink">Overworked days:</span> {overworkedDays}</span>
              {overworkedDays > 0 && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"><Ban size={12} /></span>}
            </p>
            <p><span className="font-medium text-ink">Days off:</span> {dayOffCount}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkRecordsPage({ member, records, setWorkRecords }: { member: WorkspaceMember; records: WorkRecord[]; setWorkRecords: Dispatch<SetStateAction<WorkRecord[]>> }) {
  const sortedRecords = sortRecordsNewestFirst(records);
  const healthIcon = member.strikeSystem === 0 ? '👍' : member.strikeSystem === 1 ? '🫤' : '☹️';

  function submitExplanation(recordId: string, explanationText: string) {
    setWorkRecords((items) =>
      items.map((record) =>
        record.id === recordId
          ? {
              ...record,
              explanationText,
              explanationSubmittedAt: new Date().toISOString(),
            }
          : record,
      ),
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Account Health</p>
            <h1 className="mt-3 text-3xl font-semibold">{displayName(member)}</h1>
          </div>
          <div className="text-4xl">{healthIcon}</div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className={`h-4 rounded-full ${index < member.strikeSystem ? 'bg-red-500' : 'bg-emerald-500'}`} />
          ))}
        </div>
      </section>

      <Section title="Records">
        <div className="relative grid gap-4 border-l-2 border-line pl-5">
          {sortedRecords.length ? (
            sortedRecords.map((record) => {
              const style = recordStyle(record.type);
              if (record.type === 'explanation_request') {
                return <ExplanationRequestCard key={record.id} record={record} onSubmit={(text) => submitExplanation(record.id, text)} />;
              }
              return (
                <article key={record.id} className={`relative rounded-xl border ${style.border} ${style.bg} p-4 shadow-soft`}>
                  <span className="absolute -left-[31px] top-5 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-white text-sm">{style.icon}</span>
                  <p className="text-sm font-medium text-zinc-500">{formatDate(record.date)}</p>
                  <p className="mt-2 leading-7 text-zinc-700">{record.text}</p>
                </article>
              );
            })
          ) : (
            <p className="text-zinc-600">No work records yet.</p>
          )}
        </div>
      </Section>
    </div>
  );
}

function ExplanationRequestCard({ record, onSubmit }: { record: WorkRecord; onSubmit: (text: string) => void }) {
  const [text, setText] = useState(record.explanationText ?? '');
  const hasSubmitted = Boolean(record.explanationText);

  return (
    <article className="relative rounded-xl border border-red-600 bg-red-600 p-4 text-white shadow-soft">
      <span className="absolute -left-[31px] top-5 flex h-7 w-7 items-center justify-center rounded-full border border-red-600 bg-white text-sm text-red-600">!</span>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Explanation Required</p>
      <p className="mt-2 leading-7 text-white">{record.text}</p>
      {hasSubmitted ? (
        <div className="mt-4 rounded-lg bg-white/10 p-3">
          <p className="text-sm font-semibold">Explanation submitted</p>
          <p className="mt-2 text-sm text-white/85">{record.explanationText}</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <textarea
            className="min-h-28 rounded-lg border border-white/30 bg-white p-3 text-sm text-ink outline-none"
            placeholder="Attach explanation"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button className="justify-self-start rounded-lg bg-white px-4 py-2 text-sm font-semibold text-red-600" onClick={() => text.trim() && onSubmit(text.trim())}>
            Submit Explanation
          </button>
        </div>
      )}
    </article>
  );
}

function SignedDocuments({ member }: { member: WorkspaceMember }) {
  const signedDocuments = member.documents.filter((document) => document.signed && document.url);

  return (
    <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Signed Documents</p>
      <h1 className="mt-3 text-3xl font-semibold">Documents</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {signedDocuments.length ? (
          signedDocuments.map((document) => (
            <a key={document.id} className="flex min-h-20 items-center gap-4 rounded-xl border border-line bg-mist p-4 transition hover:-translate-y-0.5" href={document.url} target="_blank" rel="noreferrer">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-forest">
                <FileText size={19} />
              </span>
              <span className="font-medium">{document.title}</span>
            </a>
          ))
        ) : (
          <p className="text-zinc-600">No signed documents are available yet.</p>
        )}
      </div>
    </section>
  );
}

function FilesPage({ member, fileProjects, setFileProjects }: { member: WorkspaceMember; fileProjects: FileProject[]; setFileProjects: Dispatch<SetStateAction<FileProject[]>> }) {
  const [activeProjectId, setActiveProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [draft, setDraft] = useState({ title: '', url: '', type: 'Document file' as FileResourceType });
  const [editingId, setEditingId] = useState('');

  function addProject() {
    const name = newProjectName.trim();
    if (!name || !member.isAdmin) return;
    setFileProjects((projects) => [...projects, { id: `file-project-${Date.now()}`, name, resources: [] }]);
    setNewProjectName('');
  }

  function saveResource(projectId: string) {
    if (!draft.title.trim() || !draft.url.trim()) return;
    setFileProjects((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              resources: [...project.resources, { id: `file-resource-${Date.now()}`, title: draft.title.trim(), url: draft.url.trim(), type: draft.type }],
            }
          : project,
      ),
    );
    setDraft({ title: '', url: '', type: 'Document file' });
    setActiveProjectId('');
  }

  function updateResource(projectId: string, resourceId: string, changes: { title?: string; url?: string; type?: FileResourceType }) {
    if (!member.isAdmin) return;
    setFileProjects((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? { ...project, resources: project.resources.map((resource) => (resource.id === resourceId ? { ...resource, ...changes } : resource)) }
          : project,
      ),
    );
  }

  function deleteResource(projectId: string, resourceId: string) {
    if (!member.isAdmin) return;
    setFileProjects((projects) => projects.map((project) => (project.id === projectId ? { ...project, resources: project.resources.filter((resource) => resource.id !== resourceId) } : project)));
  }

  return (
    <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Workspace Files</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Files</h1>
          <p className="mt-2 text-sm text-zinc-600">Shared documents and GitHub resources for workspace projects.</p>
        </div>
        {member.isAdmin && (
          <div className="flex gap-2">
            <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="New project" />
            <button className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white" onClick={addProject}>
              Add project
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6">
        {fileProjects.map((project) => (
          <div key={project.id} className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{project.name}</h2>
              <button className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-forest" onClick={() => setActiveProjectId(activeProjectId === project.id ? '' : project.id)}>
                <Upload size={16} />
                Upload
              </button>
            </div>

            {activeProjectId === project.id && (
              <div className="grid gap-2 rounded-xl border border-line bg-mist p-4 sm:grid-cols-[1fr_1fr_180px_auto]">
                <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Document title" />
                <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="Document URL" />
                <select className="rounded-lg border border-line bg-white px-3 py-2 text-sm" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as FileResourceType })}>
                  <option>Document file</option>
                  <option>GitHub resource</option>
                </select>
                <button className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white" onClick={() => saveResource(project.id)}>
                  Save
                </button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {project.resources.length ? (
                project.resources.map((resource) => {
                  const Icon = resource.type === 'GitHub resource' ? Github : FileText;
                  const isEditing = member.isAdmin && editingId === resource.id;
                  return (
                    <article key={resource.id} className="rounded-xl border border-line bg-mist p-4">
                      <div className="flex items-start gap-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-forest">
                          <Icon size={19} />
                        </span>
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="grid gap-2">
                              <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" value={resource.title} onChange={(event) => updateResource(project.id, resource.id, { title: event.target.value })} />
                              <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" value={resource.url} onChange={(event) => updateResource(project.id, resource.id, { url: event.target.value })} />
                              <select className="rounded-lg border border-line bg-white px-3 py-2 text-sm" value={resource.type} onChange={(event) => updateResource(project.id, resource.id, { type: event.target.value as FileResourceType })}>
                                <option>Document file</option>
                                <option>GitHub resource</option>
                              </select>
                            </div>
                          ) : (
                            <a className="block font-medium hover:text-forest" href={resource.url} target="_blank" rel="noreferrer">
                              {resource.title}
                            </a>
                          )}
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{resource.type}</p>
                        </div>
                      </div>
                      {member.isAdmin && (
                        <div className="mt-3 flex gap-2">
                          <button className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold" onClick={() => setEditingId(isEditing ? '' : resource.id)}>
                            {isEditing ? 'Done' : 'Edit'}
                          </button>
                          <button className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600" onClick={() => deleteResource(project.id, resource.id)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <p className="text-sm text-zinc-600">No files have been added yet.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const installPackages = [
  {
    name: 'GDK',
    provider: 'Microsoft Corporation',
    icon: 'resources/logos/xbox.png',
    description: 'Microsoft\'s game development kit for building, testing, and publishing games across Xbox and Windows.',
    url: 'https://www.microsoft.com/en-us/software-download/gdk#section_GameCore',
    unrestricted: false,
  },
  {
    name: 'Xbox Add-ins',
    provider: 'Microsoft Corporation',
    icon: 'resources/logos/xbox.png',
    description: 'Additional Xbox development integrations and tools for supported engines and production workflows.',
    url: 'https://www.microsoft.com/en-us/software-download/gdk#section_addins',
    unrestricted: false,
  },
  {
    name: 'ID@XBOX GREENROOM (Conference Material)',
    provider: 'Microsoft Corporation',
    icon: 'resources/logos/xbox.png',
    description: 'Conference presentations and technical resources prepared for approved ID@Xbox game developers.',
    url: 'https://www.microsoft.com/en-us/software-download/gdk#section_ConferenceMaterial',
    unrestricted: false,
  },
  {
    name: 'Steamworks API',
    provider: 'Valve Corporation',
    icon: 'resources/logos/steamworks.png',
    description: 'Official Steamworks SDK downloads and platform integration resources for Steam partners.',
    url: 'https://partner.steamgames.com/downloads/list',
    unrestricted: true,
  },
  {
    name: 'Steamworks.NET',
    provider: 'Steamworks.NET',
    icon: 'resources/logos/steamworks.png',
    description: 'A managed Steamworks API wrapper packaged for direct use in Unity projects.',
    url: 'https://github.com/rlabrecque/Steamworks.NET/releases/download/2025.164.1/Steamworks.NET_2025.164.1.unitypackage',
    unrestricted: true,
  },
];

function InstallsPage({ member }: { member: WorkspaceMember }) {
  const canDownload = member.onboarding.ndaSigned && (member.permissions ?? []).includes('Developer');

  return (
    <section className="rounded-xl border border-line bg-paper p-4 shadow-soft sm:p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Workspace Installs</p>
      <h1 className="mt-3 text-3xl font-semibold">Installs</h1>
      <p className="mt-2 text-sm text-zinc-600">Approved development packages and internal software resources.</p>

      <article className="mt-6 flex items-start gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><AlertTriangle size={22} /></span>
        <div>
          <h2 className="font-semibold text-amber-950">Sensitive Information Alert</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">Be careful when handling sensitive information and use trusted devices. Each installed package is signed with your identity, so copying, distribution, or unintended use violates the applicable NDA and may be punishable under Directive (EU) 2016/943, including fines and up to four years of imprisonment where applicable.</p>
        </div>
      </article>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {installPackages.map((item) => (
          <article key={item.name} className="flex min-h-48 flex-col rounded-xl border border-line bg-mist p-5">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white"><img className="h-full w-full object-contain" src={publicAsset(item.icon)} alt="" /></span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{item.name}</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">Provider: {item.provider}</p>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{item.description}</p>
              </div>
            </div>
            <div className="mt-auto pt-5">
              {item.unrestricted || canDownload ? (
                <a className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-forest px-4 text-sm font-semibold text-white" href={item.url} target="_blank" rel="noreferrer"><Download size={17} />Download</a>
              ) : (
                <button className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-zinc-300 px-4 text-sm font-semibold text-zinc-600" type="button" disabled><Lock size={16} />Download</button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">{title}</p>
      <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-zinc-600">{text}</p>
    </section>
  );
}

function Guides({ pages }: { pages: GuidePage[] }) {
  const sortedPages = [...pages].sort((a, b) => a.order - b.order);
  const [selectedPageId, setSelectedPageId] = useState(sortedPages[0]?.id ?? '');
  const selectedPage = sortedPages.find((page) => page.id === selectedPageId) ?? sortedPages[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-xl border border-line bg-paper p-4 shadow-soft">
        <h1 className="text-xl font-semibold">Guides</h1>
        <div className="mt-4 grid gap-2">
          {sortedPages.map((page) => (
            <button key={page.id} className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${selectedPage?.id === page.id ? 'bg-mist text-ink' : 'text-zinc-600 hover:bg-mist'}`} onClick={() => setSelectedPageId(page.id)}>
              {page.title}
            </button>
          ))}
        </div>
      </aside>
      <article className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        {selectedPage ? <div className="grid gap-1">{renderTextMarkup(selectedPage.content)}</div> : <p className="text-zinc-600">No guide pages have been created yet.</p>}
      </article>
    </div>
  );
}

function Admin({
  members,
  levels,
  rewards,
  guidePages,
  workRecords,
  setMembers,
  setLevels,
  setRewards,
  setGuidePages,
  setWorkRecords,
  updateWorkspace,
  impersonateMember,
  resetMemberPassword,
  onFocusModeChange,
}: {
  members: WorkspaceMember[];
  levels: Level[];
  rewards: Reward[];
  guidePages: GuidePage[];
  workRecords: WorkRecord[];
  setMembers: Dispatch<SetStateAction<WorkspaceMember[]>>;
  setLevels: Dispatch<SetStateAction<Level[]>>;
  setRewards: Dispatch<SetStateAction<Reward[]>>;
  setGuidePages: Dispatch<SetStateAction<GuidePage[]>>;
  setWorkRecords: Dispatch<SetStateAction<WorkRecord[]>>;
  updateWorkspace: WorkspaceUpdate;
  impersonateMember: (memberId: string) => void | Promise<void>;
  resetMemberPassword: (memberId: string) => void | Promise<void>;
  onFocusModeChange: (focused: boolean) => void;
}) {
  const [module, setModule] = useState<AdminModule>(() => window.location.hash.startsWith('#/hr') ? 'hr' : 'home');

  if (module === 'hr') return <HrAdmin members={members} rewards={rewards} levels={levels} workRecords={workRecords} setMembers={setMembers} setWorkRecords={setWorkRecords} updateWorkspace={updateWorkspace} impersonateMember={impersonateMember} resetMemberPassword={resetMemberPassword} onFocusModeChange={onFocusModeChange} onBack={() => { window.location.hash = ''; setModule('home'); }} />;
  if (module === 'partners') return <AdminPartners members={members} workRecords={workRecords} setMembers={setMembers} onBack={() => setModule('home')} />;
  if (module === 'retainer') return <div className="grid gap-4"><BackButton onBack={() => setModule('home')} /><RetainerAdmin /></div>;
  if (module === 'guides') return <AdminGuides guidePages={guidePages} setGuidePages={setGuidePages} onBack={() => setModule('home')} />;
  if (module === 'levelup') return <AdminLevels levels={levels} rewards={rewards} setLevels={setLevels} setRewards={setRewards} onBack={() => setModule('home')} />;
  if (module === 'logs') return <AdminLogs members={members} onBack={() => setModule('home')} />;

  const modules: Array<[AdminModule, LucideIcon, string, string]> = [
    ['hr', UsersRound, 'HR', 'Users, contracts, documents, payments, statuses and work records.'],
    ['partners', Building2, 'Partners™', 'Manage partner availability, rates, index and profiles.'],
    ['retainer', BriefcaseBusiness, 'Retainer+', 'Edit the public catalogue, availability rules, inquiries and partner assignments.'],
    ['guides', BookOpen, 'Guide Writting', 'Create and edit workspace guide pages.'],
    ['levelup', Trophy, 'LevelUp! Configurator', 'Configure levels, XP requirements and rewards.'],
    ['logs', FileText, 'Logs', 'Review sessions, profile changes and workspace data edits.'],
    ['supabase', ExternalLink, 'Supabase Control', 'Open the connected Supabase project dashboard.'],
  ];

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Administration</p>
        <h1 className="mt-3 text-3xl font-semibold">Workspace Control</h1>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map(([key, Icon, title, description]) => (
          <button
            key={key}
            className="flex min-h-32 items-start gap-4 rounded-xl border border-line bg-paper p-5 text-left shadow-soft transition hover:-translate-y-0.5"
            onClick={() => {
              if (key === 'supabase') {
                window.open('https://supabase.com/dashboard/project/kcsxspifrkuhbdmfahoy?method=github', '_blank', 'noreferrer');
                return;
              }
              if (key === 'hr') window.location.hash = '/hr/';
              setModule(key);
            }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-mist text-forest">
              <Icon size={21} />
            </span>
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="mt-2 block text-sm leading-6 text-zinc-600">{description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button className="justify-self-start rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-zinc-600" onClick={onBack}>
      Back to Admin
    </button>
  );
}

function HrAdmin({
  members,
  rewards,
  levels,
  workRecords,
  setMembers,
  setWorkRecords,
  updateWorkspace,
  impersonateMember,
  resetMemberPassword,
  onFocusModeChange,
  onBack,
}: {
  members: WorkspaceMember[];
  rewards: Reward[];
  levels: Level[];
  workRecords: WorkRecord[];
  setMembers: Dispatch<SetStateAction<WorkspaceMember[]>>;
  setWorkRecords: Dispatch<SetStateAction<WorkRecord[]>>;
  updateWorkspace: WorkspaceUpdate;
  impersonateMember: (memberId: string) => void | Promise<void>;
  resetMemberPassword: (memberId: string) => void | Promise<void>;
  onFocusModeChange: (focused: boolean) => void;
  onBack: () => void;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [tab, setTab] = useState<HrTab>('overview');
  const [search, setSearch] = useState('');
  const [showSuspendedUsers, setShowSuspendedUsers] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(() => window.location.hash === '#/hr/onboarding');
  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const filteredMembers = members.filter((member) => [member.fullName, member.preferredName, member.employmentId, member.jobRole].join(' ').toLowerCase().includes(search.toLowerCase()));
  const visibleMembers = filteredMembers.filter((member) => member.status !== 'suspended');
  const suspendedMembers = filteredMembers.filter((member) => member.status === 'suspended');

  useEffect(() => {
    onFocusModeChange(Boolean(selectedMemberId) || isOnboarding);
  }, [selectedMemberId, isOnboarding, onFocusModeChange]);

  useEffect(() => () => onFocusModeChange(false), [onFocusModeChange]);

  function completeOnboarding(member: WorkspaceMember) {
    updateWorkspace([...members, member], [...workRecords, registrationRecord(member)]);
    window.location.hash = `/hr/member/${member.id}`;
    setIsOnboarding(false);
    setSelectedMemberId(member.id);
    setTab('overview');
  }

  function updateMember(changes: Partial<WorkspaceMember>) {
    if (!selectedMember) return;
    setMembers((items) => items.map((member) => (member.id === selectedMember.id ? { ...member, ...changes } : member)));
  }

  return (
    <div className={`hr-admin-page grid gap-4 sm:gap-6 ${isOnboarding ? 'min-h-screen' : selectedMember ? 'p-3 sm:p-4 lg:p-6' : ''}`}>
      {isOnboarding ? (
        <HrOnboardingWizard
          members={members}
          onCancel={() => { window.location.hash = '/hr/'; setIsOnboarding(false); }}
          onComplete={completeOnboarding}
        />
      ) : (
      <>
      {!selectedMember && <BackButton onBack={onBack} />}
      {!selectedMember ? (
        <>
          <section className="rounded-xl border border-line bg-paper p-4 shadow-soft sm:p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">HR</p>
                <h1 className="mt-3 text-3xl font-semibold">People</h1>
              </div>
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white" onClick={() => { window.location.hash = '/hr/onboarding'; setIsOnboarding(true); }}><Plus size={17} />Add User</button>
            </div>
            <label className="mt-5 flex h-11 items-center gap-3 rounded-lg border border-line px-3">
              <Search size={18} className="text-zinc-400" />
              <input className="w-full outline-none" placeholder="Search users" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </section>
          <PeopleGroup title="Core Team" members={visibleMembers.filter((member) => member.contractType === 'CORE TEAM')} onSelect={setSelectedMemberId} />
          <PeopleGroup title="Independent Partners" members={visibleMembers.filter((member) => member.contractType === 'INDEPENDENT PARTNER')} onSelect={setSelectedMemberId} />
          <section className="grid gap-3">
            <button className="justify-self-start text-sm font-medium text-forest" onClick={() => setShowSuspendedUsers((value) => !value)}>
              {showSuspendedUsers ? 'Hide suspended users' : 'Show suspended users'}
            </button>
            {showSuspendedUsers && <PeopleGroup title="Suspended Users" members={suspendedMembers} onSelect={setSelectedMemberId} />}
          </section>
        </>
      ) : (
        <MemberEditor
          member={selectedMember}
          levels={levels}
          rewards={rewards}
          records={workRecords.filter((record) => record.memberId === selectedMember.id)}
          tab={tab}
          setTab={setTab}
          updateMember={updateMember}
          setMembers={setMembers}
          setWorkRecords={setWorkRecords}
          impersonateMember={impersonateMember}
          resetMemberPassword={resetMemberPassword}
          onBack={() => { window.location.hash = '/hr/'; setSelectedMemberId(null); }}
        />
      )}
      </>
      )}
    </div>
  );
}

function PeopleGroup({ title, members, onSelect }: { title: string; members: WorkspaceMember[]; onSelect: (id: string) => void }) {
  return (
    <Section title={title}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((member) => (
          <button key={member.id} className="rounded-xl border border-line bg-paper p-4 text-left shadow-soft transition hover:-translate-y-0.5" onClick={() => onSelect(member.id)}>
            <p className="inline-flex items-center gap-2 font-semibold">
              {displayName(member)}
              <VerifiedMark member={member} size="sm" />
            </p>
            <p className="mt-1 text-sm text-zinc-500">{member.employmentId} - {member.jobRole || 'No role set'}</p>
            <p className={`mt-2 text-xs font-medium ${isOnline(member) ? 'text-emerald-600' : 'text-zinc-500'}`}>{presenceLabel(member)}</p>
            <p className="mt-3 text-xs font-medium text-zinc-500">{statusLabel(member.status)} · {member.strikeSystem} strikes</p>
          </button>
        ))}
        {!members.length && <p className="text-sm text-zinc-500">No users here yet.</p>}
      </div>
    </Section>
  );
}

function MemberEditor({
  member,
  levels,
  rewards,
  records,
  tab,
  setTab,
  updateMember,
  setMembers,
  setWorkRecords,
  impersonateMember,
  resetMemberPassword,
  onBack,
}: {
  member: WorkspaceMember;
  levels: Level[];
  rewards: Reward[];
  records: WorkRecord[];
  tab: HrTab;
  setTab: (tab: HrTab) => void;
  updateMember: (changes: Partial<WorkspaceMember>) => void;
  setMembers: Dispatch<SetStateAction<WorkspaceMember[]>>;
  setWorkRecords: Dispatch<SetStateAction<WorkRecord[]>>;
  impersonateMember: (memberId: string) => void | Promise<void>;
  resetMemberPassword: (memberId: string) => void | Promise<void>;
  onBack: () => void;
}) {
  const [memberUpwork, setMemberUpwork] = useState<UpworkSnapshot>(EMPTY_UPWORK_SNAPSHOT);
  const [memberAvatar, setMemberAvatar] = useState('');
  const [upworkMessage, setUpworkMessage] = useState('Loading Upwork connection...');
  const [showContractWizard, setShowContractWizard] = useState(false);

  async function refreshMemberUpwork(force = false) {
    const token = getStoredSession()?.token;
    if (!token || !isSupabaseConfigured) return;
    try {
      const snapshot = await getUpworkSnapshot(token, member.id, force);
      setMemberUpwork(snapshot);
      setUpworkMessage(snapshot.message);
    } catch (error) {
      setUpworkMessage(error instanceof Error ? error.message : 'Upwork data could not be loaded.');
    }
  }

  useEffect(() => {
    void refreshMemberUpwork();
    const token = getStoredSession()?.token;
    if (token && member.entraEmail) getEntraAvatar(token, member.id).then(setMemberAvatar).catch(() => setMemberAvatar(''));
    else setMemberAvatar('');
  }, [member.id]);

  const tabs: Array<[HrTab, LucideIcon, string]> = [
    ['overview', LayoutDashboard, 'Overview'],
    ['contact', Contact, 'Contact'],
    ['records', ClipboardList, 'Work Records'],
    ['access', ShieldCheck, 'Access & Role'],
    ['devices', MonitorSmartphone, 'Devices'],
    ['levelup', Trophy, 'LevelUp!'],
    ['payments', WalletCards, 'Payments'],
    ['documents', FileCheck2, 'Documents'],
    ...(isCoreTeam(member) ? [['careerGrowth', TrendingUp, 'Career Growth'] as [HrTab, LucideIcon, string]] : []),
    ...(isFrPartnersConnected(member) ? [['partners', Link2, 'Partners™'] as [HrTab, LucideIcon, string]] : []),
    ['experiments', FlaskConical, 'Experiments'],
  ];

  return (
    <div className="hr-member-editor grid min-w-0 gap-4 sm:gap-5">
      <button className="justify-self-start rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-zinc-600" onClick={onBack}>
        Back to people
      </button>
      <MemberHero member={member} avatarUrl={memberAvatar || memberUpwork.profile?.photoUrl || member.githubAvatarUrl || ''} compact />
      <label className="grid gap-2 rounded-xl border border-line bg-paper p-3 shadow-soft sm:hidden">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Profile section</span>
        <select className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-semibold outline-none focus:border-forest" value={tab} onChange={(event) => setTab(event.target.value as HrTab)}>
          {tabs.map(([key, , label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <section className="hr-member-tabs hidden rounded-xl border border-line bg-paper p-2 shadow-soft sm:block">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(([key, Icon, label]) => (
            <button key={key} className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${tab === key ? 'bg-mist text-forest' : 'text-zinc-600 hover:bg-mist'}`} onClick={() => setTab(key)}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </section>
      {tab === 'overview' && <AdminOverviewTab member={member} records={records} avatarUrl={memberAvatar || memberUpwork.profile?.photoUrl || member.githubAvatarUrl || ''} upwork={memberUpwork} updateMember={updateMember} />}
      {tab === 'contact' && <AdminContactTab member={member} updateMember={updateMember} />}
      {tab === 'records' && <AdminRecordsTab member={member} records={records} setWorkRecords={setWorkRecords} />}
      {tab === 'access' && <AdminAccessRoleTab member={member} updateMember={updateMember} setMembers={setMembers} impersonateMember={impersonateMember} resetMemberPassword={resetMemberPassword} />}
      {tab === 'devices' && <AdminDevicesTab member={member} />}
      {tab === 'levelup' && <AdminMemberLevelUpTab member={member} levels={levels} rewards={rewards} updateMember={updateMember} />}
      {tab === 'payments' && <AdminPaymentsTab member={member} upwork={memberUpwork} updateMember={updateMember} />}
      {tab === 'documents' && <AdminDocumentsTab member={member} updateMember={updateMember} onStartUpworkContract={() => setShowContractWizard(true)} />}
      {tab === 'partners' && <AdminMemberPartnersTab member={member} upwork={memberUpwork} message={upworkMessage} />}
      {tab === 'careerGrowth' && <Placeholder title="Career Growth" text="Career planning, goals and development reviews will appear here." />}
      {tab === 'experiments' && <AdminScheduleTab member={member} updateMember={updateMember} />}
      {showContractWizard && <UpworkContractWizard member={member} onClose={() => setShowContractWizard(false)} onCreated={(snapshot) => { setMemberUpwork(snapshot); setShowContractWizard(false); }} />}
    </div>
  );
}

function OnboardingProgressCard({ member, updateMember }: { member: WorkspaceMember; updateMember: (changes: Partial<WorkspaceMember>) => void }) {
  if (member.onboarding.completed) return null;
  const steps = onboardingChecklist(member);
  const ready = steps.every((step) => step.done);
  function confirm() {
    if (!ready) return;
    const xpBonus = member.onboarding.completedXpAwarded ? 0 : 100;
    updateMember({ onboarding: { ...member.onboarding, completed: true, completedXpAwarded: true }, xp: member.xp + xpBonus });
  }
  return <section className="onboarding-progress overflow-hidden rounded-xl border border-forest/20 p-6 shadow-soft"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-center"><div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Onboarding Journey</p><h2 className="mt-2 text-2xl font-semibold">Complete employee onboarding</h2><div className="mt-5 grid gap-3">{steps.map((step) => <div key={step.label} className="flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${step.done ? 'bg-emerald-500 text-white' : 'border border-line bg-paper text-zinc-400'}`}>{step.done ? <Check size={15} /> : <span className="h-2 w-2 rounded-full bg-current" />}</span><span className={step.done ? 'font-medium' : 'text-zinc-500'}>{step.label}</span></div>)}</div></div><button disabled={!ready} className="h-11 rounded-lg bg-forest px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" onClick={confirm}>Confirm completion · +100 XP</button></div></section>;
}

function IntegrationBadge({ label, connected, icon }: { label: string; connected: boolean; icon: ReactNode }) {
  return <span className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-line bg-mist text-zinc-500'}`}>{icon}<span>{label}</span><span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-zinc-300'}`} /></span>;
}

function AdminOverviewTab({ member, records, avatarUrl, upwork, updateMember }: { member: WorkspaceMember; records: WorkRecord[]; avatarUrl: string; upwork: UpworkSnapshot; updateMember: (changes: Partial<WorkspaceMember>) => void }) {
  const partner = isFrPartnersConnected(member);
  const index = calculatePartnerQualityIndex(member, upwork, openExplanationRequestCount(records, member.id));
  const health = Math.max(0, 3 - member.strikeSystem);
  const trackedHours = upwork.timeEntries.reduce((total, entry) => total + entry.hours, 0);
  const activeContract = upwork.contracts.find((contract) => contract.status === 'Active');
  return <div className="grid gap-5">
    <OnboardingProgressCard member={member} updateMember={updateMember} />
    <section className="rounded-xl border border-line bg-paper p-6 shadow-soft"><h2 className="text-xl font-semibold">Contact Information</h2><div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">{[[Mail, 'Personal Email', member.personalEmail], [ShieldCheck, 'Entra ID', member.entraEmail], [Phone, 'Phone', member.phoneNumber], [MessageCircle, 'Slack', member.slackTag ?? ''], [MapPin, 'Time Zone', member.timeZone]].map(([Icon, label, value]) => { const ContactIcon = Icon as LucideIcon; return <div key={String(label)} className="flex gap-3"><ContactIcon className="mt-0.5 text-zinc-400" size={18} /><div><p className="text-xs font-medium text-zinc-500">{String(label)}</p><p className="mt-1 text-sm font-semibold">{String(value || 'Not provided')}</p></div></div>; })}</div></section>
    <section className="rounded-xl border border-line bg-paper p-6 shadow-soft"><h2 className="text-xl font-semibold">Integrations</h2><div className="mt-4 flex flex-wrap gap-3"><IntegrationBadge label="Microsoft Entra ID" connected={Boolean(member.entraSetupCompleted)} icon={<img className="h-5 w-5" src={ENTRA_ICON} alt="" />} /><IntegrationBadge label="Upwork" connected={upwork.connected} icon={<span className="text-xs font-black">up</span>} /><IntegrationBadge label="GitHub" connected={Boolean(member.githubConnected)} icon={<Github size={18} />} /><IntegrationBadge label="Steamworks" connected={Boolean(member.steamConnected)} icon={<img className="h-5 w-5 rounded bg-black object-contain" src={publicAsset('resources/logos/steam.jpg')} alt="" />} /></div></section>
    <div className={`grid gap-4 ${partner ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>{partner && <GaugeCard label="Partner Index" value={index} />}<GaugeCard label="Account Health" value={health * 33.33} displayValue={`${health}/3`} /><div className="kpi-card rounded-xl border border-line bg-paper p-5 shadow-soft"><Timer className="text-forest" size={25} /><p className="mt-8 text-4xl font-semibold">{formatPlannerTime(trackedHours)}</p><p className="mt-2 text-sm font-semibold text-zinc-600">Tracked Work Time</p></div><div className="kpi-card rounded-xl border border-line bg-paper p-5 shadow-soft md:col-span-1"><BriefcaseBusiness className="text-forest" size={25} /><p className="mt-8 text-xl font-semibold">{activeContract?.title || member.onboarding.contractType}</p><p className="mt-2 text-sm font-semibold text-zinc-600">Current Contract</p></div></div>
    <SkillsPanel member={member} editable admin updateMember={updateMember} />
  </div>;
}

function AdminContactTab({ member, updateMember }: { member: WorkspaceMember; updateMember: (changes: Partial<WorkspaceMember>) => void }) {
  return <section className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft"><div><h2 className="text-xl font-semibold">Identity & Contact</h2><p className="mt-1 text-sm text-zinc-500">Workspace, Microsoft and personal contact information.</p></div><div className="grid gap-4 md:grid-cols-2"><Field label="Employment ID" value={member.employmentId} onChange={(value) => updateMember({ employmentId: value })} /><Field label="Employment ID Expiry" type="date" value={member.employmentIdExpiresAt ?? ''} onChange={(value) => updateMember({ employmentIdExpiresAt: value })} /><Field label="Full Name" value={member.fullName} onChange={(value) => updateMember({ fullName: value })} /><Field label="Preferred Name" value={member.preferredName} onChange={(value) => updateMember({ preferredName: value })} /><EntraEmailField value={member.entraEmail} disabled={member.entraSetupCompleted} onChange={(value) => updateMember({ entraEmail: value })} /><Field label="Personal Email" value={member.personalEmail} onChange={(value) => updateMember({ personalEmail: value })} /><Field label="Phone Number" value={member.phoneNumber} onChange={(value) => updateMember({ phoneNumber: value })} /><Field label="Slack Tag" value={member.slackTag ?? ''} onChange={(value) => updateMember({ slackTag: value })} /><Field label="Street Address" value={member.addressStreet ?? member.addressOfResidence} onChange={(value) => updateMember({ addressStreet: value })} /><Field label="City" value={member.addressCity ?? ''} onChange={(value) => updateMember({ addressCity: value })} /><Field label="State or Province" value={member.addressState ?? ''} onChange={(value) => updateMember({ addressState: value })} /><Field label="Postal Code" value={member.addressPostalCode ?? ''} onChange={(value) => updateMember({ addressPostalCode: value })} /><Field label="Country or Region" value={member.addressCountry ?? ''} onChange={(value) => updateMember({ addressCountry: value })} /><Field label="Citizenship Country" value={member.citizenshipCountry} onChange={(value) => updateMember({ citizenshipCountry: value })} /><Field label="Time Zone" value={member.timeZone} onChange={(value) => updateMember({ timeZone: value })} /><Field label="Portfolio" value={member.portfolio} onChange={(value) => updateMember({ portfolio: value })} /></div></section>;
}

function AdminDevicesTab({ member }: { member: WorkspaceMember }) {
  const [devices, setDevices] = useState<EntraDevice[]>([]);
  const [status, setStatus] = useState(member.entraEmail ? 'Loading Microsoft Entra devices...' : 'This profile is not linked to Microsoft Entra ID.');

  async function loadDevices() {
    const token = getStoredSession()?.token;
    if (!token || !member.entraEmail) return;
    setStatus('Loading Microsoft Entra devices...');
    try {
      const nextDevices = await getEntraDevices(token, member.id);
      setDevices(nextDevices);
      setStatus(nextDevices.length ? '' : 'No registered devices were returned by Microsoft Entra ID.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Microsoft Entra devices could not be loaded.');
    }
  }

  useEffect(() => { void loadDevices(); }, [member.id, member.entraEmail]);

  return <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-xl font-semibold">Microsoft Entra Devices</h2><p className="mt-1 text-sm text-zinc-500">Registered work identities and their latest Entra status.</p></div>{member.entraEmail && <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void loadDevices()}><RefreshCw size={16} />Refresh</button>}</div>
    {status && <div className="mt-6 rounded-lg border border-line bg-mist p-4 text-sm text-zinc-600">{status}</div>}
    {!!devices.length && <div className="mt-6 grid gap-4 md:grid-cols-2">{devices.map((device) => <article key={device.id} className="rounded-xl border border-line bg-mist p-5"><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-paper text-forest"><MonitorSmartphone size={22} /></span><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{device.displayName || device.deviceId || 'Unnamed device'}</h3><p className="mt-1 text-sm text-zinc-500">{[device.operatingSystem, device.operatingSystemVersion].filter(Boolean).join(' ') || 'Operating system not reported'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${device.accountEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>{device.accountEnabled ? 'Enabled' : 'Disabled'}</span></div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-zinc-500">Trust type</p><p className="mt-1 font-medium">{device.trustType || 'Unknown'}</p></div><div><p className="text-xs text-zinc-500">Management</p><p className="mt-1 font-medium">{device.isManaged ? 'Managed' : 'Not managed'}</p></div><div><p className="text-xs text-zinc-500">Compliance</p><p className="mt-1 font-medium">{device.isCompliant ? 'Compliant' : 'Not reported'}</p></div><div><p className="text-xs text-zinc-500">Last sign-in</p><p className="mt-1 font-medium">{device.approximateLastSignInDateTime ? formatDateTime(device.approximateLastSignInDateTime) : 'Not reported'}</p></div></div></article>)}</div>}
  </section>;
}

const accessRoleOptions: Array<[string, string]> = [
  ['Admin', 'Full access across FLAT REALITY ENTERTAINMENT GROUP.'], ['HR', 'People, logs, requests and team metrics.'],
  ['Developer', 'Internal tools, Dev Portal and developer licenses.'], ['Community', 'Publishing, social media and community content.'],
  ['Creative', 'Games, project documents and creative spaces.'], ['Operations', 'Operational tools and workspace processes.'], ['Other', 'Basic workspace access.'],
];

function AdminAccessRoleTab({ member, updateMember, setMembers, impersonateMember, resetMemberPassword }: { member: WorkspaceMember; updateMember: (changes: Partial<WorkspaceMember>) => void; setMembers: Dispatch<SetStateAction<WorkspaceMember[]>>; impersonateMember: (memberId: string) => void | Promise<void>; resetMemberPassword: (memberId: string) => void | Promise<void> }) {
  function toggleProject(project: BenefitProgram) { updateMember({ benefitPrograms: member.benefitPrograms.includes(project) ? member.benefitPrograms.filter((item) => item !== project) : [...member.benefitPrograms, project] }); }
  function toggleRole(role: string) { const permissions = member.permissions ?? []; const next = permissions.includes(role) ? permissions.filter((item) => item !== role) : [...permissions, role]; updateMember({ permissions: next, isAdmin: next.includes('Admin') }); }
  function erase(label: string) { if (window.confirm(`${label} ${displayName(member)}? This currently removes the Workspace profile.`)) setMembers((items) => items.filter((item) => item.id !== member.id)); }
  return <div className="grid gap-5"><section className="rounded-xl border border-line bg-paper p-6 shadow-soft"><h2 className="text-xl font-semibold">Assigned Projects</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{benefitProgramOptions.map((project) => <button key={project} className={`rounded-lg border p-4 text-left font-semibold ${member.benefitPrograms.includes(project) ? 'border-forest bg-forest/5 text-forest' : 'border-line bg-mist'}`} onClick={() => toggleProject(project)}>{projectLabel(project)}</button>)}</div></section><section className="rounded-xl border border-line bg-paper p-6 shadow-soft"><h2 className="text-xl font-semibold">General Access</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{accessRoleOptions.map(([role, description]) => <label key={role} className="flex cursor-pointer gap-3 rounded-lg border border-line p-4"><input className="mt-1 accent-[#7F00FF]" type="checkbox" checked={(member.permissions ?? []).includes(role)} onChange={() => toggleRole(role)} /><span><span className="block font-semibold">{role}</span><span className="mt-1 block text-sm text-zinc-500">{description}</span></span></label>)}</div><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Job Role" value={member.jobRole} onChange={(value) => updateMember({ jobRole: value })} /><Field label="Seniority" value={member.seniority} onChange={(value) => updateMember({ seniority: value })} /></div></section><section className="rounded-xl border border-line bg-paper p-6 shadow-soft"><h2 className="text-xl font-semibold">Status</h2><p className="mt-1 text-sm text-zinc-500">Control availability and temporary account states.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{statusOptions.map((option) => { const Icon = option.icon; const selected = member.status === option.value; return <button key={option.value} className={`flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium transition ${selected ? 'border-forest bg-forest text-white' : 'border-line bg-mist text-zinc-600 hover:border-forest/40'}`} onClick={() => updateMember({ status: option.value, statusUntil: option.needsDate ? member.statusUntil : '' })}><Icon size={19} /><span>{option.label}</span></button>; })}</div>{statusOptions.find((option) => option.value === member.status)?.needsDate && <div className="mt-4 max-w-sm"><Field label={`${statusLabel(member.status)} end date`} type="date" value={member.statusUntil} onChange={(value) => updateMember({ statusUntil: value })} /></div>}</section><section className="rounded-xl border border-line bg-paper p-6 shadow-soft"><h2 className="text-xl font-semibold">Control Panel</h2><div className="mt-4 flex flex-wrap gap-3"><button className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white" onClick={() => void impersonateMember(member.id)}><KeyRound size={16} />Sign as this user</button><button className="h-10 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void resetMemberPassword(member.id)}>Reset Password</button><button className="h-10 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-600" onClick={() => erase('Erase')}>Erase User</button><button className="h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white" onClick={() => erase('Fire')}>Fire User</button></div></section></div>;
}

function AdminProfileTab({ member, updateMember, setMembers, impersonateMember, resetMemberPassword }: { member: WorkspaceMember; updateMember: (changes: Partial<WorkspaceMember>) => void; setMembers: Dispatch<SetStateAction<WorkspaceMember[]>>; impersonateMember: (memberId: string) => void | Promise<void>; resetMemberPassword: (memberId: string) => void | Promise<void> }) {
  return (
    <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
      <Section title="Profile">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Employment ID" value={member.employmentId} onChange={(value) => updateMember({ employmentId: value })} />
          <Field label="Full Name" value={member.fullName} onChange={(value) => updateMember({ fullName: value })} />
          <Field label="Preferred Name" value={member.preferredName} onChange={(value) => updateMember({ preferredName: value })} />
          <Field label="Work Start Date" type="date" value={member.workStartDate} onChange={(value) => updateMember({ workStartDate: value })} />
          <AccountTypeRadios value={member.contractType} onChange={(value) => updateMember({ contractType: value })} />
          <Field label="Address of Residence" value={member.addressOfResidence} onChange={(value) => updateMember({ addressOfResidence: value })} />
          <Field label="Street Address" value={member.addressStreet ?? ''} onChange={(value) => updateMember({ addressStreet: value })} />
          <Field label="City" value={member.addressCity ?? ''} onChange={(value) => updateMember({ addressCity: value })} />
          <Field label="State or Province" value={member.addressState ?? ''} onChange={(value) => updateMember({ addressState: value })} />
          <Field label="Postal Code" value={member.addressPostalCode ?? ''} onChange={(value) => updateMember({ addressPostalCode: value })} />
          <Field label="Country or Region" value={member.addressCountry ?? ''} onChange={(value) => updateMember({ addressCountry: value })} />
          <Field label="Citizenship Country" value={member.citizenshipCountry} onChange={(value) => updateMember({ citizenshipCountry: value })} />
          <Field label="Employment ID Expiry Date" type="date" value={member.employmentIdExpiresAt ?? ''} onChange={(value) => updateMember({ employmentIdExpiresAt: value })} />
          <Field label="Personal Email" value={member.personalEmail} onChange={(value) => updateMember({ personalEmail: value })} />
          <Field label="Job Role" value={member.jobRole} onChange={(value) => updateMember({ jobRole: value })} />
          <EntraEmailField value={member.entraEmail} disabled={member.entraSetupCompleted} onChange={(value) => updateMember({ entraEmail: value })} />
          {member.entraObjectId && <Field label="Entra Object ID" value={member.entraObjectId} disabled onChange={() => undefined} />}
          <Field label="Estimated Hours" value={member.estimatedHours} onChange={(value) => updateMember({ estimatedHours: value })} />
          <Field label="Phone Number" value={member.phoneNumber} onChange={(value) => updateMember({ phoneNumber: value })} />
          <Field label="Slack Tag" value={member.slackTag ?? ''} onChange={(value) => updateMember({ slackTag: value })} />
          <Field label="Time Zone" value={member.timeZone} onChange={(value) => updateMember({ timeZone: value })} />
          <Field label="Portfolio" value={member.portfolio} onChange={(value) => updateMember({ portfolio: value })} />
          {isFrPartnersConnected(member) && <Field label="Upwork Profile" value={member.upworkUrl} onChange={(value) => updateMember({ upworkUrl: value })} />}
          <Field label="Rate" value={member.rate} onChange={(value) => updateMember({ rate: value })} />
          <Field label="Endorsed Skills" value={(member.endorsedSkills ?? member.skills ?? []).join(', ')} onChange={(value) => { const skills = value.split(',').map((item) => item.trim()).filter(Boolean); updateMember({ skills, endorsedSkills: skills }); }} />
          <Field label="Languages" value={member.languages} onChange={(value) => updateMember({ languages: value })} />
          <Field label="Software" value={member.software} onChange={(value) => updateMember({ software: value })} />
          <Field label="Seniority" value={member.seniority} onChange={(value) => updateMember({ seniority: value })} />
        </div>
      </Section>
      <Section title="Change Status">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {statusOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = member.status === option.value;
            return (
              <button key={option.value} className={`flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium ${isSelected ? 'border-forest bg-forest text-white' : 'border-line bg-white text-zinc-600'}`} onClick={() => updateMember({ status: option.value, statusUntil: option.needsDate ? member.statusUntil : '' })}>
                <Icon size={19} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
        {statusOptions.find((option) => option.value === member.status)?.needsDate && <Field label={`${statusLabel(member.status)} end date`} type="date" value={member.statusUntil} onChange={(value) => updateMember({ statusUntil: value })} />}
      </Section>
      <Section title="Debug">
        <div className="flex flex-wrap gap-3">
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium text-zinc-700" onClick={() => void resetMemberPassword(member.id)}>
            <RotateCcw size={16} />
            Reset Password
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-3 text-sm font-medium text-white" onClick={() => void impersonateMember(member.id)}>
            <KeyRound size={16} />
            Sign In As This User
          </button>
        </div>
      </Section>
      <button className="justify-self-start rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600" onClick={() => setMembers((items) => items.filter((item) => item.id !== member.id))}>
        Delete User
      </button>
    </div>
  );
}

function AdminScheduleTab({ member, updateMember }: { member: WorkspaceMember; updateMember: (changes: Partial<WorkspaceMember>) => void }) {
  return (
    <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
      <Section title="Experiments">
        <p className="text-sm text-zinc-500">Enable experimental Workspace modules for this employee.</p>
        <label className="flex h-11 items-center gap-3 rounded-lg border border-line px-3 text-sm font-medium text-zinc-600">
          <input type="checkbox" checked={member.scheduleEnabled} onChange={(event) => updateMember({ scheduleEnabled: event.target.checked })} />
          Enable Schedule Module (Beta)
        </label>
      </Section>
    </div>
  );
}

function AdminRecordsTab({ member, records, setWorkRecords }: { member: WorkspaceMember; records: WorkRecord[]; setWorkRecords: Dispatch<SetStateAction<WorkRecord[]>> }) {
  const [type, setType] = useState<WorkRecordType>('standard');
  const [date, setDate] = useState(today());
  const [text, setText] = useState('');

  function addRecord() {
    if (!text.trim()) return;
    setWorkRecords((items) => [
      ...items,
      {
        id: `record-${Date.now()}`,
        memberId: member.id,
        type,
        date: type === 'explanation_request' ? '' : date,
        text,
        expiresAt: type === 'strike' ? addMonths(date, 6) : undefined,
      },
    ]);
    setType('standard');
    setDate(today());
    setText('');
  }

  return (
    <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
      <Section title="Create Record">
        <div className="grid gap-4 md:grid-cols-[180px_180px_1fr_auto] md:items-end">
          <SelectField<WorkRecordType> label="Type" value={type} options={['standard', 'positive', 'strike', 'negative', 'explanation_request']} onChange={setType} />
          {type !== 'explanation_request' && <Field label="Date" type="date" value={date} onChange={setDate} />}
          <Field label="Record text" value={text} onChange={setText} />
          <button className="h-11 rounded-lg bg-forest px-4 text-sm font-medium text-white" onClick={addRecord}>Add</button>
        </div>
        <Field label="Strike System" type="number" value={member.strikeSystem} disabled onChange={() => undefined} />
      </Section>
      <Section title="Records">
        <div className="grid gap-3">
          {sortRecordsNewestFirst(records).map((record) => {
            const style = recordStyle(record.type);
            if (record.type === 'explanation_request') {
              return (
                <div key={record.id} className="rounded-xl border border-red-600 bg-red-600 p-4 text-white">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Request explanation</p>
                      <p className="mt-2 text-white">{record.text}</p>
                      {record.explanationText ? (
                        <div className="mt-4 rounded-lg bg-white/10 p-3">
                          <p className="text-sm font-semibold">Submitted explanation</p>
                          <p className="mt-2 text-sm text-white/85">{record.explanationText}</p>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-white/75">Waiting for user response.</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {record.explanationText && (
                        <>
                          <button className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-600" onClick={() => setWorkRecords((items) => items.filter((item) => item.id !== record.id))}>
                            Accept
                          </button>
                          <button className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white" onClick={() => setWorkRecords((items) => items.map((item) => (item.id === record.id ? { ...item, type: 'standard', date: today(), text: `${item.text} Explanation rejected: ${item.explanationText ?? ''}` } : item)))}>
                            Reject
                          </button>
                        </>
                      )}
                      <button className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white" onClick={() => setWorkRecords((items) => items.filter((item) => item.id !== record.id))}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={record.id} className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-500">{style.icon} {formatDate(record.date)} · {recordTypes.find((item) => item.value === record.type)?.label}</p>
                    <p className="mt-2 text-zinc-700">{record.text}</p>
                    {record.expiresAt && <p className="mt-2 text-sm text-zinc-500">Expires: {formatDate(record.expiresAt)}</p>}
                  </div>
                  <button className="text-red-600" onClick={() => setWorkRecords((items) => items.filter((item) => item.id !== record.id))}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function AdminMemberLevelUpTab({ member, levels, rewards, updateMember }: { member: WorkspaceMember; levels: Level[]; rewards: Reward[]; updateMember: (changes: Partial<WorkspaceMember>) => void }) {
  return (
    <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
      <Field label="LevelUp! XP" type="number" value={member.xp} onChange={(value) => updateMember({ xp: Number(value) })} />
      <Section title="Issued Rewards">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-zinc-500">
                <th className="py-2">Issued</th>
                <th>Reward</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              {rewards.map((reward) => (
                <tr key={reward.id} className="border-b border-line">
                  <td className="py-3">
                    <input
                      type="checkbox"
                      checked={member.issuedRewardIds.includes(reward.id)}
                      onChange={(event) =>
                        updateMember({
                          issuedRewardIds: event.target.checked ? [...member.issuedRewardIds, reward.id] : member.issuedRewardIds.filter((id) => id !== reward.id),
                        })
                      }
                    />
                  </td>
                  <td>{reward.rewardName}</td>
                  <td>{levels.find((level) => level.id === reward.levelId)?.name ?? 'Unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function AdminMemberPartnersTab({ member, upwork, message }: { member: WorkspaceMember; upwork: UpworkSnapshot; message: string }) {
  const [retainer, setRetainer] = useState<RetainerSnapshot | null>(null);
  const [retainerMessage, setRetainerMessage] = useState('Loading Retainer+ assignments...');

  async function loadRetainers() {
    const token = getStoredSession()?.token;
    if (!token) return;
    try {
      setRetainer(await getRetainerSnapshot(token));
      setRetainerMessage('');
    } catch (error) {
      setRetainerMessage(error instanceof Error ? error.message : 'Retainer+ assignments could not be loaded.');
    }
  }

  async function toggleAssignment(inquiryId: string, assigned: boolean) {
    const token = getStoredSession()?.token;
    const inquiry = retainer?.inquiries.find((item) => item.id === inquiryId);
    if (!token || !inquiry) return;
    const assigneeIds = assigned ? [...new Set([...inquiry.assigneeIds, member.id])] : inquiry.assigneeIds.filter((id) => id !== member.id);
    try {
      setRetainer(await updateRetainerInquiry(token, inquiry.id, inquiry.status, assigneeIds));
      setRetainerMessage('Assignment saved.');
    } catch (error) {
      setRetainerMessage(error instanceof Error ? error.message : 'Assignment could not be saved.');
    }
  }

  useEffect(() => { void loadRetainers(); }, [member.id]);

  return (
    <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
      <Section title="Retainer+ Assignments">
        {retainerMessage && <p className="text-sm text-zinc-500">{retainerMessage}</p>}
        <div className="grid gap-3">
          {retainer?.inquiries.filter((inquiry) => !['lost', 'won', 'spam'].includes(inquiry.status)).map((inquiry) => (
            <label key={inquiry.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-mist p-4">
              <input className="mt-1 accent-[#7F00FF]" type="checkbox" checked={inquiry.assigneeIds.includes(member.id)} onChange={(event) => void toggleAssignment(inquiry.id, event.target.checked)} />
              <span><span className="block font-semibold">{inquiry.reference} · {inquiry.name}</span><span className="mt-1 block text-sm text-zinc-500">{inquiry.organization || 'Independent client'} · {inquiry.status}</span></span>
            </label>
          ))}
          {retainer && !retainer.inquiries.some((inquiry) => !['lost', 'won', 'spam'].includes(inquiry.status)) && <p className="text-sm text-zinc-500">No open Retainer+ inquiries.</p>}
        </div>
      </Section>
      <Section title="Partners™">
        <div className="rounded-xl border border-line bg-mist p-4">
          <div>
            <p className="font-semibold">Upwork Connection</p>
            <p className="mt-1 text-sm text-zinc-600">{message || upwork.message}</p>
            {upwork.lastSyncedAt && <p className="mt-2 text-xs text-zinc-500">Last synchronized: {formatDateTime(upwork.lastSyncedAt)}</p>}
          </div>
        </div>
        {upwork.profile && (
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Role" value={upwork.profile.title || 'Not provided'} />
            <MetricCard label="Rate" value={formatUpworkMoney(upwork.profile.rate)} />
            <div className="rounded-lg border border-line bg-mist p-4"><p className="text-xs font-medium uppercase tracking-[0.1em] text-zinc-500">Profile</p>{upwork.profile.url ? <a className="mt-2 inline-flex items-center gap-1 font-semibold text-forest" href={upwork.profile.url} target="_blank" rel="noreferrer">Open Upwork <ExternalLink size={15} /></a> : <p className="mt-2 font-semibold">Not provided</p>}</div>
          </div>
        )}
      </Section>
      <Section title="Contracts">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-sm">
            <thead><tr className="border-b border-line text-left text-zinc-500"><th className="py-3">Name</th><th>Type</th><th>Rate</th><th>Weekly Limit</th><th>Status</th><th>Start</th><th>End</th></tr></thead>
            <tbody>{upwork.contracts.map((contract) => <tr key={contract.id} className="border-b border-line"><td className="py-3 font-medium">{contract.title} (UPWORK CONTRACT)</td><td>{contract.type}</td><td>{formatUpworkMoney(contract.rate)}</td><td>{contract.weeklyLimit === null ? '—' : `${contract.weeklyLimit}h`}</td><td>{contract.status}</td><td>{formatDate(contract.startDate)}</td><td>{formatDate(contract.endDate)}</td></tr>)}</tbody>
          </table>
          {!upwork.contracts.length && <p className="py-4 text-sm text-zinc-500">No synchronized contracts yet.</p>}
        </div>
      </Section>
    </div>
  );
}

function RetainerAdmin() {
  const [snapshot, setSnapshot] = useState<RetainerSnapshot | null>(null);
  const [tab, setTab] = useState<'inquiries' | 'catalogue'>('inquiries');
  const [message, setMessage] = useState('Loading Retainer+...');

  async function load() {
    const token = getStoredSession()?.token;
    if (!token) return;
    try { setSnapshot(await getRetainerSnapshot(token)); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Retainer+ could not be loaded.'); }
  }

  async function updateInquiry(inquiryId: string, status: string, assigneeIds: string[]) {
    const token = getStoredSession()?.token;
    if (!token) return;
    try { setSnapshot(await updateRetainerInquiry(token, inquiryId, status, assigneeIds)); setMessage('Inquiry saved.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Inquiry could not be saved.'); }
  }

  async function saveOffering(offering: RetainerOffering) {
    const token = getStoredSession()?.token;
    if (!token) return;
    try { setSnapshot(await saveRetainerOffering(token, offering)); setMessage('Catalogue and public availability synchronized.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Offering could not be saved.'); }
  }

  function patchOffering(id: string, changes: Partial<RetainerOffering>) {
    setSnapshot((current) => current ? { ...current, offerings: current.offerings.map((item) => item.id === id ? { ...item, ...changes } : item) } : current);
  }

  function addOffering() {
    const id = `new-offering-${Date.now()}`;
    const offering: RetainerOffering = { id, type: 'specialist', category: 'Production', title: 'New Offering', description: '', tags: [], roles: [], published: false, staffingRules: { requiredSkills: [], requiredRoles: [] }, internalRateEur: null, availability: 'unknown', reasonCode: 'staffing_rules_required', checkedAt: '', updatedAt: '' };
    setSnapshot((current) => current ? { ...current, offerings: [...current.offerings, offering] } : current);
  }

  useEffect(() => { void load(); }, []);
  const statuses = ['new', 'reviewing', 'contacted', 'proposal', 'won', 'lost', 'spam'];

  return <div className="grid gap-6">
    <section className="rounded-xl border border-line bg-paper p-6 shadow-soft"><p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Partners™</p><div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-3xl font-semibold">Retainer+</h1><p className="mt-2 text-sm text-zinc-500">Private inquiry operations and public catalogue availability.</p></div><button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void load()}><RefreshCw size={16} />Refresh</button></div><div className="mt-5 flex gap-2">{(['inquiries', 'catalogue'] as const).map((item) => <button key={item} className={`h-10 rounded-lg px-4 text-sm font-semibold capitalize ${tab === item ? 'bg-ink text-white' : 'bg-mist text-zinc-600'}`} onClick={() => setTab(item)}>{item}</button>)}</div>{message && <p className="mt-4 text-sm text-zinc-500">{message}</p>}</section>
    {tab === 'inquiries' ? <div className="grid gap-4">{snapshot?.inquiries.map((inquiry) => <article key={inquiry.id} className="rounded-xl border border-line bg-paper p-5 shadow-soft"><div className="flex flex-col justify-between gap-4 lg:flex-row"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-forest">{inquiry.reference}</p><h2 className="mt-2 text-xl font-semibold">{inquiry.name}{inquiry.organization ? ` · ${inquiry.organization}` : ''}</h2><a className="mt-1 block text-sm text-forest" href={`mailto:${inquiry.email}`}>{inquiry.email}</a></div><select className="h-10 rounded-lg border border-line bg-paper px-3 text-sm font-semibold" value={inquiry.status} onChange={(event) => void updateInquiry(inquiry.id, event.target.value, inquiry.assigneeIds)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{inquiry.projectDescription}</p><div className="mt-4 grid gap-2 rounded-lg bg-mist p-4 text-sm"><p><b>Services:</b> {inquiry.selectedServices.join(', ') || 'Custom team'}</p><p><b>Budget:</b> {inquiry.budgetRange || 'Not provided'} · <b>Timeline:</b> {inquiry.timeline || 'Not provided'}</p><p><b>Consent:</b> {inquiry.privacyAcknowledged ? `Confirmed (${inquiry.privacyNoticeVersion})` : 'Missing'} · Marketing {inquiry.marketingConsent ? 'yes' : 'no'}</p></div><fieldset className="mt-4"><legend className="text-sm font-semibold">Assignments</legend><div className="mt-2 flex flex-wrap gap-2">{snapshot.partners.map((partner) => { const assigned = inquiry.assigneeIds.includes(partner.id); return <label key={partner.id} className={`cursor-pointer rounded-full border px-3 py-2 text-sm ${assigned ? 'border-forest bg-forest/10 text-forest' : 'border-line bg-paper text-zinc-600'}`}><input className="sr-only" type="checkbox" checked={assigned} onChange={(event) => void updateInquiry(inquiry.id, inquiry.status, event.target.checked ? [...inquiry.assigneeIds, partner.id] : inquiry.assigneeIds.filter((id) => id !== partner.id))} />{partner.name} · {partner.partnerStatus === 'working_hours' ? 'Busy' : partner.partnerStatus}</label>})}</div></fieldset></article>)}{snapshot && !snapshot.inquiries.length && <p className="rounded-xl border border-line bg-paper p-6 text-sm text-zinc-500">No Retainer+ inquiries yet.</p>}</div> : <div className="grid gap-4"><button className="inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-forest px-4 text-sm font-semibold text-white" onClick={addOffering}><Plus size={16} />Add offering</button>{snapshot?.offerings.map((offering) => <article key={offering.id} className="rounded-xl border border-line bg-paper p-5 shadow-soft"><div className="grid gap-4 md:grid-cols-2"><Field label="Title" value={offering.title} onChange={(value) => patchOffering(offering.id, { title: value })} /><Field label="Category" value={offering.category} onChange={(value) => patchOffering(offering.id, { category: value })} /><SelectField label="Type" value={offering.type} options={['specialist', 'team', 'capacity']} onChange={(value) => patchOffering(offering.id, { type: value as RetainerOffering['type'] })} /><Field label="Private Internal Rate (€)" type="number" value={offering.internalRateEur ?? ''} onChange={(value) => patchOffering(offering.id, { internalRateEur: value === '' ? null : Number(value) })} /><div className="md:col-span-2"><Field label="Public Description" value={offering.description} onChange={(value) => patchOffering(offering.id, { description: value })} /></div><Field label="Public Tags (comma separated)" value={offering.tags.join(', ')} onChange={(value) => patchOffering(offering.id, { tags: value.split(',').map((item) => item.trim()).filter(Boolean) })} /><Field label="Public Team Roles (comma separated)" value={offering.roles.join(', ')} onChange={(value) => patchOffering(offering.id, { roles: value.split(',').map((item) => item.trim()).filter(Boolean) })} /><Field label="Required Skills (private)" value={(offering.staffingRules.requiredSkills ?? []).join(', ')} onChange={(value) => patchOffering(offering.id, { staffingRules: { ...offering.staffingRules, requiredSkills: value.split(',').map((item) => item.trim()).filter(Boolean) } })} /><Field label="Required Roles (private)" value={(offering.staffingRules.requiredRoles ?? []).join(', ')} onChange={(value) => patchOffering(offering.id, { staffingRules: { ...offering.staffingRules, requiredRoles: value.split(',').map((item) => item.trim()).filter(Boolean) } })} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Availability: {offering.availability}</p><p className="text-xs text-zinc-500">{offering.reasonCode || 'Not evaluated'}</p></div><div className="flex items-center gap-3"><label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={offering.published} onChange={(event) => patchOffering(offering.id, { published: event.target.checked })} />Published</label>{offering.type === 'capacity' && <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(offering.staffingRules.confirmedReservableCapacity)} onChange={(event) => patchOffering(offering.id, { staffingRules: { ...offering.staffingRules, confirmedReservableCapacity: event.target.checked } })} />Capacity confirmed</label>}<button className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white" onClick={() => void saveOffering(offering)}>Save & sync</button></div></div></article>)}</div>}
  </div>;
}

function UpworkContractWizard({ member, onClose, onCreated }: { member: WorkspaceMember; onClose: () => void; onCreated: (snapshot: UpworkSnapshot) => void }) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<UpworkContractDraft>({
    memberId: member.id,
    title: '',
    type: 'hourly',
    rate: Number(String(member.rate).replace(/[^0-9.]/g, '')) || 0,
    weeklyLimit: parseEstimatedHours(member.estimatedHours),
    milestoneDescription: '',
    milestoneAmount: 0,
    startDate: today(),
    endDate: '',
  });

  function set<K extends keyof UpworkContractDraft>(key: K, value: UpworkContractDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    const token = getStoredSession()?.token;
    if (!token) return;
    setIsSaving(true);
    setError('');
    try {
      const snapshot = await createUpworkContract(token, draft);
      onCreated(snapshot);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The Upwork contract could not be prepared.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/55 p-4">
      <section className="w-full max-w-2xl rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Upwork Contract Wizard · Step {step} of 2</p>
        <h2 className="mt-2 text-3xl font-semibold">Create Upwork Contract</h2>
        <p className="mt-2 text-sm text-zinc-600">For {displayName(member)}. Active hourly limits stay aligned with Estimated Hours ({draft.weeklyLimit || 0}h).</p>
        {step === 1 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Contract Name" value={draft.title} onChange={(value) => set('title', value)} />
            <SelectField<'hourly' | 'fixed-price'> label="Billing Type" value={draft.type} options={['hourly', 'fixed-price']} onChange={(value) => set('type', value)} />
            <Field label={draft.type === 'hourly' ? 'Hourly Rate ($)' : 'Contract Amount ($)'} type="number" value={draft.rate} onChange={(value) => set('rate', Number(value))} />
            {draft.type === 'hourly' && <Field label="Weekly Limit" type="number" value={draft.weeklyLimit} disabled onChange={() => undefined} />}
            <Field label="Start Date" type="date" value={draft.startDate} onChange={(value) => set('startDate', value)} />
            <Field label="End Date" type="date" value={draft.endDate} onChange={(value) => set('endDate', value)} />
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {draft.type === 'fixed-price' && <><Field label="First Milestone" value={draft.milestoneDescription} onChange={(value) => set('milestoneDescription', value)} /><Field label="Milestone Amount ($)" type="number" value={draft.milestoneAmount} onChange={(value) => set('milestoneAmount', Number(value))} /></>}
            <div className="rounded-xl border border-line bg-mist p-4"><p className="font-semibold">{draft.title || 'Untitled Contract'} (UPWORK CONTRACT)</p><p className="mt-2 text-sm text-zinc-600">{draft.type === 'hourly' ? `${formatUpworkMoney({ amount: draft.rate, currency: 'USD' })}/hour · ${draft.weeklyLimit}h weekly limit` : `${formatUpworkMoney({ amount: draft.rate, currency: 'USD' })} fixed price`}</p></div>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button className="h-11 rounded-lg border border-line bg-paper px-4 text-sm font-medium" onClick={onClose}>Cancel</button>
          {step === 2 && <button className="h-11 rounded-lg border border-line bg-paper px-4 text-sm font-medium" onClick={() => setStep(1)}>Back</button>}
          {step === 1 ? <button className="h-11 rounded-lg bg-forest px-5 text-sm font-semibold text-white" disabled={!draft.title.trim()} onClick={() => setStep(2)}>Continue</button> : <button className="h-11 rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={isSaving} onClick={() => void submit()}>{isSaving ? 'Preparing...' : 'Prepare Upwork Contract'}</button>}
        </div>
      </section>
    </div>
  );
}

function AdminPaymentsTab({ member, upwork, updateMember }: { member: WorkspaceMember; upwork: UpworkSnapshot; updateMember: (changes: Partial<WorkspaceMember>) => void }) {
  function toggleBenefit(program: BenefitProgram) {
    updateMember({
      benefitPrograms: member.benefitPrograms.includes(program) ? member.benefitPrograms.filter((item) => item !== program) : [...member.benefitPrograms, program],
    });
  }

  const activeUpworkContract = isUpworkContract(member) && upwork.contracts.some((contract) => contract.status === 'Active');

  return (
    <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
      <div className="grid gap-4 md:grid-cols-2">
        {!activeUpworkContract && <Field label="IBAN" value={member.iban} onChange={(value) => updateMember({ iban: value })} />}
        <Field label="Withheld Balance (€)" type="number" value={member.withheldBalance} onChange={(value) => updateMember({ withheldBalance: Number(value) })} />
      </div>
      {activeUpworkContract && (
        <Section title="Upwork Payments">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Tracked Hours" value={formatPlannerTime(upwork.timeEntries.reduce((total, entry) => total + entry.hours, 0))} />
            <MetricCard label="Earnings" value={formatUpworkMoney(upwork.payments?.earnings)} />
            <MetricCard label="Fees" value={formatUpworkMoney(upwork.payments?.fees)} />
            <MetricCard label="Fixed-price Milestones" value={formatUpworkMoney(upwork.payments?.fixedPriceMilestones)} />
            <MetricCard label="Paid" value={formatUpworkMoney(upwork.payments?.paid)} />
            <MetricCard label="Pending" value={formatUpworkMoney(upwork.payments?.pending)} />
            <MetricCard label="Workspace Reconciliation" value={upwork.payments ? formatEuroAmount(upwork.payments.reconciledBalance) : '—'} />
          </div>
        </Section>
      )}
      <Section title="Connected Workflows">
        <div className="flex flex-wrap gap-2">
          {benefitProgramOptions.map((program) => (
            <button key={program} className={`rounded-lg border px-3 py-2 text-sm font-medium ${member.benefitPrograms.includes(program) ? 'border-forest bg-forest text-white' : 'border-line bg-white text-zinc-600'}`} onClick={() => toggleBenefit(program)}>
              {projectLabel(program)}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-line bg-mist p-4"><p className="text-xs font-medium uppercase tracking-[0.1em] text-zinc-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}

function AdminDocumentsTab({ member, updateMember, onStartUpworkContract }: { member: WorkspaceMember; updateMember: (changes: Partial<WorkspaceMember>) => void; onStartUpworkContract: () => void }) {
  function upsertDocument(documents: MemberDocument[], title: string, signed: boolean, url: string, category: 'onboarding' | 'other' = 'onboarding') {
    const existing = documents.find((doc) => doc.title === title);
    const nextDoc: MemberDocument = existing ? { ...existing, signed, url, category } : { id: `doc-${Date.now()}-${title}`, title, signed, url, category };
    return existing ? documents.map((doc) => (doc.id === existing.id ? nextDoc : doc)) : [...documents, nextDoc];
  }

  function updateOnboardingDocument(type: 'nda' | 'gdpr', checked: boolean, url: string) {
    const title = type === 'nda' ? 'NDA' : 'GDPR';
    updateMember({
      onboarding: {
        ...member.onboarding,
        ...(type === 'nda' ? { ndaSigned: checked, ndaUrl: url } : { gdprSigned: checked, gdprUrl: url }),
      },
      documents: upsertDocument(member.documents, title, checked, url),
    });
  }

  function addOtherDocument() {
    updateMember({ documents: [...member.documents, { id: `doc-${Date.now()}`, title: 'New Document', url: '', signed: true, category: 'other' }] });
  }

  const nda = member.documents.find((doc) => doc.title === 'NDA');
  const gdpr = member.documents.find((doc) => doc.title === 'GDPR');

  return (
    <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
      <Section title="Onboarding">
        <div className="grid gap-4">
          <DocumentCheck title="NDA Signed" checked={member.onboarding.ndaSigned} url={member.onboarding.ndaUrl || nda?.url || ''} onChange={(checked, url) => updateOnboardingDocument('nda', checked, url)} />
          <DocumentCheck title="GDPR Signed" checked={member.onboarding.gdprSigned} url={member.onboarding.gdprUrl || gdpr?.url || ''} onChange={(checked, url) => updateOnboardingDocument('gdpr', checked, url)} />
          <SelectField<OnboardingContractType> label="Contracts" value={member.onboarding.contractType} options={['None', 'MASTER SERVICE AGREEMENT', 'UPWORK CONTRACT']} onChange={(value) => {
            updateMember({ onboarding: { ...member.onboarding, contractType: value } });
            if (value === 'UPWORK CONTRACT') onStartUpworkContract();
          }} />
        </div>
      </Section>
      <Section title="Other Documents">
        <button className="justify-self-start rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white" onClick={addOtherDocument}>Add Document</button>
        <div className="grid gap-3">
          {member.documents.filter((doc) => doc.category === 'other').map((doc) => (
            <div key={doc.id} className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-[1fr_1fr_auto]">
              <input className="h-10 rounded-lg border border-line px-3 text-sm" value={doc.title} onChange={(event) => updateMember({ documents: member.documents.map((item) => (item.id === doc.id ? { ...item, title: event.target.value } : item)) })} />
              <input className="h-10 rounded-lg border border-line px-3 text-sm" value={doc.url} placeholder="Document URL" onChange={(event) => updateMember({ documents: member.documents.map((item) => (item.id === doc.id ? { ...item, url: event.target.value } : item)) })} />
              <button className="text-red-600" onClick={() => updateMember({ documents: member.documents.filter((item) => item.id !== doc.id) })}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function DocumentCheck({ title, checked, url, onChange }: { title: string; checked: boolean; url: string; onChange: (checked: boolean, url: string) => void }) {
  return (
    <div className="grid gap-3 rounded-lg border border-line p-3">
      <label className="flex items-center gap-3 text-sm font-medium text-zinc-600">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked, url)} />
        {title}
      </label>
      {checked && <input className="h-10 rounded-lg border border-line px-3 text-sm" value={url} placeholder="Document URL" onChange={(event) => onChange(checked, event.target.value)} />}
    </div>
  );
}

const partnerStatusOptions: Array<{ value: PartnerStatus; label: string; icon: LucideIcon; className: string }> = [
  { value: 'available', label: 'Available', icon: Zap, className: 'text-emerald-700' },
  { value: 'working_hours', label: 'Busy', icon: Clock, className: 'text-yellow-500' },
  { value: 'inactive', label: 'Inactive', icon: CircleOff, className: 'text-zinc-500' },
];

function PartnerStatusPicker({ member, onChange }: { member: WorkspaceMember; onChange: (status: PartnerStatus) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const status = partnerStatusOptions.find((option) => option.value === member.partnerStatus) ?? partnerStatusOptions[0];
  const StatusIcon = status.icon;

  return (
    <div className="relative">
      <button className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-left text-sm font-medium" type="button" onClick={() => setIsOpen((value) => !value)}>
        <span className="flex items-center gap-2">
          <StatusIcon size={16} className={status.className} />
          {status.label}
        </span>
        <span className="text-xs text-zinc-400">⌄</span>
      </button>
      {isOpen && (
        <div className="absolute left-0 top-11 z-20 grid w-48 gap-1 rounded-lg border border-line bg-paper p-1 shadow-soft">
          {partnerStatusOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-mist"
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <Icon size={16} className={option.className} />
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminPartners({ members, workRecords, setMembers, onBack }: { members: WorkspaceMember[]; workRecords: WorkRecord[]; setMembers: Dispatch<SetStateAction<WorkspaceMember[]>>; onBack: () => void }) {
  const partnerMembers = members.filter((member) => isFrPartnersConnected(member) && member.status !== 'suspended');
  const [snapshots, setSnapshots] = useState<Record<string, UpworkSnapshot>>({});

  useEffect(() => {
    const token = getStoredSession()?.token;
    if (!token || !isSupabaseConfigured) return;
    void Promise.all(partnerMembers.map(async (member) => {
      try {
        return [member.id, await getUpworkSnapshot(token, member.id)] as const;
      } catch {
        return [member.id, EMPTY_UPWORK_SNAPSHOT] as const;
      }
    })).then((items) => setSnapshots(Object.fromEntries(items)));
  }, [partnerMembers.map((member) => member.id).join('|')]);

  function updatePartner(memberId: string, changes: Partial<WorkspaceMember>) {
    setMembers((items) => items.map((member) => (member.id === memberId ? { ...member, ...changes } : member)));
  }

  function updatePartnerStatus(member: WorkspaceMember, status: PartnerStatus) {
    updatePartner(member.id, {
      partnerStatus: status,
      completedTasks: member.partnerStatus === 'working_hours' && status === 'available' ? member.completedTasks + 1 : member.completedTasks,
    });
  }

  const rankedPartners = partnerMembers
    .map((member) => {
      const snapshot = snapshots[member.id] ?? EMPTY_UPWORK_SNAPSHOT;
      const activeContract = snapshot.contracts.find((contract) => contract.status === 'Active');
      const effectiveStatus: PartnerStatus = activeContract ? 'working_hours' : member.partnerStatus;
      return { member, snapshot, activeContract, effectiveStatus, qualityIndex: calculatePartnerQualityIndex(member, snapshot, openExplanationRequestCount(workRecords, member.id)) };
    })
    .sort((left, right) => {
      const inactiveOrder = Number(left.effectiveStatus === 'inactive') - Number(right.effectiveStatus === 'inactive');
      return inactiveOrder
        || right.qualityIndex - left.qualityIndex
        || partnerStatusPriority(left.effectiveStatus) - partnerStatusPriority(right.effectiveStatus)
        || displayName(left.member).localeCompare(displayName(right.member));
    });

  return (
    <div className="grid gap-5">
      <BackButton onBack={onBack} />
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Partners</p>
        <h1 className="mt-3 text-3xl font-semibold">Partners™ Board</h1>
      </section>
      <section className="overflow-x-auto rounded-xl border border-line bg-paper p-4 shadow-soft">
        <table className="w-full min-w-[1580px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-zinc-500">
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Seniority</th>
              <th className="px-3 py-3">Time Zone</th>
              <th className="px-3 py-3">Rate</th>
              <th className="px-3 py-3">Active Contract</th>
              <th className="px-3 py-3">Tracked Hours</th>
              <th className="px-3 py-3">Index</th>
              <th className="px-3 py-3">Completed Tasks</th>
              <th className="px-3 py-3">Strikes</th>
              <th className="px-3 py-3">Upwork</th>
              <th className="px-3 py-3">Portfolio</th>
            </tr>
          </thead>
          <tbody>
            {rankedPartners.map(({ member, snapshot, activeContract, effectiveStatus, qualityIndex }) => {
              const effectiveMember = { ...member, partnerStatus: effectiveStatus };
              return (
                <tr key={member.id} className="border-b border-line align-middle">
                  <td className="px-3 py-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {displayName(member)}
                      <VerifiedMark member={member} size="sm" />
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <PartnerStatusPicker member={effectiveMember} onChange={(status) => updatePartnerStatus(member, status)} />
                  </td>
                  <td className="px-3 py-3">{member.jobRole || 'No role set'}</td>
                  <td className="px-3 py-3">{member.seniority || 'Not set'}</td>
                  <td className="px-3 py-3">{member.timeZone || 'Not set'}</td>
                  <td className="px-3 py-3">
                    <input className="h-10 w-28 rounded-lg border border-line bg-white px-2 text-sm outline-none" value={snapshot.profile?.rate ? formatUpworkMoney(snapshot.profile.rate) : member.rate} disabled={Boolean(snapshot.profile?.rate)} onChange={(event) => updatePartner(member.id, { rate: event.target.value })} />
                  </td>
                  <td className="px-3 py-3">{activeContract ? activeContract.title : '—'}</td>
                  <td className="px-3 py-3">{formatPlannerTime(snapshot.timeEntries.reduce((total, entry) => total + entry.hours, 0))}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex min-w-16 items-center justify-center rounded-full bg-forest/10 px-3 py-1.5 font-semibold text-forest" title="Calculated from reliability, completed work, tenure, profile readiness and verified Upwork activity.">
                      {qualityIndex}%
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <input className="h-10 w-20 rounded-lg border border-line bg-white px-2 text-sm outline-none" type="number" value={member.completedTasks} onChange={(event) => updatePartner(member.id, { completedTasks: Number(event.target.value) })} />
                  </td>
                  <td className="px-3 py-3">{member.strikeSystem}</td>
                  <td className="px-3 py-3">
                    {(snapshot.profile?.url || member.upworkUrl) ? <a className="font-medium text-forest" href={snapshot.profile?.url || member.upworkUrl} target="_blank" rel="noreferrer">Open</a> : <span className="text-zinc-400">Not set</span>}
                  </td>
                  <td className="px-3 py-3">
                    {member.portfolio ? <a className="font-medium text-forest" href={member.portfolio} target="_blank" rel="noreferrer">Open</a> : <span className="text-zinc-400">Not set</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!partnerMembers.length && <p className="p-4 text-sm text-zinc-500">No Partners™ connected yet.</p>}
      </section>
    </div>
  );
}

function AdminLogs({ members, onBack }: { members: WorkspaceMember[]; onBack: () => void }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [status, setStatus] = useState('Loading logs...');

  async function refreshLogs() {
    const token = getStoredSession()?.token;
    if (!token || !isSupabaseConfigured) {
      setLogs([]);
      setStatus('Logs are available after signing in with the live database.');
      return;
    }

    try {
      const nextLogs = await listWorkspaceAuditLogs(token, 200);
      setLogs(nextLogs);
      setStatus(`${nextLogs.length} latest events loaded. Events older than 90 days are removed automatically.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load logs.');
    }
  }

  useEffect(() => {
    void refreshLogs();
  }, []);

  function memberName(memberId?: string) {
    if (!memberId) return 'System';
    const member = members.find((item) => item.id === memberId);
    return member ? displayName(member) : memberId;
  }

  return (
    <div className="grid gap-5">
      <BackButton onBack={onBack} />
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Logs</p>
            <h1 className="mt-3 text-3xl font-semibold">Audit Console</h1>
            <p className="mt-2 text-sm text-zinc-600">{status}</p>
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-3 text-sm font-medium text-white" onClick={() => void refreshLogs()}>
            <RotateCcw size={16} />
            Refresh
          </button>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-line bg-zinc-950 p-4 font-mono text-sm text-zinc-100 shadow-soft">
        <div className="grid max-h-[620px] gap-1 overflow-auto">
          {logs.map((log) => (
            <div key={log.id} className="grid gap-1 border-b border-white/10 py-3 last:border-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-zinc-400">[{formatDateTime(log.createdAt)}]</span>
                <span className="text-fuchsia-300">{log.eventType}</span>
                <span className="text-zinc-300">actor={log.actorName || memberName(log.actorMemberId)}</span>
                {log.targetName && <span className="text-zinc-300">target={log.targetName}</span>}
              </div>
              <p className="whitespace-pre-wrap text-zinc-100">{log.summary}</p>
            </div>
          ))}
          {!logs.length && <p className="py-6 text-zinc-400">No audit events recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}

function AdminLevels({
  levels,
  rewards,
  setLevels,
  setRewards,
  onBack,
}: {
  levels: Level[];
  rewards: Reward[];
  setLevels: Dispatch<SetStateAction<Level[]>>;
  setRewards: Dispatch<SetStateAction<Reward[]>>;
  onBack: () => void;
}) {
  function addLevel() {
    setLevels((items) => [...items, { id: `level-${Date.now()}`, number: items.length + 1, name: `Level ${items.length + 1}`, xpRequired: 0, description: '' }]);
  }

  function addReward(levelId: string) {
    setRewards((items) => [...items, { id: `reward-${Date.now()}`, levelId, rewardName: 'New reward', description: '' }]);
  }

  return (
    <div className="grid gap-5">
      <BackButton onBack={onBack} />
      <div className="rounded-xl border border-line bg-paper p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">LevelUp! Configurator</h2>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-3 text-sm font-medium text-white" onClick={addLevel}>
            <Plus size={16} />
            Add Level
          </button>
        </div>
        <div className="mt-4 grid gap-4">
          {[...levels].sort((a, b) => a.xpRequired - b.xpRequired).map((level) => (
            <div key={level.id} className="grid gap-3 rounded-lg border border-line p-3">
              <div className="grid gap-2 md:grid-cols-[90px_1fr_120px]">
                <Field label="Number" type="number" value={level.number} onChange={(value) => setLevels((items) => items.map((item) => (item.id === level.id ? { ...item, number: Number(value) } : item)))} />
                <Field label="Name" value={level.name} onChange={(value) => setLevels((items) => items.map((item) => (item.id === level.id ? { ...item, name: value } : item)))} />
                <Field label="XP" type="number" value={level.xpRequired} onChange={(value) => setLevels((items) => items.map((item) => (item.id === level.id ? { ...item, xpRequired: Number(value) } : item)))} />
              </div>
              <Field label="Description" value={level.description} onChange={(value) => setLevels((items) => items.map((item) => (item.id === level.id ? { ...item, description: value } : item)))} />
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-600">Rewards</p>
                  <button className="text-sm font-medium text-forest" onClick={() => addReward(level.id)}>Add reward</button>
                </div>
                {rewards.filter((reward) => reward.levelId === level.id).map((reward) => (
                  <div key={reward.id} className="grid gap-2 rounded-lg bg-mist p-3">
                    <input className="h-9 rounded-lg border border-line px-3 text-sm" value={reward.rewardName} onChange={(event) => setRewards((items) => items.map((item) => (item.id === reward.id ? { ...item, rewardName: event.target.value } : item)))} />
                    <input className="h-9 rounded-lg border border-line px-3 text-sm" value={reward.description} onChange={(event) => setRewards((items) => items.map((item) => (item.id === reward.id ? { ...item, description: event.target.value } : item)))} />
                    <button className="justify-self-start text-sm font-medium text-red-600" onClick={() => setRewards((items) => items.filter((item) => item.id !== reward.id))}>Delete reward</button>
                  </div>
                ))}
              </div>
              <button className="justify-self-start text-sm font-medium text-red-600" onClick={() => setLevels((items) => items.filter((item) => item.id !== level.id))}>Delete level</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminGuides({ guidePages, setGuidePages, onBack }: { guidePages: GuidePage[]; setGuidePages: Dispatch<SetStateAction<GuidePage[]>>; onBack: () => void }) {
  function addPage() {
    setGuidePages((items) => [...items, { id: `guide-${Date.now()}`, title: 'New Guide Page', content: '# New Guide Page\n\nWrite text here.', order: items.length + 1 }]);
  }

  return (
    <div className="grid gap-5">
      <BackButton onBack={onBack} />
      <div className="rounded-xl border border-line bg-paper p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Guide Writting</h2>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-3 text-sm font-medium text-white" onClick={addPage}>
            <Plus size={16} />
            Add Page
          </button>
        </div>
        <div className="mt-4 grid gap-4">
          {[...guidePages].sort((a, b) => a.order - b.order).map((page) => (
            <div key={page.id} className="grid gap-3 rounded-lg border border-line p-3">
              <div className="grid gap-2 md:grid-cols-[90px_1fr]">
                <Field label="Order" type="number" value={page.order} onChange={(value) => setGuidePages((items) => items.map((item) => (item.id === page.id ? { ...item, order: Number(value) } : item)))} />
                <Field label="Title" value={page.title} onChange={(value) => setGuidePages((items) => items.map((item) => (item.id === page.id ? { ...item, title: value } : item)))} />
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-600">Text with markup</span>
                <textarea className="min-h-44 rounded-lg border border-line bg-white p-3 text-sm outline-none focus:border-forest focus:ring-4 focus:ring-forest/10" value={page.content} onChange={(event) => setGuidePages((items) => items.map((item) => (item.id === page.id ? { ...item, content: event.target.value } : item)))} />
              </label>
              <button className="justify-self-start text-sm font-medium text-red-600" onClick={() => setGuidePages((items) => items.filter((item) => item.id !== page.id))}>Delete page</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
