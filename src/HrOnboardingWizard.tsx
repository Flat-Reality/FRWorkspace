import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  Code2,
  Contact,
  FileBadge2,
  FolderKanban,
  Globe2,
  Languages,
  Palette,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import { emptyMember } from './data';
import type { BenefitProgram, ContractType, OnboardingContractType, UpworkContractDraft, WorkspaceMember } from './types';

const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
const ENTRA_ICON = asset('resources/logos/entra-id.png');

const projectOptions: Array<{ value: BenefitProgram; label: string; icon: string }> = [
  { value: 'The Nick', label: 'The Nick', icon: asset('resources/icons/the-nick.png') },
  { value: 'RAIN HEART', label: 'RAIN HEART', icon: asset('resources/icons/rain-heart.png') },
  { value: 'FR Partners', label: 'Partners™', icon: asset('resources/icons/partners.png') },
];

const permissionOptions = [
  { value: 'Admin', icon: ShieldCheck, description: 'Full access across FLAT REALITY ENTERTAINMENT GROUP.' },
  { value: 'HR', icon: UsersRound, description: 'Configure users, read admin logs, process requests and review people metrics.' },
  { value: 'Developer', icon: Code2, description: 'Internal tools, sensitive third-party software, Dev Portal and developer licenses.' },
  { value: 'Community', icon: Globe2, description: 'Dev Portal editorial tools, social media and game user-generated content.' },
  { value: 'Creative', icon: Palette, description: 'Project games, documents and creative spaces.' },
  { value: 'Operations', icon: Wrench, description: 'Operational tools and day-to-day workspace processes.' },
  { value: 'Other', icon: UserRound, description: 'Basic workspace access with the lowest general permissions.' },
];

const timeZones = [
  'Europe/Madrid', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Warsaw', 'Europe/Kyiv',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
];

type Draft = {
  contractType: ContractType;
  upworkRequired: boolean;
  projects: BenefitProgram[];
  firstName: string;
  secondName: string;
  preferredName: string;
  employmentId: string;
  employmentIdExpiresAt: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  citizenshipCountry: string;
  timeZone: string;
  jobRole: string;
  seniority: string;
  permissions: string[];
  permissionDetails: string[];
  personalEmail: string;
  phoneNumber: string;
  slackTag: string;
  skills: string[];
  software: string[];
  languages: string[];
  entraUsername: string;
  entraDomain: 'flatreality.eu' | 'flatrealitycompany.onmicrosoft.com';
  linkEntra: boolean;
  allowLegacyLogin: boolean;
  onboardingContract: OnboardingContractType;
  estimatedHours: string;
  pendingUpworkContract?: Omit<UpworkContractDraft, 'memberId'>;
};

const initialDraft: Draft = {
  contractType: 'CORE TEAM', upworkRequired: false, projects: [], firstName: '', secondName: '', preferredName: '',
  employmentId: '', employmentIdExpiresAt: '', addressStreet: '', addressCity: '', addressState: '', addressPostalCode: '',
  addressCountry: '', citizenshipCountry: '', timeZone: 'Europe/Madrid', jobRole: '', seniority: '', permissions: [],
  permissionDetails: [], personalEmail: '', phoneNumber: '', slackTag: '', skills: [], software: [], languages: [],
  entraUsername: '', entraDomain: 'flatreality.eu', linkEntra: true, allowLegacyLogin: false,
  onboardingContract: 'None', estimatedHours: '',
};

const stepTitles = [
  'What type of account will they have?',
  'Which projects should they join?',
  'What should we call them?',
  'Provide their onboarding documents',
  'Where are they based?',
  'What role will they take?',
  'Choose their general access',
  'Add their contact details',
  'Endorse their skills',
  'Connect them to Entra ID',
  'Create their contract now?',
  'Review the employee profile',
];

