create table if not exists public.workspace_retainer_catalogue (
  id text primary key,
  type text not null check (type in ('specialist', 'team', 'capacity')),
  category text not null,
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  roles text[] not null default '{}',
  published boolean not null default false,
  staffing_rules jsonb not null default '{}'::jsonb,
  internal_rate_eur numeric(12,2),
  availability text not null default 'unknown',
  reason_code text,
  checked_at timestamptz,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_retainer_assignments (
  inquiry_id uuid not null,
  member_id text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (inquiry_id, member_id)
);

alter table public.workspace_retainer_catalogue enable row level security;
alter table public.workspace_retainer_assignments enable row level security;
revoke all on public.workspace_retainer_catalogue, public.workspace_retainer_assignments from public, anon, authenticated;
grant all on public.workspace_retainer_catalogue, public.workspace_retainer_assignments to service_role;

create or replace function public.get_retainer_workspace_bridge_token()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'retainer_workspace_bridge_token'
  limit 1
$$;

revoke all on function public.get_retainer_workspace_bridge_token() from public, anon, authenticated;
grant execute on function public.get_retainer_workspace_bridge_token() to service_role;

insert into public.workspace_retainer_catalogue (id, type, category, title, description, tags, roles, published, staffing_rules)
values
  ('concept-artist','specialist','Art','Concept Artist','Visual development and production-ready direction for characters, environments and key moments.',array['Concept Art','Sketching','Art Direction'],array[]::text[],true,'{"requiredSkills":["concept art"]}'),
  ('ui-artist','specialist','Art','UI Artist','Readable, expressive interface assets designed for real production constraints.',array['UI Art','UX Support','Production Assets'],array[]::text[],true,'{"requiredSkills":["ui"]}'),
  ('unity-developer','specialist','Programming','Unity Developer','Gameplay, tools and systems engineering for Unity productions.',array['Unity','Gameplay','Tools'],array[]::text[],true,'{"requiredSkills":["unity"]}'),
  ('game-designer','specialist','Game Design & Narrative','Game Designer','Systems, mechanics, balancing and documentation that keep production moving.',array['Systems Design','Balancing','Documentation'],array[]::text[],true,'{"requiredSkills":["game design"]}'),
  ('narrative-designer','specialist','Game Design & Narrative','Narrative Designer','Narrative structure and implementation shaped around the player experience.',array['Narrative','Dialogue','Implementation'],array[]::text[],true,'{"requiredSkills":["narrative"]}'),
  ('sound-designer','specialist','Sound & Music','Sound Designer','Responsive sound and atmosphere for interactive experiences.',array['Sound Design','Implementation','Atmosphere'],array[]::text[],true,'{"requiredSkills":["sound"]}'),
  ('producer','specialist','Production','Producer','Planning, coordination and transparent production workflows.',array['Planning','Coordination','Delivery'],array[]::text[],true,'{"requiredRoles":["producer"]}'),
  ('accessibility-consultant','specialist','Inclusive Design & Accessibility','Inclusive Design Consultant','Practical accessibility and representation support for games and interactive products.',array['Accessibility','UX Review','Representation'],array[]::text[],true,'{"requiredSkills":["accessibility"]}'),
  ('art-production-pod','team','Art','Art Production Pod','A coordinated visual production unit for concept, UI and asset delivery.',array['Art Direction','Concept Art','UI Art'],array['art direction','concept art','ui art'],true,'{"requiredRoles":["art direction","concept art","ui art"]}'),
  ('gameplay-systems-pod','team','Programming','Gameplay Systems Pod','A coordinated Unity and design unit for dependable gameplay systems.',array['Unity','Game Design','Production'],array['unity development','game design','production'],true,'{"requiredRoles":["unity","game design","producer"]}'),
  ('narrative-design-pod','team','Game Design & Narrative','Narrative Design Pod','A coordinated team for narrative design, dialogue and implementation support.',array['Narrative','Dialogue','Implementation'],array['narrative design','game design','implementation'],true,'{"requiredRoles":["narrative","game design","developer"]}'),
  ('cross-disciplinary-team','team','Production','Cross-Disciplinary Production Team','A tailored production group coordinated as one Flat Reality delivery unit.',array['Production','Design','Development'],array['production','design','development'],true,'{"requiredRoles":["producer","designer","developer"]}'),
  ('art-production-capacity','capacity','Art','Art Production Capacity','Flexible visual development capacity for a changing art backlog.',array['Concept Art','UI Art','Production'],array[]::text[],true,'{"requiredSkills":["art"],"confirmedReservableCapacity":false}'),
  ('flexible-unity-capacity','capacity','Programming','Flexible Unity Capacity','Reserved Unity development time that can move with your technical backlog.',array['Unity','Gameplay','Technical Support'],array[]::text[],true,'{"requiredSkills":["unity"],"confirmedReservableCapacity":false}'),
  ('design-capacity','capacity','Game Design & Narrative','Game Design Capacity','Ongoing systems and narrative design capacity for evolving production needs.',array['Systems','Narrative','Balancing'],array[]::text[],true,'{"requiredSkills":["design"],"confirmedReservableCapacity":false}'),
  ('audio-capacity','capacity','Sound & Music','Audio Production Capacity','Flexible sound design, music and implementation support.',array['Audio','Music','Implementation'],array[]::text[],true,'{"requiredSkills":["sound"],"confirmedReservableCapacity":false}'),
  ('production-capacity','capacity','Production','Production Capacity','Additional planning and coordination capacity for milestones and delivery.',array['Planning','Coordination','Workflows'],array[]::text[],true,'{"requiredRoles":["producer"],"confirmedReservableCapacity":false}'),
  ('inclusive-capacity','capacity','Inclusive Design & Accessibility','Inclusive Design Capacity','Ongoing accessibility-oriented UX and representation review support.',array['Accessibility','UX','Review'],array[]::text[],true,'{"requiredSkills":["accessibility"],"confirmedReservableCapacity":false}')
on conflict (id) do nothing;
