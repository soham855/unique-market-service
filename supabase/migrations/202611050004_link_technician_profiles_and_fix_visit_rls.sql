-- Link the operational technician row to its authenticated profile. The two
-- tables intentionally have different UUIDs; service_visits.technician_id
-- references technicians.id while complaints.technician_id references profiles.id.
alter table public.technicians
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create unique index if not exists technicians_profile_id_unique
  on public.technicians(profile_id)
  where profile_id is not null;

-- Backfill only unambiguous phone matches. Do not guess identity when the
-- registered mobile numbers do not match.
with candidates as (
  select
    t.id as technician_id,
    p.id as profile_id,
    count(*) over (partition by t.id) as technician_match_count,
    count(*) over (partition by p.id) as profile_match_count
  from public.technicians t
  join public.profiles p
    on p.role = 'technician'
   and right(regexp_replace(coalesce(t.mobile, ''), '\D', '', 'g'), 10)
       = right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10)
   and length(right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10)) = 10
)
update public.technicians t
set profile_id = c.profile_id
from candidates c
where c.technician_id = t.id
  and c.technician_match_count = 1
  and c.profile_match_count = 1
  and t.profile_id is null;

-- A customer can read their own customer row by its linked auth profile.
create policy customers_linked_profile_select
  on public.customers
  for select
  to authenticated
  using (user_id = auth.uid() or profile_id = auth.uid() or public.is_admin());

-- Replace the old UUID-equality checks with the explicit profile link.
drop policy if exists technicians_self_or_admin_select on public.technicians;
drop policy if exists technicians_self_or_admin_select_hardened on public.technicians;

-- Technician rows are visible only to the profile explicitly linked by an admin.
create policy technicians_linked_profile_select
  on public.technicians
  for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- Remove the old policies that compared technicians.id directly with auth.uid().
drop policy if exists service_visits_customer_select_linked on public.service_visits;
drop policy if exists visits_related_select on public.service_visits;
drop policy if exists visits_related_select_hardened on public.service_visits;
drop policy if exists visits_technician_insert_hardened on public.service_visits;
drop policy if exists visits_technician_update on public.service_visits;

create policy service_visits_linked_select
  on public.service_visits
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.complaints c
      join public.customers cu on cu.id = c.customer_id
      where c.id = service_visits.complaint_id
        and (cu.user_id = auth.uid() or cu.profile_id = auth.uid())
    )
    or exists (
      select 1
      from public.complaints c
      join public.technicians t on t.id = service_visits.technician_id
      where c.id = service_visits.complaint_id
        and c.technician_id = auth.uid()
        and t.profile_id = auth.uid()
    )
  );

create policy visits_technician_insert_linked
  on public.service_visits
  for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.complaints c
      join public.technicians t on t.id = service_visits.technician_id
      where c.id = service_visits.complaint_id
        and c.technician_id = auth.uid()
        and t.profile_id = auth.uid()
    )
  );

create policy visits_technician_update_linked
  on public.service_visits
  for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.complaints c
      join public.technicians t on t.id = service_visits.technician_id
      where c.id = service_visits.complaint_id
        and c.technician_id = auth.uid()
        and t.profile_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.complaints c
      join public.technicians t on t.id = service_visits.technician_id
      where c.id = service_visits.complaint_id
        and c.technician_id = auth.uid()
        and t.profile_id = auth.uid()
    )
  );
