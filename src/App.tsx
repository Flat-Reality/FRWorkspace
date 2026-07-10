import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  Ban,
  BookOpen,
  Brain,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Gift,
  HeartHandshake,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  UserRound,
  UsersRound,
} from 'lucide-react';
import {
  benefitProgramOptions,
  emptyMember,
  initialGuidePages,
  initialJumpLinks,
  initialLevels,
  initialMembers,
  initialRewards,
} from './data';
import { isSupabaseConfigured } from './supabase';
import { defaultWorkspaceState, loadWorkspaceState, saveWorkspaceState } from './storage';
import type { BenefitProgram, ContractType, GuidePage, JumpLink, Level, MemberStatus, OnboardingContractType, Reward, WorkspaceMember, WorkspaceState } from './types';

type View = 'dashboard' | 'profile' | 'rewards' | 'admin' | 'guides';

const iconMap: Record<string, LucideIcon> = {
  HeartHandshake,
  ShieldCheck,
  FileCheck2,
  ClipboardList,
  UserRound,
  BookOpen,
  Building2,
  Trophy,
};

const statusOptions: Array<{ value: MemberStatus; label: string; icon: LucideIcon; needsDate: boolean; blocksLogin: boolean }> = [
  { value: 'active', label: 'Active', icon: CheckCircle2, needsDate: false, blocksLogin: false },
  { value: 'suspended', label: 'Suspended', icon: Ban, needsDate: false, blocksLogin: true },
  { value: 'sick_leave', label: 'Sick Leave', icon: HeartPulse, needsDate: true, blocksLogin: false },
  { value: 'mental_health_days', label: 'Mental Health Days', icon: Brain, needsDate: true, blocksLogin: false },
  { value: 'paused', label: 'Paused', icon: CalendarClock, needsDate: true, blocksLogin: false },
];

function displayName(member: WorkspaceMember) {
  return member.preferredName.trim() || member.fullName || member.employmentId;
}

function getCurrentLevel(levels: Level[], xp: number) {
  return [...levels].sort((a, b) => b.xpRequired - a.xpRequired).find((level) => xp >= level.xpRequired) ?? levels[0];
}

function getNextLevel(levels: Level[], xp: number) {
  return [...levels].sort((a, b) => a.xpRequired - b.xpRequired).find((level) => level.xpRequired > xp) ?? null;
}

function getEffectiveMember(member: WorkspaceMember) {
  const statusUntil = member.statusUntil ?? '';

  if (statusUntil && ['sick_leave', 'mental_health_days', 'paused'].includes(member.status)) {
    const endDate = new Date(`${statusUntil}T23:59:59`);
    if (!Number.isNaN(endDate.getTime()) && endDate < new Date()) {
      return { ...member, status: 'active' as const, statusUntil: '' };
    }
  }

  return { ...member, statusUntil };
}