function Input({ label, value, onChange, required, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; placeholder?: string }) {
  return <label className="grid gap-2"><span className="text-sm font-semibold text-zinc-700">{label}{required && <span className="ml-1 text-forest">*</span>}</span><input className="h-12 rounded-lg border border-line bg-paper px-3 outline-none focus:border-forest focus:ring-4 focus:ring-forest/10" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Toggle({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description?: string }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-paper p-4"><input className="mt-1 h-4 w-4 accent-[#7F00FF]" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><span className="block font-semibold">{title}</span>{description && <span className="mt-1 block text-sm text-zinc-600">{description}</span>}</span></label>;
}

function ChoiceCard({ selected, onClick, icon, title, description }: { selected: boolean; onClick: () => void; icon: ReactNode; title: string; description?: string }) {
  return <button type="button" className={`relative flex min-h-28 items-start gap-4 rounded-xl border p-5 text-left transition ${selected ? 'border-forest bg-forest/5 ring-2 ring-forest/15' : 'border-line bg-paper hover:border-forest/40'}`} onClick={onClick}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-forest text-white' : 'bg-mist text-zinc-600'}`}>{icon}</span><span><span className="block font-semibold">{title}</span>{description && <span className="mt-2 block text-sm leading-6 text-zinc-600">{description}</span>}</span>{selected && <Check className="absolute right-4 top-4 text-forest" size={18} />}</button>;
}

function ChipInput({ label, values, suggestions, onChange }: { label: string; values: string[]; suggestions: string[]; onChange: (values: string[]) => void }) {
  const [value, setValue] = useState('');
  const listId = `suggestions-${label.replace(/\W/g, '').toLowerCase()}`;
  function add() {
    const next = value.trim();
    if (!next || values.some((item) => item.toLowerCase() === next.toLowerCase())) return setValue('');
    onChange([...values, next]);
    setValue('');
  }
  return <div className="grid gap-2"><span className="text-sm font-semibold text-zinc-700">{label}</span><div className="flex min-h-12 flex-wrap items-center gap-2 rounded-lg border border-line bg-paper p-2 focus-within:border-forest focus-within:ring-4 focus-within:ring-forest/10">{values.map((item) => <button key={item} type="button" className="inline-flex items-center gap-1 rounded-full bg-forest/10 px-3 py-1 text-sm font-medium text-forest" onClick={() => onChange(values.filter((valueItem) => valueItem !== item))}><BadgeCheck size={14} />{item}<X size={13} /></button>)}<input className="min-w-36 flex-1 bg-transparent px-1 outline-none" list={listId} value={value} placeholder={`Add ${label.toLowerCase()}`} onChange={(event) => setValue(event.target.value)} onBlur={add} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(); } }} /><datalist id={listId}>{suggestions.map((item) => <option key={item} value={item} />)}</datalist></div></div>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 border-b border-line py-3 sm:grid-cols-[180px_1fr]"><span className="text-sm text-zinc-500">{label}</span><span className="text-sm font-semibold">{value || 'Not provided'}</span></div>;
}

function UpworkDraftModal({ estimatedHours, value, onClose, onSave }: { estimatedHours: string; value?: Omit<UpworkContractDraft, 'memberId'>; onClose: () => void; onSave: (value: Omit<UpworkContractDraft, 'memberId'>) => void }) {
  const [draft, setDraft] = useState<Omit<UpworkContractDraft, 'memberId'>>(value ?? { title: '', type: 'hourly', rate: 0, weeklyLimit: Number.parseFloat(estimatedHours) || 0, milestoneDescription: '', milestoneAmount: 0, startDate: new Date().toISOString().slice(0, 10), endDate: '' });
  return <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/55 p-0 sm:p-4"><section className="max-h-[100dvh] min-h-[100dvh] w-full overflow-y-auto border border-line bg-paper p-4 shadow-2xl sm:min-h-0 sm:max-w-2xl sm:rounded-xl sm:p-6"><p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Upwork Contract Wizard</p><h2 className="mt-2 text-2xl font-semibold">Prepare contract details</h2><p className="mt-2 text-sm text-zinc-600">This draft will be attached to the employee profile and completed after their Upwork account is connected.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><Input label="Contract Name" required value={draft.title} onChange={(title) => setDraft({ ...draft, title })} /><label className="grid gap-2"><span className="text-sm font-semibold text-zinc-700">Billing Type</span><select className="h-12 rounded-lg border border-line bg-paper px-3" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as 'hourly' | 'fixed-price' })}><option value="hourly">Hourly</option><option value="fixed-price">Fixed-price</option></select></label><Input label={draft.type === 'hourly' ? 'Hourly Rate ($)' : 'Contract Amount ($)'} type="number" value={String(draft.rate)} onChange={(rate) => setDraft({ ...draft, rate: Number(rate) })} /><Input label="Weekly Limit" type="number" value={String(draft.weeklyLimit)} onChange={(weeklyLimit) => setDraft({ ...draft, weeklyLimit: Number(weeklyLimit) })} /><Input label="Start Date" type="date" value={draft.startDate} onChange={(startDate) => setDraft({ ...draft, startDate })} /><Input label="End Date" type="date" value={draft.endDate} onChange={(endDate) => setDraft({ ...draft, endDate })} />{draft.type === 'fixed-price' && <><Input label="First Milestone" value={draft.milestoneDescription} onChange={(milestoneDescription) => setDraft({ ...draft, milestoneDescription })} /><Input label="Milestone Amount ($)" type="number" value={String(draft.milestoneAmount)} onChange={(milestoneAmount) => setDraft({ ...draft, milestoneAmount: Number(milestoneAmount) })} /></>}</div><div className="mt-6 grid gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:pb-0"><button className="h-11 rounded-lg border border-line px-4 text-sm font-semibold sm:order-none" onClick={onClose}>Cancel</button><button disabled={!draft.title.trim()} className="h-11 rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-40" onClick={() => onSave(draft)}>Save contract draft</button></div></section></div>;
}

