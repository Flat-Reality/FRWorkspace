import { useEffect, useRef, useState } from 'react';
import { FileCheck2, FilePenLine, HeartPulse, History, Palmtree, ShieldCheck, X } from 'lucide-react';
import type { MemberDocument, WorkspaceMember } from './types';

const entraIcon = `${import.meta.env.BASE_URL}resources/icons/EntraIcon.png`;

export function pendingOfficeDocuments(member: WorkspaceMember) {
  return member.documents.filter((document) => !document.signed);
}

export function EOffice({ member, entraIconUrl }: { member: WorkspaceMember; entraIconUrl?: string }) {
  const [selected, setSelected] = useState<MemberDocument | null>(null);
  const pending = pendingOfficeDocuments(member);
  const signed = member.documents.filter((document) => document.signed);
  return <div className="grid min-w-0 gap-6">
    <header><p className="text-sm font-semibold uppercase tracking-[0.14em] text-forest">Workspace</p><h1 className="mt-2 text-3xl font-semibold">eOffice</h1></header>
    <section aria-labelledby="office-actions"><h2 id="office-actions" className="mb-3 text-lg font-semibold">Quick Actions</h2><div className="grid gap-3 sm:grid-cols-3">
      {[[HeartPulse, 'Sick Leave'], [Palmtree, 'Schedule a Pause'], [HeartPulse, 'Mental Health Days']].map(([Icon, title]) => { const ActionIcon = Icon as typeof HeartPulse; return <button type="button" key={String(title)} className="flex min-h-24 items-center gap-4 rounded-lg border border-line bg-paper p-4 text-left shadow-soft transition hover:-translate-y-0.5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-mist text-forest"><ActionIcon size={23} /></span><span className="font-semibold">{String(title)}</span></button>; })}
    </div></section>
    <section className="min-h-72 rounded-lg border border-line bg-paper p-5 shadow-soft sm:p-7"><div className="flex items-center gap-3"><FilePenLine className="text-forest" size={24} /><h2 className="text-xl font-semibold">Awaiting Your Signature</h2>{pending.length > 0 && <span className="rounded-full bg-forest px-2.5 py-1 text-xs font-bold text-white">{pending.length}</span>}</div>
      {pending.length ? <div className="mt-6 grid gap-3">{pending.map((document) => <div key={document.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-line p-4"><FileCheck2 className="shrink-0 text-forest" size={22} /><div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{document.title}</h3><p className="mt-1 text-sm text-zinc-500">Signature requested</p></div><button className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white" onClick={() => setSelected(document)}>Review document</button></div>)}</div> : <div className="grid min-h-48 place-content-center justify-items-center gap-3 text-center"><ShieldCheck className="text-forest" size={36} /><p className="font-semibold">You're all caught up</p><p className="text-sm text-zinc-500">No documents awaiting your signature.</p></div>}
    </section>
    <section className="rounded-lg border border-line bg-paper p-5 shadow-soft sm:p-7"><h2 className="flex items-center gap-3 text-lg font-semibold"><History size={21} className="text-forest" />Signature Journal</h2>{signed.length ? <ul className="mt-4 divide-y divide-line">{signed.map((document) => <li key={document.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="break-words font-medium">{document.title}</span><span className="flex shrink-0 items-center gap-1 text-emerald-600"><FileCheck2 size={16} />Signed</span></li>)}</ul> : <p className="mt-4 text-sm text-zinc-500">No signatures recorded yet.</p>}</section>
    {selected && <SigningWindow document={selected} entraIconUrl={entraIconUrl || entraIcon} onClose={() => setSelected(null)} />}
  </div>;
}

function SigningWindow({ document, entraIconUrl, onClose }: { document: MemberDocument; entraIconUrl: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const fields = document.signingFields ?? [];
  return <dialog ref={dialog} onCancel={onClose} onClose={onClose} className="eoffice-signing-dialog w-[calc(100%_-_2rem)] max-w-5xl rounded-lg border border-line bg-paper p-0 text-ink shadow-soft backdrop:bg-black/60">
    <div className="flex items-center justify-between gap-4 border-b border-line p-5"><h2 className="min-w-0 break-words text-lg font-semibold">{document.title}</h2><button className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-mist" aria-label="Close signing window" title="Close" onClick={onClose}><X size={20} /></button></div>
    <div className="grid min-w-0 gap-5 p-5 md:grid-cols-[minmax(0,1.5fr)_minmax(240px,1fr)]">
      <div className="grid min-h-72 place-items-center rounded-lg border border-line bg-mist">{document.url ? <iframe title={document.title} src={document.url} className="h-[55vh] w-full rounded-lg" sandbox="allow-same-origin" /> : <FilePenLine size={48} className="text-zinc-400" />}</div>
      <form className="grid content-start gap-4" onSubmit={(event) => event.preventDefault()}><h3 className="font-semibold">Document Details</h3>{fields.map((field) => <label key={field.id} className="grid gap-2 text-sm font-medium">{field.label}{field.required ? ' *' : ''}<input name={field.id} type={field.type || 'text'} required={field.required} defaultValue={field.value || ''} className="h-11 min-w-0 rounded-lg border border-line bg-paper px-3" /></label>)}<button type="submit" disabled className="entra-gradient-button mt-3 inline-flex min-h-12 items-center justify-center gap-3 rounded-lg px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" title="Signing will be available when this document is ready"><img src={entraIconUrl} alt="" className="h-6 w-6" />Sign with Entra ID</button></form>
    </div>
  </dialog>;
}
