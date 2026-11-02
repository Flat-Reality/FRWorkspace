// An isolated UI fixture: every backend action is intercepted, so no email can be sent.
import { createServer } from 'vite';
const fixture = `
let settings = { enabled:true, monthly_enabled:false, onboarding_enabled:false };
let messages = [];
export async function callWorkspaceApi(body) {
  if(body.command==='status') return {installed:true,configured:true,settings,messages};
  if(body.command==='settings') { settings=body.settings; return {ok:true}; }
  if(body.command==='cancel') { messages=messages.filter(m=>m.id!==body.id); return {ok:true}; }
  if(['announce','sabbatical','test'].includes(body.command)) {
    const ids=body.command==='test'?['qa-admin']:body.memberIds;
    for(const id of ids) messages.unshift({id:crypto.randomUUID(),member_id:id,recipient:id==='qa-admin'?'taylor@example.org':'alex@example.org',content:body.content||{kind:body.command==='sabbatical'?'sabbatical_approved':'announcement',title:body.title,message:body.message},status:'pending',attempts:0,created_at:new Date().toISOString(),sent_at:null,last_error:null});
    return {queued:ids.length};
  }
  throw Error('Unexpected QA command');
}`;
const server = await createServer({ server: { host:'127.0.0.1', port:5175, strictPort:true }, plugins:[{name:'email-qa-backend',enforce:'pre',load(id) { if(id.replaceAll('\\','/').endsWith('/src/storage.ts')) return fixture; }}] });
await server.listen();
console.log('Email UI QA: http://127.0.0.1:5175/tests/email-preview.html');
