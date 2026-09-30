-- A participant's company belongs to the canonical contact affiliation, not to a
-- project assignment. Preserve any legacy assignment-only company before
-- removing the duplicate source of truth.
insert into public.contact_company_affiliations (
  organization_id,
  contact_id,
  company_id,
  is_primary,
  lifecycle,
  created_at,
  updated_at
)
select
  assignment.organization_id,
  assignment.contact_id,
  assignment.company_id,
  false,
  assignment.lifecycle,
  assignment.created_at,
  assignment.updated_at
from public.project_contact_assignments assignment
where assignment.company_id is not null
on conflict (contact_id, company_id) do update
set lifecycle = case
      when excluded.lifecycle = 'active' then 'active'
      else public.contact_company_affiliations.lifecycle
    end,
    updated_at = greatest(public.contact_company_affiliations.updated_at, excluded.updated_at);

with primary_candidates as (
  select
    affiliation.id,
    row_number() over (
      partition by affiliation.contact_id
      order by affiliation.updated_at desc, affiliation.created_at desc, affiliation.id
    ) as candidate_order
  from public.contact_company_affiliations affiliation
  where affiliation.lifecycle = 'active'
    and not exists (
      select 1
      from public.contact_company_affiliations current_primary
      where current_primary.contact_id = affiliation.contact_id
        and current_primary.lifecycle = 'active'
        and current_primary.is_primary
    )
)
update public.contact_company_affiliations affiliation
set is_primary = true,
    updated_at = now()
from primary_candidates candidate
where affiliation.id = candidate.id
  and candidate.candidate_order = 1;

alter table public.project_contact_assignments
  drop constraint if exists assignments_company_organization_fk,
  drop constraint if exists project_contact_assignments_company_id_fkey,
  drop column if exists company_id;
