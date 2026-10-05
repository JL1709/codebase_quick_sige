begin;

alter table public.organizations
  add column address jsonb not null default '{"street":"","houseNumber":"","addressAddition":"","postalCode":"","city":"","region":"","countryCode":""}'::jsonb,
  add column phone text not null default '',
  add column phone_extension text not null default '',
  add column mobile_phone text not null default '',
  add column fax text not null default '',
  add column fax_extension text not null default '',
  add column email text not null default '',
  add column website text not null default '',
  add column logo jsonb;

alter table public.organizations
  add constraint organization_address_object check (jsonb_typeof(address) = 'object'),
  add constraint organization_logo_object check (logo is null or jsonb_typeof(logo) = 'object'),
  add constraint organization_phone_length check (char_length(phone) <= 60 and char_length(mobile_phone) <= 60 and char_length(fax) <= 60),
  add constraint organization_phone_extension check (phone_extension = '' or (phone <> '' and phone_extension ~ '^[0-9]{1,10}$')),
  add constraint organization_fax_extension check (fax_extension = '' or (fax <> '' and fax_extension ~ '^[0-9]{1,10}$')),
  add constraint organization_contact_length check (char_length(email) <= 254 and char_length(website) <= 2048);

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.role in ('owner', 'admin')
  );
$$;

create policy "owners and admins update organization profiles"
on public.organizations for update
using (public.can_manage_organization(id))
with check (public.can_manage_organization(id));

-- Account membership, organization identity, and profile edits have separate privileges.
revoke update on public.organizations from authenticated;
grant update (name, address, phone, phone_extension, mobile_phone, fax, fax_extension, email, website, logo, updated_at)
  on public.organizations to authenticated;

commit;