function statusLabel(status: MemberStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
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
  const [jumpLinks] = useState<JumpLink[]>(initialJumpLinks);
  const [guidePages, setGuidePages] = useState<GuidePage[]>(initialGuidePages);
  const [employmentId, setEmploymentId] = useState('');
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [loginError, setLoginError] = useState('');
  const [search, setSearch] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading workspace data...');

  useEffect(() => {
    let isMounted = true;

    loadWorkspaceState()
      .then((state) => {
        if (!isMounted) return;
        const normalizedMembers = state.members.map(getEffectiveMember);
        setMembers(normalizedMembers);
        setLevels(state.levels.length ? state.levels : defaultWorkspaceState.levels);
        setRewards(state.rewards);
        setGuidePages(state.guidePages);
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

    const state: WorkspaceState = { members, levels, rewards, guidePages };
    saveWorkspaceState(state)
      .then(() => setSaveStatus(isSupabaseConfigured ? 'Saved to database' : 'Saved locally in this browser'))
      .catch(() => setSaveStatus('Could not save to database. Local copy is still saved.'));
  }, [members, levels, rewards, guidePages, isLoaded]);

  const currentMember = members.find((member) => member.id === currentMemberId) ?? null;
  const currentLevel = currentMember ? getCurrentLevel(levels, currentMember.xp) : levels[0];
  const nextLevel = currentMember ? getNextLevel(levels, currentMember.xp) : null;
  const nextRewards = nextLevel ? rewards.filter((reward) => reward.levelId === nextLevel.id) : [];
  const xpToNext = nextLevel && currentMember ? nextLevel.xpRequired - currentMember.xp : 0;
  const previousXp = currentLevel?.xpRequired ?? 0;
  const nextXp = nextLevel?.xpRequired ?? Math.max(currentMember?.xp ?? 1, 1);
  const progress = currentMember ? Math.min(100, Math.round(((currentMember.xp - previousXp) / Math.max(nextXp - previousXp, 1)) * 100)) : 0;

  const filteredMembers = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return members;
    return members.filter((member) =>
      [member.fullName, member.preferredName, member.employmentId, member.personalEmail, member.workEmail, member.jobRole]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [members, search]);

  const navItems: Array<[View, LucideIcon, string]> = [
    ['dashboard', LayoutDashboard, 'Dashboard'],
    ['profile', UserRound, 'Profile'],
    ['rewards', Trophy, 'Rewards'],
    ['guides', BookOpen, 'Guides'],
  ];

  if (currentMember?.isAdmin) navItems.push(['admin', UsersRound, 'Admin']);

  function login() {
    const rawMember = members.find((item) => item.employmentId.toLowerCase() === employmentId.trim().toLowerCase());
    const member = rawMember ? getEffectiveMember(rawMember) : null;
    if (!member) {
      setLoginError('Employment ID was not found.');
      return;
    }
    if (rawMember && rawMember.status !== member.status) {
      setMembers((items) => items.map((item) => (item.id === member.id ? member : item)));
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
    setMembers((items) => items.map((member) => (member.id === currentMember.id ? { ...member, ...changes } : member)));
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
            <p className="mt-1 text-xs text-zinc-500">{currentMember.employmentId}</p>
            <p className="mt-3 text-xs text-zinc-500">{saveStatus}</p>
          </div>

          <button
            className="mt-4 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-600 hover:bg-mist"
            onClick={() => setCurrentMemberId(null)}
          >
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
              xpToNext={xpToNext}
              jumpLinks={jumpLinks}
              setView={setView}
            />
          )}

          {view === 'profile' && <Profile member={currentMember} updateCurrentMember={updateCurrentMember} />}

          {view === 'rewards' && <Rewards member={currentMember} levels={levels} rewards={rewards} />}

          {view === 'guides' && <Guides pages={guidePages} />}

          {view === 'admin' && currentMember.isAdmin && (
            <Admin
              members={filteredMembers}
              allMembers={members}
              levels={levels}
              rewards={rewards}
              guidePages={guidePages}
              search={search}
              setSearch={setSearch}
              setMembers={setMembers}
              setLevels={setLevels}
              setRewards={setRewards}
              setGuidePages={setGuidePages}
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
  xpToNext,
  jumpLinks,
  setView,
}: {
  member: WorkspaceMember;
  currentLevel: Level;
  nextLevel: Level | null;
  nextRewards: Reward[];
  progress: number;
  xpToNext: number;
  jumpLinks: JumpLink[];
  setView: (view: View) => void;
}) {
  return (
    <>
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Flat Reality Entertainment Group</p>
        <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Welcome back, {displayName(member)}</h1>
      </section>

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
              <span>{nextLevel ? `${xpToNext} XP until ${nextLevel.name}` : 'Top level reached'}</span>
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
          {nextLevel && <p className="mt-4 text-sm font-medium text-amber">{xpToNext} XP remaining</p>}
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
                <button key={link.id} className="flex min-h-20 items-center gap-4 rounded-xl border border-line bg-paper p-4 text-left shadow-soft transition hover:-translate-y-0.5" onClick={() => setView(link.internalView!)}>
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
        </div>
      </Section>

      <Section title="Skills">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Languages" value={member.languages} disabled onChange={() => undefined} />
          <Field label="Software" value={member.software} disabled onChange={() => undefined} />
          <Field label="Seniority" value={member.seniority} disabled onChange={() => undefined} />
        </div>
      </Section>

      <Section title="Onboarding">
        <div className="grid gap-3 md:grid-cols-3">
          <ReadOnlyCheck label="GDPR" checked={member.onboarding.gdprSigned} />
          <ReadOnlyCheck label="NDA" checked={member.onboarding.ndaSigned} />
          <div className="rounded-lg border border-line bg-mist p-3 text-sm text-zinc-600">
            <p className="font-medium text-ink">Contract</p>
            <p className="mt-1">{member.onboarding.contractType}</p>
          </div>
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

function ReadOnlyCheck({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-mist p-3 text-sm font-medium">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${checked ? 'bg-forest text-white' : 'bg-white text-zinc-400'}`}>
        {checked && <Check size={16} />}
      </span>
      {label}
    </div>
  );
}

function Rewards({ member, levels, rewards }: { member: WorkspaceMember; levels: Level[]; rewards: Reward[] }) {
  const sortedLevels = [...levels].sort((a, b) => a.xpRequired - b.xpRequired);
  const currentLevel = getCurrentLevel(sortedLevels, member.xp);

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">LevelUp! Rewards</p>
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
            <button
              key={page.id}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${selectedPage?.id === page.id ? 'bg-mist text-ink' : 'text-zinc-600 hover:bg-mist'}`}
              onClick={() => setSelectedPageId(page.id)}
            >
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
  allMembers,
  levels,
  rewards,
  guidePages,
  search,
  setSearch,
  setMembers,
  setLevels,
  setRewards,
  setGuidePages,
}: {
  members: WorkspaceMember[];
  allMembers: WorkspaceMember[];
  levels: Level[];
  rewards: Reward[];
  guidePages: GuidePage[];
  search: string;
  setSearch: (value: string) => void;
  setMembers: Dispatch<SetStateAction<WorkspaceMember[]>>;
  setLevels: Dispatch<SetStateAction<Level[]>>;
  setRewards: Dispatch<SetStateAction<Reward[]>>;
  setGuidePages: Dispatch<SetStateAction<GuidePage[]>>;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState(allMembers[0]?.id ?? '');
  const [draft, setDraft] = useState<WorkspaceMember>(allMembers[0] ?? { ...emptyMember, id: `member-${Date.now()}` });
  const selectedMemberExists = allMembers.some((member) => member.id === draft.id);

  function editMember(member: WorkspaceMember) {
    setSelectedMemberId(member.id);
    setDraft({ ...member, onboarding: { ...member.onboarding }, benefitPrograms: [...member.benefitPrograms] });
  }

  function newMember() {
    const member = { ...emptyMember, id: `member-${Date.now()}`, employmentId: `FR-${allMembers.length + 1001}` };
    setSelectedMemberId(member.id);
    setDraft(member);
  }

  function saveMember() {
    setMembers((items) => {
      if (items.some((member) => member.id === draft.id)) {
        return items.map((member) => (member.id === draft.id ? draft : member));
      }
      return [...items, draft];
    });
    setSelectedMemberId(draft.id);
  }

  function updateDraft(changes: Partial<WorkspaceMember>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function updateOnboarding(changes: Partial<WorkspaceMember['onboarding']>) {
    setDraft((current) => ({ ...current, onboarding: { ...current.onboarding, ...changes } }));
  }

  function toggleBenefit(program: BenefitProgram) {
    setDraft((current) => ({
      ...current,
      benefitPrograms: current.benefitPrograms.includes(program)
        ? current.benefitPrograms.filter((item) => item !== program)
        : [...current.benefitPrograms, program],
    }));
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-line bg-paper p-6 shadow-soft">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Administration</p>
            <h1 className="mt-3 text-3xl font-semibold">Workspace Control</h1>
          </div>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white" onClick={newMember}>
            <Plus size={17} />
            Create User
          </button>
        </div>
        <label className="mt-5 flex h-11 items-center gap-3 rounded-lg border border-line px-3">
          <Search size={18} className="text-zinc-400" />
          <input className="w-full outline-none" placeholder="Search users" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </section>

      <section className="grid gap-4 xl:grid-cols-[330px_1fr]">
        <div className="grid gap-3 self-start">
          {members.map((member) => (
            <button
              key={member.id}
              className={`rounded-xl border p-4 text-left shadow-soft ${selectedMemberId === member.id ? 'border-forest bg-forest/5' : 'border-line bg-paper'}`}
              onClick={() => editMember(member)}
            >
              <p className="font-semibold">{displayName(member)}</p>
              <p className="mt-1 text-sm text-zinc-500">{member.employmentId} - {member.jobRole || 'No role set'} - {statusLabel(member.status)}</p>
            </button>
          ))}
        </div>

        <div className="grid gap-6 rounded-xl border border-line bg-paper p-6 shadow-soft">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold">{selectedMemberExists ? 'Edit User' : 'Create User'}</h2>
              <p className="mt-1 text-sm text-zinc-500">Administrators can edit Employment ID and all personal information.</p>
            </div>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-forest px-4 text-sm font-medium text-white" onClick={saveMember}>
              <Save size={17} />
              Save User
            </button>
          </div>

          <Section title="Personal Information">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Employment ID" value={draft.employmentId} onChange={(value) => updateDraft({ employmentId: value })} />
              <Field label="Full Name" value={draft.fullName} onChange={(value) => updateDraft({ fullName: value })} />
              <Field label="Preferred Name" value={draft.preferredName} onChange={(value) => updateDraft({ preferredName: value })} />
              <Field label="Work Start Date" type="date" value={draft.workStartDate} onChange={(value) => updateDraft({ workStartDate: value })} />
              <SelectField<ContractType> label="Contract Type" value={draft.contractType} options={['CORE TEAM', 'INDEPENDENT PARTNER']} onChange={(value) => updateDraft({ contractType: value, workEmail: value === 'CORE TEAM' ? draft.workEmail : '' })} />
              <Field label="Address of Residence" value={draft.addressOfResidence} onChange={(value) => updateDraft({ addressOfResidence: value })} />
              <Field label="Citizenship Country" value={draft.citizenshipCountry} onChange={(value) => updateDraft({ citizenshipCountry: value })} />
              <Field label="IBAN" value={draft.iban} onChange={(value) => updateDraft({ iban: value })} />
              <Field label="Personal Email" value={draft.personalEmail} onChange={(value) => updateDraft({ personalEmail: value })} />
              <Field label="Job Role" value={draft.jobRole} onChange={(value) => updateDraft({ jobRole: value })} />
              {draft.contractType === 'CORE TEAM' && <Field label="Work Email" value={draft.workEmail} onChange={(value) => updateDraft({ workEmail: value })} />}
              <Field label="Estimated Hours" value={draft.estimatedHours} onChange={(value) => updateDraft({ estimatedHours: value })} />
              <Field label="Phone Number" value={draft.phoneNumber} onChange={(value) => updateDraft({ phoneNumber: value })} />
              <Field label="Time Zone" value={draft.timeZone} onChange={(value) => updateDraft({ timeZone: value })} />
              <Field label="Portfolio" value={draft.portfolio} onChange={(value) => updateDraft({ portfolio: value })} />
              <Field label="Strike System" type="number" value={draft.strikeSystem} onChange={(value) => updateDraft({ strikeSystem: Math.min(3, Math.max(0, Number(value))) })} />
              <Field label="LevelUp! XP" type="number" value={draft.xp} onChange={(value) => updateDraft({ xp: Number(value) })} />
            </div>
          </Section>

          <Section title="Benefit Program">
            <div className="flex flex-wrap gap-2">
              {benefitProgramOptions.map((program) => (
                <button
                  key={program}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${draft.benefitPrograms.includes(program) ? 'border-forest bg-forest text-white' : 'border-line bg-white text-zinc-600'}`}
                  onClick={() => toggleBenefit(program)}
                >
                  {program}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Skills">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Languages" value={draft.languages} onChange={(value) => updateDraft({ languages: value })} />
              <Field label="Software" value={draft.software} onChange={(value) => updateDraft({ software: value })} />
              <Field label="Seniority" value={draft.seniority} onChange={(value) => updateDraft({ seniority: value })} />
            </div>
          </Section>

          <Section title="Onboarding">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex h-11 items-center gap-3 rounded-lg border border-line px-3 text-sm font-medium text-zinc-600">
                <input type="checkbox" checked={draft.onboarding.gdprSigned} onChange={(event) => updateOnboarding({ gdprSigned: event.target.checked })} />
                GDPR
              </label>
              <label className="flex h-11 items-center gap-3 rounded-lg border border-line px-3 text-sm font-medium text-zinc-600">
                <input type="checkbox" checked={draft.onboarding.ndaSigned} onChange={(event) => updateOnboarding({ ndaSigned: event.target.checked })} />
                NDA
              </label>
              <SelectField<OnboardingContractType> label="Contract" value={draft.onboarding.contractType} options={['None', 'MASTER SERVICE AGREEMENT']} onChange={(value) => updateOnboarding({ contractType: value })} />
            </div>
          </Section>

          <Section title="Change Status">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {statusOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = draft.status === option.value;
                return (
                  <button
                    key={option.value}
                    className={`flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium ${
                      isSelected ? 'border-forest bg-forest text-white' : 'border-line bg-white text-zinc-600'
                    }`}
                    onClick={() => updateDraft({ status: option.value, statusUntil: option.needsDate ? draft.statusUntil : '' })}
                  >
                    <Icon size={19} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            {statusOptions.find((option) => option.value === draft.status)?.needsDate && (
              <div className="max-w-xs">
                <Field label={`${statusLabel(draft.status)} end date`} type="date" value={draft.statusUntil} onChange={(value) => updateDraft({ statusUntil: value })} />
              </div>
            )}
            {statusOptions.find((option) => option.value === draft.status)?.blocksLogin && (
              <p className="text-sm text-red-600">Suspended users cannot enter the workspace.</p>
            )}
          </Section>

          <div className="flex flex-wrap gap-3 border-t border-line pt-5">
            <label className="flex h-11 items-center gap-3 self-end rounded-lg border border-line px-3 text-sm font-medium text-zinc-600">
              <input type="checkbox" checked={draft.isAdmin} onChange={(event) => updateDraft({ isAdmin: event.target.checked })} />
              Admin access
            </label>
            {selectedMemberExists && (
              <button className="inline-flex h-11 items-center gap-2 self-end rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600" onClick={() => setMembers((items) => items.filter((member) => member.id !== draft.id))}>
                <Trash2 size={17} />
                Delete User
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <AdminLevels levels={levels} rewards={rewards} setLevels={setLevels} setRewards={setRewards} />
        <AdminGuides guidePages={guidePages} setGuidePages={setGuidePages} />
      </section>
    </div>
  );
}

function AdminLevels({
  levels,
  rewards,
  setLevels,
  setRewards,
}: {
  levels: Level[];
  rewards: Reward[];
  setLevels: Dispatch<SetStateAction<Level[]>>;
  setRewards: Dispatch<SetStateAction<Reward[]>>;
}) {
  function addLevel() {
    setLevels((items) => [...items, { id: `level-${Date.now()}`, number: items.length + 1, name: `Level ${items.length + 1}`, xpRequired: 0, description: '' }]);
  }

  function addReward(levelId: string) {
    setRewards((items) => [...items, { id: `reward-${Date.now()}`, levelId, rewardName: 'New reward', description: '' }]);
  }

  return (
    <div className="rounded-xl border border-line bg-paper p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">LevelUp! Program</h2>
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
  );
}

function AdminGuides({ guidePages, setGuidePages }: { guidePages: GuidePage[]; setGuidePages: Dispatch<SetStateAction<GuidePage[]>> }) {
  function addPage() {
    setGuidePages((items) => [...items, { id: `guide-${Date.now()}`, title: 'New Guide Page', content: '# New Guide Page\n\nWrite text here.', order: items.length + 1 }]);
  }

  return (
    <div className="rounded-xl border border-line bg-paper p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Guide Pages</h2>
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
              <textarea
                className="min-h-44 rounded-lg border border-line bg-white p-3 text-sm outline-none focus:border-forest focus:ring-4 focus:ring-forest/10"
                value={page.content}
                onChange={(event) => setGuidePages((items) => items.map((item) => (item.id === page.id ? { ...item, content: event.target.value } : item)))}
              />
            </label>
            <button className="justify-self-start text-sm font-medium text-red-600" onClick={() => setGuidePages((items) => items.filter((item) => item.id !== page.id))}>Delete page</button>
          </div>
        ))}
      </div>
    </div>
  );
}
