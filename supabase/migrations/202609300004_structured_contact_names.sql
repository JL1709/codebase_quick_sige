-- Contacts have one canonical name source: prefix, given name, family name, and suffix.
-- Preserve older full-name values before removing the two duplicate columns.
with legacy_names as (
  select
    id,
    regexp_split_to_array(
      coalesce(nullif(trim(display_name), ''), nullif(trim(name), '')),
      '\s+'
    ) as name_parts
  from public.contacts
  where nullif(trim(given_name), '') is null
    and nullif(trim(family_name), '') is null
    and coalesce(nullif(trim(display_name), ''), nullif(trim(name), '')) is not null
)
update public.contacts contact
set given_name = case
      when cardinality(legacy.name_parts) <= 1 then coalesce(legacy.name_parts[1], '')
      else array_to_string(legacy.name_parts[1:cardinality(legacy.name_parts) - 1], ' ')
    end,
    family_name = case
      when cardinality(legacy.name_parts) <= 1 then ''
      else legacy.name_parts[cardinality(legacy.name_parts)]
    end
from legacy_names legacy
where contact.id = legacy.id;

alter table public.contacts
  drop constraint if exists contacts_meaningful_identity_check;

drop index if exists public.contacts_organization_display_name_idx;

alter table public.contacts
  drop column if exists display_name,
  drop column if exists name,
  add constraint contacts_meaningful_identity_check check (
    nullif(trim(given_name), '') is not null
    or nullif(trim(family_name), '') is not null
  );

create index contacts_organization_structured_name_idx
  on public.contacts (organization_id, lower(family_name), lower(given_name));
