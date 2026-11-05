-- service_visits.technician_id references technicians.id, not auth.users.id.
-- Resolve technician ownership through technicians.profile_id consistently.
drop policy if exists service_visits_customer_select_linked on public.service_visits;
drop policy if exists visits_related_select on public.service_visits;
drop policy if exists visits_related_select_hardened on public.service_visits;
drop policy if exists visits_technician_insert_hardened on public.service_visits;
drop policy if exists visits_technician_update on public.service_visits;

create policy visits_admin_all
on public.service_visits
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy service_visits_select_related
on public.service_visits
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.technicians t
    where t.id = service_visits.technician_id
      and t.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.complaints c
    join public.customers cu on cu.id = c.customer_id
    where c.id = service_visits.complaint_id
      and (cu.user_id = auth.uid() or cu.profile_id = auth.uid())
  )
);

create policy service_visits_insert_assigned_technician
on public.service_visits
for insert to authenticated
with check (
  public.is_admin()
  or (
    exists (
      select 1 from public.technicians t
      where t.id = service_visits.technician_id
        and t.profile_id = auth.uid()
    )
    and exists (
      select 1 from public.complaints c
      where c.id = service_visits.complaint_id
        and c.technician_id = auth.uid()
    )
  )
);

create policy service_visits_update_assigned_technician
on public.service_visits
for update to authenticated
using (
  public.is_admin()
  or (
    exists (
      select 1 from public.technicians t
      where t.id = service_visits.technician_id
        and t.profile_id = auth.uid()
    )
    and exists (
      select 1 from public.complaints c
      where c.id = service_visits.complaint_id
        and c.technician_id = auth.uid()
    )
  )
)
with check (
  public.is_admin()
  or (
    exists (
      select 1 from public.technicians t
      where t.id = service_visits.technician_id
        and t.profile_id = auth.uid()
    )
    and exists (
      select 1 from public.complaints c
      where c.id = service_visits.complaint_id
        and c.technician_id = auth.uid()
    )
  )
);