export function HrOnboardingWizard({ members, onCancel, onComplete }: { members: WorkspaceMember[]; onCancel: () => void; onComplete: (member: WorkspaceMember) => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [error, setError] = useState('');
  const [showUpworkWizard, setShowUpworkWizard] = useState(false);
  const [complete, setComplete] = useState(false);
  const suggestions = useMemo(() => ({
    skills: [...new Set(members.flatMap((member) => member.skills ?? []))].sort(),
    software: [...new Set(members.flatMap((member) => [member.software, ...(member.software ? member.software.split(',') : [])]).map((item) => item.trim()).filter(Boolean))].sort(),
    languages: [...new Set(members.flatMap((member) => [member.languages, ...(member.languages ? member.languages.split(',') : [])]).map((item) => item.trim()).filter(Boolean))].sort(),
  }), [members]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function toggleList(key: 'projects' | 'permissions' | 'permissionDetails', value: string) {
    setDraft((current) => {
      const values = current[key] as string[];
      return { ...current, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] };
    });
  }
  function validate() {
    if (step === 2 && !draft.firstName.trim()) return 'First Name is required.';
    if (step === 3 && !draft.employmentId.trim()) return 'Employment ID is required.';
    if (step === 3 && members.some((member) => member.employmentId.toLowerCase() === draft.employmentId.trim().toLowerCase())) return 'This Employment ID is already in use.';
    if (step === 4 && !draft.citizenshipCountry.trim()) return 'Citizenship Country is required.';
    if (step === 5 && !draft.jobRole.trim()) return 'Job Role is required.';
    if (step === 9 && draft.linkEntra && !draft.entraUsername.trim()) return 'Entra ID username is required.';
    return '';
  }
  function next() { const message = validate(); if (message) return setError(message); setError(''); setStep((current) => Math.min(stepTitles.length - 1, current + 1)); }
  function enroll() {
    const fullName = [draft.firstName.trim(), draft.secondName.trim()].filter(Boolean).join(' ');
    const addressOfResidence = [draft.addressStreet, draft.addressCity, draft.addressState, draft.addressPostalCode, draft.addressCountry].map((item) => item.trim()).filter(Boolean).join(', ');
    const member: WorkspaceMember = {
      ...emptyMember,
      id: `member-${Date.now()}`,
      employmentId: draft.employmentId.trim(),
      fullName,
      preferredName: draft.preferredName.trim(),
      workStartDate: new Date().toISOString().slice(0, 10),
      contractType: draft.contractType,
      benefitPrograms: draft.projects,
      addressOfResidence,
      addressStreet: draft.addressStreet.trim(), addressCity: draft.addressCity.trim(), addressState: draft.addressState.trim(), addressPostalCode: draft.addressPostalCode.trim(), addressCountry: draft.addressCountry.trim(),
      citizenshipCountry: draft.citizenshipCountry.trim(), timeZone: draft.timeZone, jobRole: draft.jobRole.trim(), seniority: draft.seniority,
      personalEmail: draft.personalEmail.trim(), phoneNumber: draft.phoneNumber.trim(), slackTag: draft.slackTag.trim(),
      employmentIdExpiresAt: draft.employmentIdExpiresAt, skills: draft.skills, endorsedSkills: draft.skills,
      software: draft.software.join(', '), languages: draft.languages.join(', '), permissions: draft.permissions, permissionDetails: draft.permissionDetails,
      entraEmail: draft.linkEntra ? `${draft.entraUsername.trim().toLowerCase()}@${draft.entraDomain}` : '',
      allowLegacyLogin: draft.allowLegacyLogin, upworkRequired: draft.contractType === 'INDEPENDENT PARTNER' && draft.upworkRequired,
      isAdmin: draft.permissions.includes('Admin'),
      estimatedHours: draft.estimatedHours, pendingUpworkContract: draft.pendingUpworkContract,
      onboarding: { ...emptyMember.onboarding, contractType: draft.onboardingContract },
    };
    setComplete(true);
    window.setTimeout(() => onComplete(member), 1750);
  }

  if (complete) return <div className="hr-wizard hr-wizard-complete"><div><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-forest text-white"><Check size={32} /></span><h1 className="mt-6 text-4xl font-semibold">The employee has been enrolled.</h1></div></div>;

  return <div className={`hr-wizard ${step === 9 ? 'is-entra' : ''}`}>
    <section key={step} className="hr-wizard-card">
      <div className="flex items-center justify-between gap-4"><button className="hr-wizard-icon-button" title="Cancel onboarding" onClick={onCancel}><X size={19} /></button><span className="text-sm font-medium text-zinc-500">Step {step + 1} of {stepTitles.length}</span></div>
      <div className="mt-7">
        {step === 9 && <img className="mb-5 h-14 w-14 object-contain" src={ENTRA_ICON} alt="Microsoft Entra ID" />}
        <h1 className="max-w-3xl break-words text-[1.75rem] font-semibold leading-tight sm:text-4xl">{stepTitles[step]}</h1>
        {step === 0 && <div className="mt-8 grid gap-4 sm:grid-cols-2"><ChoiceCard selected={draft.contractType === 'CORE TEAM'} onClick={() => set('contractType', 'CORE TEAM')} icon={<BriefcaseBusiness size={22} />} title="CORE TEAM" description="An internal member of the Flat Reality team." /><ChoiceCard selected={draft.contractType === 'INDEPENDENT PARTNER'} onClick={() => set('contractType', 'INDEPENDENT PARTNER')} icon={<UsersRound size={22} />} title="INDEPENDENT PARTNER" description="An external professional working through the partner network." />{draft.contractType === 'INDEPENDENT PARTNER' && <div className="sm:col-span-2"><Toggle checked={draft.upworkRequired} onChange={(value) => set('upworkRequired', value)} title="Require Upwork connection" description="The employee must connect Upwork before opening their Dashboard." /></div>}</div>}
        {step === 1 && <div className="mt-8 grid gap-4 sm:grid-cols-3">{projectOptions.map((project) => <ChoiceCard key={project.value} selected={draft.projects.includes(project.value)} onClick={() => toggleList('projects', project.value)} icon={<img className="h-9 w-9 object-contain" src={project.icon} alt="" />} title={project.label} />)}</div>}
        {step === 2 && <div className="mt-8 grid gap-4 sm:grid-cols-2"><Input label="First Name" required value={draft.firstName} onChange={(value) => set('firstName', value)} /><Input label="Second Name" value={draft.secondName} onChange={(value) => set('secondName', value)} /><div className="sm:col-span-2"><Input label="Preferred Name" value={draft.preferredName} onChange={(value) => set('preferredName', value)} /></div></div>}
        {step === 3 && <div className="mt-8 grid gap-4 sm:grid-cols-2"><Input label="Employment ID" required value={draft.employmentId} onChange={(value) => set('employmentId', value)} /><Input label="Expiry Date" type="date" value={draft.employmentIdExpiresAt} onChange={(value) => set('employmentIdExpiresAt', value)} /></div>}
        {step === 4 && <div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Input label="Street Address" value={draft.addressStreet} onChange={(value) => set('addressStreet', value)} /></div><Input label="City" value={draft.addressCity} onChange={(value) => set('addressCity', value)} /><Input label="State or Province" value={draft.addressState} onChange={(value) => set('addressState', value)} /><Input label="Postal Code" value={draft.addressPostalCode} onChange={(value) => set('addressPostalCode', value)} /><Input label="Country or Region" value={draft.addressCountry} onChange={(value) => set('addressCountry', value)} /><Input label="Citizenship Country" required value={draft.citizenshipCountry} onChange={(value) => set('citizenshipCountry', value)} /><label className="grid gap-2"><span className="text-sm font-semibold text-zinc-700">Time Zone <span className="text-forest">*</span></span><select className="h-12 rounded-lg border border-line bg-paper px-3" value={draft.timeZone} onChange={(event) => set('timeZone', event.target.value)}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select></label></div>}
        {step === 5 && <div className="mt-8 grid gap-4 sm:grid-cols-2"><Input label="Job Role" required value={draft.jobRole} onChange={(value) => set('jobRole', value)} /><label className="grid gap-2"><span className="text-sm font-semibold text-zinc-700">Seniority</span><select className="h-12 rounded-lg border border-line bg-paper px-3" value={draft.seniority} onChange={(event) => set('seniority', event.target.value)}><option value="">Select seniority</option><option>Junior</option><option>Mid-level</option><option>Senior</option><option>Lead</option><option>Principal</option></select></label></div>}
        {step === 6 && <div className="mt-8 grid gap-4 sm:grid-cols-2">{permissionOptions.map(({ value, icon: Icon, description }) => <ChoiceCard key={value} selected={draft.permissions.includes(value)} onClick={() => toggleList('permissions', value)} icon={<Icon size={22} />} title={value} description={description} />)}{draft.permissions.includes('Community') && <div className="grid gap-3 rounded-xl border border-line bg-paper p-4 sm:col-span-2"><p className="font-semibold">Community access</p>{['Flat Reality Channel (Dev Portal)', 'Social Medias'].map((item) => <Toggle key={item} checked={draft.permissionDetails.includes(item)} onChange={() => toggleList('permissionDetails', item)} title={item} />)}</div>}{draft.permissions.includes('Creative') && <div className="grid gap-3 rounded-xl border border-line bg-paper p-4 sm:col-span-2"><p className="font-semibold">Creative group</p><div className="grid gap-3 sm:grid-cols-2">{['Art', 'Music', 'Sound Design', 'Game & Level Design'].map((item) => <Toggle key={item} checked={draft.permissionDetails.includes(item)} onChange={() => toggleList('permissionDetails', item)} title={item} />)}</div></div>}</div>}
        {step === 7 && <div className="mt-8 grid gap-4 sm:grid-cols-2"><Input label="Personal Email" type="email" value={draft.personalEmail} onChange={(value) => set('personalEmail', value)} /><Input label="Phone Number" type="tel" value={draft.phoneNumber} onChange={(value) => set('phoneNumber', value)} /><div className="sm:col-span-2"><Input label="Slack Tag" value={draft.slackTag} onChange={(value) => set('slackTag', value)} placeholder="@username" /></div></div>}
        {step === 8 && <div className="mt-5"><p className="text-zinc-600">Endorsed skills contribute to the Partner Index. You can add or change them later.</p><div className="mt-6 grid gap-5"><ChipInput label="Skills" values={draft.skills} suggestions={suggestions.skills} onChange={(value) => set('skills', value)} /><ChipInput label="Software Knowledge" values={draft.software} suggestions={suggestions.software} onChange={(value) => set('software', value)} /><ChipInput label="Languages" values={draft.languages} suggestions={suggestions.languages} onChange={(value) => set('languages', value)} /></div></div>}
        {step === 9 && <div className="mt-8 grid gap-5"><div className="grid gap-3 sm:grid-cols-[1fr_290px]"><Input label="Entra ID Username" required={draft.linkEntra} value={draft.entraUsername} onChange={(value) => set('entraUsername', value.replace(/@.*/, '').replace(/\s/g, ''))} /><label className="grid gap-2"><span className="text-sm font-semibold text-zinc-700">Domain</span><select disabled={!draft.linkEntra} className="h-12 rounded-lg border border-line bg-paper px-3 disabled:opacity-50" value={draft.entraDomain} onChange={(event) => set('entraDomain', event.target.value as Draft['entraDomain'])}><option value="flatreality.eu">@flatreality.eu</option><option value="flatrealitycompany.onmicrosoft.com">@flatrealitycompany.onmicrosoft.com</option></select></label></div>{draft.linkEntra && draft.entraUsername && <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-800">{draft.entraUsername.toLowerCase()}@{draft.entraDomain}</p>}<Toggle checked={draft.allowLegacyLogin} onChange={(value) => set('allowLegacyLogin', value)} title="Allow Legacy sign-in with eID" description="Let this employee use Employment ID and a Workspace password as a fallback." />{draft.allowLegacyLogin && <button className={`rounded-lg border p-4 text-left text-sm font-semibold ${!draft.linkEntra ? 'border-red-300 bg-red-50 text-red-700' : 'border-line bg-paper text-zinc-600'}`} onClick={() => set('linkEntra', !draft.linkEntra)}>{draft.linkEntra ? 'Do not link an Entra ID account (Not recommended)' : 'Link an Entra ID account'}</button>}</div>}
        {step === 10 && <div className="mt-8 grid gap-5"><label className="grid gap-2"><span className="text-sm font-semibold text-zinc-700">Contract</span><select className="h-12 rounded-lg border border-line bg-paper px-3" value={draft.onboardingContract} onChange={(event) => { const value = event.target.value as OnboardingContractType; set('onboardingContract', value); if (value === 'UPWORK CONTRACT') setShowUpworkWizard(true); }}><option>None</option><option>MASTER SERVICE AGREEMENT</option><option>UPWORK CONTRACT</option></select></label><Input label="Estimated Hours" value={draft.estimatedHours} onChange={(value) => set('estimatedHours', value)} placeholder="20 hours / week" />{draft.pendingUpworkContract && <div className="rounded-xl border border-line bg-paper p-4"><p className="font-semibold">{draft.pendingUpworkContract.title} (UPWORK CONTRACT)</p><p className="mt-1 text-sm text-zinc-600">{draft.pendingUpworkContract.type} · ${draft.pendingUpworkContract.rate}</p><button className="mt-3 text-sm font-semibold text-forest" onClick={() => setShowUpworkWizard(true)}>Edit contract draft</button></div>}<button className="justify-self-start text-sm font-semibold text-zinc-500" onClick={() => { set('onboardingContract', 'None'); set('pendingUpworkContract', undefined); next(); }}>Skip for now</button></div>}
        {step === 11 && <div className="mt-8 max-h-[52vh] overflow-y-auto rounded-xl border border-line bg-paper px-5"><ReviewRow label="Account Type" value={draft.contractType} /><ReviewRow label="Projects" value={draft.projects.map((project) => project === 'FR Partners' ? 'Partners™' : project).join(', ')} /><ReviewRow label="Name" value={[draft.firstName, draft.secondName].filter(Boolean).join(' ')} /><ReviewRow label="Preferred Name" value={draft.preferredName} /><ReviewRow label="Employment ID" value={draft.employmentId} /><ReviewRow label="Location" value={[draft.addressCity, draft.addressCountry].filter(Boolean).join(', ')} /><ReviewRow label="Citizenship" value={draft.citizenshipCountry} /><ReviewRow label="Time Zone" value={draft.timeZone} /><ReviewRow label="Role" value={[draft.jobRole, draft.seniority].filter(Boolean).join(' · ')} /><ReviewRow label="General Access" value={draft.permissions.join(', ')} /><ReviewRow label="Skills" value={draft.skills.join(', ')} /><ReviewRow label="Entra ID" value={draft.linkEntra ? `${draft.entraUsername}@${draft.entraDomain}` : 'Not linked'} /><ReviewRow label="Legacy Sign-in" value={draft.allowLegacyLogin ? 'Allowed' : 'Disabled'} /><ReviewRow label="Contract" value={draft.onboardingContract} /><ReviewRow label="Estimated Hours" value={draft.estimatedHours} /></div>}
      </div>
      {error && <p className="mt-5 text-sm font-semibold text-red-600">{error}</p>}
      <div className="hr-wizard-actions mt-8 grid grid-cols-2 items-center gap-3"><button disabled={step === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-paper px-4 text-sm font-semibold disabled:invisible" onClick={() => { setError(''); setStep((current) => Math.max(0, current - 1)); }}><ArrowLeft size={17} /> Back</button>{step < stepTitles.length - 1 ? <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-forest px-5 text-sm font-semibold text-white" onClick={next}>Next <ArrowRight size={17} /></button> : <button className={`${draft.linkEntra ? 'entra-gradient-button' : 'bg-ink'} col-span-2 inline-flex min-h-12 items-center justify-center gap-3 rounded-lg px-4 py-3 text-center font-semibold text-white sm:col-span-1 sm:px-6`} onClick={enroll}>{draft.linkEntra ? <img className="h-6 w-6 shrink-0 object-contain brightness-0 invert" src={ENTRA_ICON} alt="" /> : <Sparkles className="shrink-0" size={20} />} Enroll a New Employee</button>}</div>
    </section>
    {showUpworkWizard && <UpworkDraftModal estimatedHours={draft.estimatedHours} value={draft.pendingUpworkContract} onClose={() => { setShowUpworkWizard(false); if (!draft.pendingUpworkContract) set('onboardingContract', 'None'); }} onSave={(value) => { set('pendingUpworkContract', value); set('onboardingContract', 'UPWORK CONTRACT'); setShowUpworkWizard(false); }} />}
  </div>;
}
