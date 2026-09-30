-- Contacts is an organization-owned directory. Project assignments reference it;
-- published plan revisions continue to retain their immutable snapshots.

alter table public.contacts
  add column if not exists prefix text not null default '',
  add column if not exists given_name text not null default '',
  add column if not exists family_name text not null default '',
  add column if not exists suffix text not null default '',
  add column if not exists display_name text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists tags text[] not null default '{}',
  add column if not exists lifecycle text not null default 'active' check (lifecycle in ('active', 'archived')),
  add column if not exists source text not null default 'manual' check (source in ('manual', 'migration', 'vcard', 'csv', 'xlsx', 'microsoft', 'google')),
  add column if not exists merged_into_id uuid references public.contacts(id) on delete set null;

alter table public.contacts alter column name set default '';
alter table public.contacts add constraint contacts_meaningful_identity_check check (
  nullif(trim(display_name), '') is not null
  or nullif(trim(given_name), '') is not null
  or nullif(trim(family_name), '') is not null
  or nullif(trim(name), '') is not null
);

update public.contacts
set display_name = name,
    source = 'migration'
where display_name = '';

create table public.contact_emails (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  type text not null default 'work' check (type in ('work', 'mobile', 'home', 'other')),
  value text not null,
  normalized_value text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (contact_id, normalized_value)
);

create table public.contact_phones (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  type text not null default 'work' check (type in ('work', 'mobile', 'home', 'other')),
  value text not null,
  normalized_value text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (contact_id, normalized_value)
);

create table public.contact_addresses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  type text not null default 'work' check (type in ('work', 'mobile', 'home', 'other')),
  street text not null default '',
  postal_code text not null default '',
  city text not null default '',
  region text not null default '',
  country text not null default '',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.contact_emails (contact_id, value, normalized_value, is_primary)
select id, email, lower(trim(email)), true
from public.contacts
where trim(email) <> ''
on conflict (contact_id, normalized_value) do nothing;

insert into public.contact_phones (contact_id, value, normalized_value, is_primary)
select id, phone, regexp_replace(phone, '[^0-9+]', '', 'g'), true
from public.contacts
where trim(phone) <> ''
on conflict (contact_id, normalized_value) do nothing;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 240),
  website text not null default '',
  domain text not null default '',
  email text not null default '',
  phone text not null default '',
  address jsonb,
  notes text not null default '',
  tags text[] not null default '{}',
  lifecycle text not null default 'active' check (lifecycle in ('active', 'archived')),
  source text not null default 'manual' check (source in ('manual', 'migration', 'vcard', 'csv', 'xlsx', 'microsoft', 'google')),
  merged_into_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index companies_organization_name_unique
  on public.companies (organization_id, lower(name));

insert into public.companies (organization_id, name, source)
select distinct organization_id, trim(company), 'migration'
from public.contacts
where trim(company) <> ''
on conflict do nothing;

create table public.contact_company_affiliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  job_title text not null default '',
  department text not null default '',
  is_primary boolean not null default false,
  lifecycle text not null default 'active' check (lifecycle in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, company_id)
);

insert into public.contact_company_affiliations (organization_id, contact_id, company_id, is_primary)
select contact.organization_id, contact.id, company.id, true
from public.contacts contact
join public.companies company
  on company.organization_id = contact.organization_id
 and lower(company.name) = lower(trim(contact.company))
where trim(contact.company) <> ''
on conflict (contact_id, company_id) do nothing;

create table public.project_contact_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  lifecycle text not null default 'active' check (lifecycle in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, contact_id)
);

create table public.project_contact_roles (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.project_contact_assignments(id) on delete cascade,
  role text not null check (role in ('client', 'owner', 'coordinator', 'architect', 'planner', 'site_manager', 'contractor', 'custom')),
  custom_label text,
  created_at timestamptz not null default now(),
  check ((role = 'custom' and nullif(trim(custom_label), '') is not null) or (role <> 'custom' and custom_label is null))
);

insert into public.project_contact_assignments (organization_id, project_id, contact_id, company_id, created_at)
select project.organization_id, participant.project_id, participant.contact_id, affiliation.company_id, min(participant.created_at)
from public.project_participants participant
join public.projects project on project.id = participant.project_id
left join public.contact_company_affiliations affiliation on affiliation.contact_id = participant.contact_id and affiliation.is_primary
group by project.organization_id, participant.project_id, participant.contact_id, affiliation.company_id
on conflict (project_id, contact_id) do nothing;

insert into public.project_contact_roles (assignment_id, role)
select distinct assignment.id, participant.role
from public.project_participants participant
join public.project_contact_assignments assignment
  on assignment.project_id = participant.project_id
 and assignment.contact_id = participant.contact_id;

create table public.external_contact_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider text not null check (provider in ('microsoft', 'google')),
  provider_account_id text not null,
  external_contact_id text not null,
  source_revision text,
  last_imported_at timestamptz not null default now(),
  unique (organization_id, provider, provider_account_id, external_contact_id)
);

create table public.contact_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null check (source in ('manual', 'migration', 'vcard', 'csv', 'xlsx', 'microsoft', 'google')),
  source_label text not null,
  initiated_by uuid references auth.users(id),
  status text not null default 'completed' check (status in ('completed', 'undone', 'partially_undone')),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

