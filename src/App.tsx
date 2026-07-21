import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  Ban,
  Bell,
  BookOpen,
  Brain,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck2,
  FileText,
  Gift,
  Gavel,
  HeartHandshake,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  PenLine,
  Plus,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  TrendingUp,
  UserRound,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { benefitProgramOptions, emptyMember, initialGuidePages, initialJumpLinks, initialLevels, initialMembers, initialRewards } from './data';
import { isSupabaseConfigured } from './supabase';
import { defaultWorkspaceState, loadWorkspaceState, saveWorkspaceState } from './storage';
import type {
  BenefitProgram,
  ContractType,
  GuidePage,
  JumpLink,
  Level,
  MemberDocument,
  MemberStatus,
  OnboardingContractType,
  Reward,
  WorkRecord,
  WorkRecordType,
  WorkspaceMember,
  WorkspaceState,
} from './types';

type View = 'dashboard' | 'profile' | 'levelup' | 'admin' | 'guides' | 'workRecords' | 'signedDocuments' | 'benefits' | 'installs' | 'careerGrowth';
type AdminModule = 'home' | 'hr' | 'guides' | 'levelup';
type HrTab = 'profile' | 'records' | 'levelup' | 'payments' | 'documents';

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

function displayName(member: WorkspaceMember) {
  return member.preferredName.trim() || member.fullName || member.employmentId;
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
  const [jumpLinks] = useState<JumpLink[]>(initialJumpLinks);
  const [guidePages, setGuidePages] = useState<GuidePage[]>(initialGuidePages);
  const [employmentId, setEmploymentId] = useState('');
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [loginError, setLoginError] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading workspace data...');

  useEffect(() => {
    let isMounted = true;

    loadWorkspaceState()
      .then((state) => {
        if (!isMounted) return;
        const reconciled = reconcileWorkspace(state.members, state.workRecords);
        setMembers(reconciled.members);
        setLevels(state.levels.length ? state.levels : defaultWorkspaceState.levels);
        setRewards(state.rewards);
        setGuidePages(state.guidePages);
        setWorkRecords(reconciled.records);
        setSaveStatus(isSupabaseConfigured ? 'Database connected' : 'Saved locally in this browser');
      })
      .catch(() => {
        if (!isMounted) return;
        setSaveStatus('Using local workspace data');
      })
      .finally(() => {
        if (isMounted) setIsLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const state: WorkspaceState = { members, levels, rewards, guidePages, workRecords };
    saveWorkspaceState(state)
      .then(() => setSaveStatus(isSupabaseConfigured ? 'Saved to database' : 'Saved locally in this browser'))
      .catch(() => setSaveStatus('Could not save to database. Local copy is still saved.'));
  }, [members, levels, rewards, guidePages, workRecords, isLoaded]);

  const currentMember = members.find((member) => member.id === currentMemberId) ?? null;
  const currentLevel = currentMember ? getCurrentLevel(levels, currentMember.xp) : levels[0];
  const nextLevel = currentMember ? getNextLevel(levels, currentMember.xp) : null;
  const nextRewards = nextLevel ? rewards.filter((reward) => reward.levelId === nextLevel.id) : [];
  const previousXp = currentLevel?.xpRequired ?? 0;
  const nextXp = nextLevel?.xpRequired ?? Math.max(currentMember?.xp ?? 1, 1);
  const progress = currentMember ? Math.min(100, Math.round(((currentMember.xp - previousXp) / Math.max(nextXp - previousXp, 1)) * 100)) : 0;

  const navItems: Array<[View, LucideIcon, string]> = [
    ['dashboard', LayoutDashboard, 'Dashboard'],
    ['profile', UserRound, 'Profile'],
    ['levelup', Trophy, 'LevelUp!'],
    ['careerGrowth', TrendingUp, 'Career Growth'],
    ['guides', BookOpen, 'Guides'],
    ['benefits', HeartHandshake, 'Benefits'],
    ['installs', Download, 'Installs'],
  ];

  if (currentMember?.isAdmin) navItems.push(['admin', UsersRound, 'Admin']);

  function updateMembers(nextMembers: WorkspaceMember[], nextRecords = workRecords) {
    const reconciled = reconcileWorkspace(nextMembers, nextRecords);
    setMembers(reconciled.members);
    setWorkRecords(reconciled.records);
  }

  function updateWorkRecords(nextRecords: SetStateAction<WorkRecord[]>) {
    const records = typeof nextRecords === 'function' ? nextRecords(workRecords) : nextRecords;
    updateMembers(members, records);
  }

  function login() {
    const rawMember = members.find((item) => item.employmentId.toLowerCase() === employmentId.trim().toLowerCase());
    const member = rawMember ? normalizeMemberRuntime(rawMember) : null;
    if (!member) {
      setLoginError('Employment ID was not found.');
      return;
    }
    if (rawMember && rawMember.status !== member.status) {
      updateMembers(members.map((item) => (item.id === member.id ? member : item)));
    }
    if (member.status === 'suspended') {
      setLoginError('This workspace account is suspended.');
      return;
    }
    setCurrentMemberId(member.id);
    setView('dashboard');
    setLoginError('');
  }

  function updateCurrentMember(changes: Partial<WorkspaceMember>) {
    if (!currentMember) return;
    updateMembers(members.map((member) => (member.id === currentMember.id ? { ...member, ...changes } : member)));
  }

  if (!currentMember) {
    return (
      <main className="min-h-screen bg-mist px-5 py-8 text-ink">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl content-center gap-8">
          <div className="grid gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-white">
              <Sparkles size={24} />
            </div>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Flat Reality Entertainment Group</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-normal text-ink md:text-6xl">Workspace</h1>
            </div>
          </div>

          <div className="grid gap-4 rounded-xl border border-line bg-paper p-5 shadow-soft md:max-w-md">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-600">Employment ID</span>
              <input
                className="h-12 rounded-lg border border-line px-4 text-base outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
                value={employmentId}
                onChange={(event) => setEmploymentId(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && login()}
              />
            </label>
            {loginError && <p className="text-sm text-red-600">{loginError}</p>}
            <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-ink px-4 font-medium text-white transition hover:bg-zinc-700" onClick={login}>
              <BadgeCheck size={18} />
              Open Workspace
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-mist text-ink">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-4 lg:grid-cols-[250px_1fr] lg:px-6">
        <aside className="rounded-xl border border-line bg-paper p-4 shadow-soft lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)]">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-white">
              <Sparkles size={20} />
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

          <div className="mt-6 rounded-lg border border-line bg-mist p-3">
            <p className="text-sm font-medium">{displayName(currentMember)}</p>
            <p className="mt-1 text-xs text-zinc-500">{currentMember.employmentId} · €{Number(currentMember.withheldBalance ?? 0).toFixed(2)}</p>
            <p className="mt-3 text-xs text-zinc-500">{saveStatus}</p>
          </div>

          <button className="mt-4 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-600 hover:bg-mist" onClick={() => setCurrentMemberId(null)}>
            <LogOut size={17} />
            Sign out
          </button>
        </aside>

        <div className="grid gap-6">
          {view === 'dashboard' && (
            <Dashboard
              member={currentMember}
              currentLevel={currentLevel}
              nextLevel={nextLevel}
              nextRewards={nextRewards}
              progress={progress}
              jumpLinks={jumpLinks}
              workRecords={workRecords}
              setView={setView}
            />
          )}
          {view === 'profile' && <Profile member={currentMember} updateCurrentMember={updateCurrentMember} />}
          {view === 'levelup' && <LevelUp member={currentMember} levels={levels} rewards={rewards} />}
          {view === 'careerGrowth' && <CareerGrowth member={currentMember} />}
          {view === 'workRecords' && <WorkRecordsPage member={currentMember} records={workRecords.filter((record) => record.memberId === currentMember.id)} setWorkRecords={updateWorkRecords} />}
          {view === 'signedDocuments' && <SignedDocuments member={currentMember} />}
          {view === 'benefits' && <Placeholder title="Benefits" text="We are working on integrating this feature into Workspace!" />}
          {view === 'installs' && <Placeholder title="Installs" text="Install access will be added here later." />}
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
            />
          )}
        </div>
      </div>
    </main>
  );
}

function Dashboard({
  member,
  currentLevel,
  nextLevel,
  nextRewards,
  progress,
  jumpLinks,
  workRecords,
  setView,
}: {
  member: WorkspaceMember;
  currentLevel: Level;
  nextLevel: Level | null;
  nextRewards: Reward[];
  progress: number;
  jumpLinks: JumpLink[];
  workRecords: WorkRecord[];
  setView: (view: View) => void;
}) {
  const pendingUserRequest = workRecords.find((record) => record.memberId === member.id && record.type === 'explanation_request' && !record.explanationText);
  const unreadExplanationCount = member.isAdmin ? workRecords.filter((record) => record.type === 'explanation_request' && record.explanationText).length : 0;

  return (
    <>
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Flat Reality Entertainment Group</p>
        <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Welcome back, {displayName(member)}</h1>
      </section>

      {!member.onboarding.completed && (
        <section className="rounded-xl border border-forest bg-forest/5 p-6 shadow-soft">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl shadow-soft">👋</div>
            <div>
              <h2 className="text-2xl font-semibold">Complete onboarding</h2>
              <p className="mt-2 text-zinc-600">Earn 100 XP.</p>
            </div>
          </div>
        </section>
      )}

      {pendingUserRequest && (
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

      {unreadExplanationCount > 0 && (
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

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
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
      </section>

      <Section title="Jump To">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...jumpLinks].sort((a, b) => a.order - b.order).map((link) => {
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

function Profile({ member, updateCurrentMember }: { member: WorkspaceMember; updateCurrentMember: (changes: Partial<WorkspaceMember>) => void }) {
  return (
    <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Profile</p>
        <h1 className="mt-3 text-3xl font-semibold">{displayName(member)}</h1>
      </div>

      <Section title="Workspace Information">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Employment ID" value={member.employmentId} disabled onChange={() => undefined} />
          <Field label="Full Name" value={member.fullName} disabled onChange={() => undefined} />
          <Field label="Preferred Name" value={member.preferredName} onChange={(value) => updateCurrentMember({ preferredName: value })} />
          <Field label="Work Start Date" value={member.workStartDate} disabled onChange={() => undefined} />
          <Field label="Contract Type" value={member.contractType} disabled onChange={() => undefined} />
          <Field label="Job Role" value={member.jobRole} disabled onChange={() => undefined} />
          {member.contractType === 'CORE TEAM' && <Field label="Work Email" value={member.workEmail} disabled onChange={() => undefined} />}
          <Field label="Personal Email" value={member.personalEmail} disabled onChange={() => undefined} />
          <Field label="Phone Number" value={member.phoneNumber} onChange={(value) => updateCurrentMember({ phoneNumber: value })} />
          <Field label="Time Zone" value={member.timeZone} onChange={(value) => updateCurrentMember({ timeZone: value })} />
          <Field label="Portfolio" value={member.portfolio} onChange={(value) => updateCurrentMember({ portfolio: value })} />
          <Field label="Estimated Hours" value={member.estimatedHours} disabled onChange={() => undefined} />
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
          <p className="leading-7 text-zinc-600">To update payout information, edit your profile through the Supplier portal.</p>
          <a className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-white" href="https://forms.office.com/r/maSdSX94Ui" target="_blank" rel="noreferrer">
            Open Supplier Form
          </a>
        </div>
      </Section>

      <Section title="Additional Information">
        <div className="rounded-xl border border-line bg-mist p-4">
          <p className="leading-7 text-zinc-600">To update additional information, contact your manager.</p>
          <a className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-forest px-4 text-sm font-medium text-white" href="https://join.slack.com/t/flatrealityeu/shared_invite/zt-3eeknccsz-MWbN2vlNbRNwu3blGs11kw" target="_blank" rel="noreferrer">
            Open Slack
          </a>
        </div>
      </Section>
    </div>
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
}) {
  const [module, setModule] = useState<AdminModule>('home');

  if (module === 'hr') return <HrAdmin members={members} rewards={rewards} levels={levels} workRecords={workRecords} setMembers={setMembers} setWorkRecords={setWorkRecords} onBack={() => setModule('home')} />;
  if (module === 'guides') return <AdminGuides guidePages={guidePages} setGuidePages={setGuidePages} onBack={() => setModule('home')} />;
  if (module === 'levelup') return <AdminLevels levels={levels} rewards={rewards} setLevels={setLevels} setRewards={setRewards} onBack={() => setModule('home')} />;

  const modules: Array<[AdminModule, LucideIcon, string, string]> = [
    ['hr', UsersRound, 'HR', 'Users, contracts, documents, payments, statuses and work records.'],
    ['guides', BookOpen, 'Guide Writting', 'Create and edit workspace guide pages.'],
    ['levelup', Trophy, 'LevelUp! Configurator', 'Configure levels, XP requirements and rewards.'],
  ];

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Administration</p>
        <h1 className="mt-3 text-3xl font-semibold">Workspace Control</h1>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map(([key, Icon, title, description]) => (
          <button key={key} className="flex min-h-32 items-start gap-4 rounded-xl border border-line bg-paper p-5 text-left shadow-soft transition hover:-translate-y-0.5" onClick={() => setModule(key)}>
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
  onBack,
}: {
  members: WorkspaceMember[];
  rewards: Reward[];
  levels: Level[];
  workRecords: WorkRecord[];
  setMembers: Dispatch<SetStateAction<WorkspaceMember[]>>;
  setWorkRecords: Dispatch<SetStateAction<WorkRecord[]>>;
  onBack: () => void;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [tab, setTab] = useState<HrTab>('profile');
  const [search, setSearch] = useState('');
  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const filteredMembers = members.filter((member) => [member.fullName, member.preferredName, member.employmentId, member.jobRole].join(' ').toLowerCase().includes(search.toLowerCase()));

  function createUser() {
    const member: WorkspaceMember = {
      ...emptyMember,
      id: `member-${Date.now()}`,
      employmentId: `FR-${members.length + 1001}`,
      workStartDate: today(),
    };
    setMembers((items) => [...items, member]);
    setWorkRecords((items) => [...items, registrationRecord(member)]);
    setSelectedMemberId(member.id);
    setTab('profile');
  }

  function updateMember(changes: Partial<WorkspaceMember>) {
    if (!selectedMember) return;
    setMembers((items) => items.map((member) => (member.id === selectedMember.id ? { ...member, ...changes } : member)));
  }

  return (
    <div className="grid gap-6">
      <BackButton onBack={onBack} />
      {!selectedMember ? (
        <>
          <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">HR</p>
                <h1 className="mt-3 text-3xl font-semibold">People</h1>
              </div>
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white" onClick={createUser}>
                <Plus size={17} />
                Add User
              </button>
            </div>
            <label className="mt-5 flex h-11 items-center gap-3 rounded-lg border border-line px-3">
              <Search size={18} className="text-zinc-400" />
              <input className="w-full outline-none" placeholder="Search users" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </section>
          <PeopleGroup title="Core Team" members={filteredMembers.filter((member) => member.contractType === 'CORE TEAM')} onSelect={setSelectedMemberId} />
          <PeopleGroup title="Independent Contractors" members={filteredMembers.filter((member) => member.contractType === 'INDEPENDENT PARTNER')} onSelect={setSelectedMemberId} />
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
          onBack={() => setSelectedMemberId(null)}
        />
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
            <p className="font-semibold">{displayName(member)}</p>
            <p className="mt-1 text-sm text-zinc-500">{member.employmentId} - {member.jobRole || 'No role set'}</p>
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
  onBack: () => void;
}) {
  const tabs: Array<[HrTab, LucideIcon, string]> = [
    ['profile', UserRound, 'Profile'],
    ['records', ClipboardList, 'Work Records'],
    ['levelup', Trophy, 'LevelUp!'],
    ['payments', WalletCards, 'Payments'],
    ['documents', FileCheck2, 'Documents'],
  ];

  return (
    <div className="grid gap-5">
      <button className="justify-self-start rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-zinc-600" onClick={onBack}>
        Back to people
      </button>
      <section className="rounded-xl border border-line bg-paper p-5 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">HR Profile</p>
        <h1 className="mt-3 text-3xl font-semibold">{displayName(member)}</h1>
        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map(([key, Icon, label]) => (
            <button key={key} className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ${tab === key ? 'bg-forest text-white' : 'bg-mist text-zinc-600'}`} onClick={() => setTab(key)}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </section>
      {tab === 'profile' && <AdminProfileTab member={member} updateMember={updateMember} setMembers={setMembers} />}
      {tab === 'records' && <AdminRecordsTab member={member} records={records} setWorkRecords={setWorkRecords} />}
      {tab === 'levelup' && <AdminMemberLevelUpTab member={member} levels={levels} rewards={rewards} updateMember={updateMember} />}
      {tab === 'payments' && <AdminPaymentsTab member={member} updateMember={updateMember} />}
      {tab === 'documents' && <AdminDocumentsTab member={member} updateMember={updateMember} />}
    </div>
  );
}

function AdminProfileTab({ member, updateMember, setMembers }: { member: WorkspaceMember; updateMember: (changes: Partial<WorkspaceMember>) => void; setMembers: Dispatch<SetStateAction<WorkspaceMember[]>> }) {
  return (
    <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
      <Section title="Profile">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Employment ID" value={member.employmentId} onChange={(value) => updateMember({ employmentId: value })} />
          <Field label="Full Name" value={member.fullName} onChange={(value) => updateMember({ fullName: value })} />
          <Field label="Preferred Name" value={member.preferredName} onChange={(value) => updateMember({ preferredName: value })} />
          <Field label="Work Start Date" type="date" value={member.workStartDate} onChange={(value) => updateMember({ workStartDate: value })} />
          <SelectField<ContractType> label="Contract Type" value={member.contractType} options={['CORE TEAM', 'INDEPENDENT PARTNER']} onChange={(value) => updateMember({ contractType: value, workEmail: value === 'CORE TEAM' ? member.workEmail : '' })} />
          <Field label="Address of Residence" value={member.addressOfResidence} onChange={(value) => updateMember({ addressOfResidence: value })} />
          <Field label="Citizenship Country" value={member.citizenshipCountry} onChange={(value) => updateMember({ citizenshipCountry: value })} />
          <Field label="Personal Email" value={member.personalEmail} onChange={(value) => updateMember({ personalEmail: value })} />
          <Field label="Job Role" value={member.jobRole} onChange={(value) => updateMember({ jobRole: value })} />
          {member.contractType === 'CORE TEAM' && <Field label="Work Email" value={member.workEmail} onChange={(value) => updateMember({ workEmail: value })} />}
          <Field label="Estimated Hours" value={member.estimatedHours} onChange={(value) => updateMember({ estimatedHours: value })} />
          <Field label="Phone Number" value={member.phoneNumber} onChange={(value) => updateMember({ phoneNumber: value })} />
          <Field label="Time Zone" value={member.timeZone} onChange={(value) => updateMember({ timeZone: value })} />
          <Field label="Portfolio" value={member.portfolio} onChange={(value) => updateMember({ portfolio: value })} />
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
      <button className="justify-self-start rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600" onClick={() => setMembers((items) => items.filter((item) => item.id !== member.id))}>
        Delete User
      </button>
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

function AdminPaymentsTab({ member, updateMember }: { member: WorkspaceMember; updateMember: (changes: Partial<WorkspaceMember>) => void }) {
  function toggleBenefit(program: BenefitProgram) {
    updateMember({
      benefitPrograms: member.benefitPrograms.includes(program) ? member.benefitPrograms.filter((item) => item !== program) : [...member.benefitPrograms, program],
    });
  }

  return (
    <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="IBAN" value={member.iban} onChange={(value) => updateMember({ iban: value })} />
        <Field label="Withheld Balance (€)" type="number" value={member.withheldBalance} onChange={(value) => updateMember({ withheldBalance: Number(value) })} />
      </div>
      <Section title="Benefit Program">
        <div className="flex flex-wrap gap-2">
          {benefitProgramOptions.map((program) => (
            <button key={program} className={`rounded-lg border px-3 py-2 text-sm font-medium ${member.benefitPrograms.includes(program) ? 'border-forest bg-forest text-white' : 'border-line bg-white text-zinc-600'}`} onClick={() => toggleBenefit(program)}>
              {program}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function AdminDocumentsTab({ member, updateMember }: { member: WorkspaceMember; updateMember: (changes: Partial<WorkspaceMember>) => void }) {
  function setDoc(title: string, signed: boolean, url: string, category: 'onboarding' | 'other' = 'onboarding') {
    const existing = member.documents.find((doc) => doc.title === title);
    const nextDoc: MemberDocument = existing ? { ...existing, signed, url, category } : { id: `doc-${Date.now()}-${title}`, title, signed, url, category };
    updateMember({ documents: existing ? member.documents.map((doc) => (doc.id === existing.id ? nextDoc : doc)) : [...member.documents, nextDoc] });
  }

  function completeOnboarding(checked: boolean) {
    const xpBonus = checked && !member.onboarding.completedXpAwarded ? 100 : 0;
    updateMember({
      onboarding: { ...member.onboarding, completed: checked, completedXpAwarded: checked ? true : member.onboarding.completedXpAwarded },
      xp: member.xp + xpBonus,
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
          <DocumentCheck title="NDA Signed" checked={member.onboarding.ndaSigned} url={member.onboarding.ndaUrl || nda?.url || ''} onChange={(checked, url) => {
            updateMember({ onboarding: { ...member.onboarding, ndaSigned: checked, ndaUrl: url } });
            setDoc('NDA', checked, url);
          }} />
          <DocumentCheck title="GDPR Signed" checked={member.onboarding.gdprSigned} url={member.onboarding.gdprUrl || gdpr?.url || ''} onChange={(checked, url) => {
            updateMember({ onboarding: { ...member.onboarding, gdprSigned: checked, gdprUrl: url } });
            setDoc('GDPR', checked, url);
          }} />
          <label className="flex h-11 items-center gap-3 rounded-lg border border-line px-3 text-sm font-medium text-zinc-600">
            <input type="checkbox" checked={member.onboarding.completed} onChange={(event) => completeOnboarding(event.target.checked)} />
            Onboarding Completed (+100 XP once)
          </label>
          <SelectField<OnboardingContractType> label="Contract" value={member.onboarding.contractType} options={['None', 'MASTER SERVICE AGREEMENT']} onChange={(value) => updateMember({ onboarding: { ...member.onboarding, contractType: value } })} />
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
