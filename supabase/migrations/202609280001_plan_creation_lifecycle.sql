alter table public.plans
  add column creation_method text not null default 'guided_assessment'
    check (creation_method in ('guided_assessment', 'blank', 'current_plan', 'revision')),
  add column creation_reason text,
  add column created_by_name text not null default '',
  add column source_assessment_id uuid references public.project_assessments(id) on delete set null,
  add column source_plan_id uuid references public.plans(id) on delete set null,
  add column source_revision_id uuid references public.plan_revisions(id) on delete set null,
  add column superseded_at timestamptz,
  add column superseded_by_plan_id uuid references public.plans(id) on delete set null;

with ranked_plans as (
  select id, row_number() over (partition by project_id order by updated_at desc, created_at desc, id) as recency_rank
  from public.plans
  where superseded_at is null
)
update public.plans
set superseded_at = public.plans.updated_at
from ranked_plans
where public.plans.id = ranked_plans.id
  and ranked_plans.recency_rank > 1;

create unique index plans_one_active_working_version_per_project
  on public.plans(project_id)
  where superseded_at is null;

create index project_assessments_project_updated_at
  on public.project_assessments(project_id, updated_at desc);

create index plans_project_created_at
  on public.plans(project_id, created_at desc);