-- Composite references make organization ownership an invariant, not merely an RLS convention.
alter table public.projects add constraint projects_id_organization_unique unique (id, organization_id);
alter table public.contacts add constraint contacts_id_organization_unique unique (id, organization_id);
alter table public.companies add constraint companies_id_organization_unique unique (id, organization_id);
alter table public.contact_company_affiliations
  add constraint affiliations_contact_organization_fk foreign key (contact_id, organization_id) references public.contacts(id, organization_id) on delete cascade,
  add constraint affiliations_company_organization_fk foreign key (company_id, organization_id) references public.companies(id, organization_id) on delete restrict;
alter table public.project_contact_assignments
  add constraint assignments_project_organization_fk foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  add constraint assignments_contact_organization_fk foreign key (contact_id, organization_id) references public.contacts(id, organization_id) on delete restrict,
  add constraint assignments_company_organization_fk foreign key (company_id, organization_id) references public.companies(id, organization_id) on delete restrict;
alter table public.external_contact_identities
  add constraint external_identities_contact_organization_fk foreign key (contact_id, organization_id) references public.contacts(id, organization_id) on delete cascade;

create index contact_emails_normalized_value_idx on public.contact_emails (normalized_value);
create index contact_phones_normalized_value_idx on public.contact_phones (normalized_value);
create unique index contact_emails_one_primary_idx on public.contact_emails (contact_id) where is_primary;
create unique index contact_phones_one_primary_idx on public.contact_phones (contact_id) where is_primary;
create unique index contact_affiliations_one_primary_idx on public.contact_company_affiliations (contact_id) where is_primary and lifecycle = 'active';
create unique index project_contact_roles_unique_idx on public.project_contact_roles (assignment_id, role, coalesce(custom_label, ''));
create index contacts_organization_display_name_idx on public.contacts (organization_id, lower(display_name));
create index companies_organization_domain_idx on public.companies (organization_id, lower(domain));
create index contact_affiliations_contact_idx on public.contact_company_affiliations (contact_id);
create index project_contact_assignments_project_idx on public.project_contact_assignments (project_id);
create index project_contact_assignments_contact_idx on public.project_contact_assignments (contact_id);

alter table public.contact_emails enable row level security;
alter table public.contact_phones enable row level security;
alter table public.contact_addresses enable row level security;
alter table public.companies enable row level security;
alter table public.contact_company_affiliations enable row level security;
alter table public.project_contact_assignments enable row level security;
alter table public.project_contact_roles enable row level security;
alter table public.external_contact_identities enable row level security;
alter table public.contact_import_batches enable row level security;

create policy "members read contact emails" on public.contact_emails for select using (exists (select 1 from public.contacts contact where contact.id = contact_id and public.is_organization_member(contact.organization_id)));
create policy "editors manage contact emails" on public.contact_emails for all using (exists (select 1 from public.contacts contact where contact.id = contact_id and public.can_edit_organization(contact.organization_id))) with check (exists (select 1 from public.contacts contact where contact.id = contact_id and public.can_edit_organization(contact.organization_id)));
create policy "members read contact phones" on public.contact_phones for select using (exists (select 1 from public.contacts contact where contact.id = contact_id and public.is_organization_member(contact.organization_id)));
create policy "editors manage contact phones" on public.contact_phones for all using (exists (select 1 from public.contacts contact where contact.id = contact_id and public.can_edit_organization(contact.organization_id))) with check (exists (select 1 from public.contacts contact where contact.id = contact_id and public.can_edit_organization(contact.organization_id)));
create policy "members read contact addresses" on public.contact_addresses for select using (exists (select 1 from public.contacts contact where contact.id = contact_id and public.is_organization_member(contact.organization_id)));
create policy "editors manage contact addresses" on public.contact_addresses for all using (exists (select 1 from public.contacts contact where contact.id = contact_id and public.can_edit_organization(contact.organization_id))) with check (exists (select 1 from public.contacts contact where contact.id = contact_id and public.can_edit_organization(contact.organization_id)));
create policy "members read companies" on public.companies for select using (public.is_organization_member(organization_id));
create policy "editors manage companies" on public.companies for all using (public.can_edit_organization(organization_id)) with check (public.can_edit_organization(organization_id));
create policy "members read affiliations" on public.contact_company_affiliations for select using (public.is_organization_member(organization_id));
create policy "editors manage affiliations" on public.contact_company_affiliations for all using (public.can_edit_organization(organization_id)) with check (public.can_edit_organization(organization_id));
create policy "members read contact assignments" on public.project_contact_assignments for select using (public.is_organization_member(organization_id));
create policy "editors manage contact assignments" on public.project_contact_assignments for all using (public.can_edit_organization(organization_id)) with check (public.can_edit_organization(organization_id));
create policy "members read contact roles" on public.project_contact_roles for select using (exists (select 1 from public.project_contact_assignments assignment where assignment.id = assignment_id and public.is_organization_member(assignment.organization_id)));
create policy "editors manage contact roles" on public.project_contact_roles for all using (exists (select 1 from public.project_contact_assignments assignment where assignment.id = assignment_id and public.can_edit_organization(assignment.organization_id))) with check (exists (select 1 from public.project_contact_assignments assignment where assignment.id = assignment_id and public.can_edit_organization(assignment.organization_id)));
create policy "members read external identities" on public.external_contact_identities for select using (public.is_organization_member(organization_id));
create policy "editors manage external identities" on public.external_contact_identities for all using (public.can_edit_organization(organization_id)) with check (public.can_edit_organization(organization_id));
create policy "members read contact imports" on public.contact_import_batches for select using (public.is_organization_member(organization_id));
create policy "editors manage contact imports" on public.contact_import_batches for all using (public.can_edit_organization(organization_id)) with check (public.can_edit_organization(organization_id));
