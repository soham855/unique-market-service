-- REVIEW ONLY: Do not apply to production without approval.
-- App: Flutter Customer complaint creation / Technician service visit.
-- Existing policies compare entity UUIDs to auth.uid() and can reject legitimate requests.
-- These additional policies restrict access to the authenticated owner and assigned complaint.
-- Apply and test in a separate staging Supabase project first.

create policy "complaints_customer_insert_linked_profile"
on public.complaints for insert to authenticated
with check (
  exists (
    select 1 from public.customers c
    where c.id = complaints.customer_id
      and (c.user_id = (select auth.uid()) or c.profile_id = (select auth.uid()))
  )
);

create policy "service_visits_technician_insert_linked"
on public.service_visits for insert to authenticated
with check (
  exists (
    select 1 from public.technicians t
    join public.complaints c on c.technician_id = t.profile_id
    where t.id = service_visits.technician_id
      and t.profile_id = (select auth.uid())
      and c.id = service_visits.complaint_id
  )
);

create policy "service_visits_technician_select_linked"
on public.service_visits for select to authenticated
using (
  exists (
    select 1 from public.technicians t
    join public.complaints c on c.technician_id = t.profile_id
    where t.id = service_visits.technician_id
      and t.profile_id = (select auth.uid())
      and c.id = service_visits.complaint_id
  )
);

create policy "service_visits_technician_update_linked"
on public.service_visits for update to authenticated
using (
  exists (
    select 1 from public.technicians t
    join public.complaints c on c.technician_id = t.profile_id
    where t.id = service_visits.technician_id
      and t.profile_id = (select auth.uid())
      and c.id = service_visits.complaint_id
  )
)
with check (
  exists (
    select 1 from public.technicians t
    join public.complaints c on c.technician_id = t.profile_id
    where t.id = service_visits.technician_id
      and t.profile_id = (select auth.uid())
      and c.id = service_visits.complaint_id
  )
);
