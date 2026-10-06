-- Unique Market: service-files bucket policies
-- Apply this migration to enable technician/admin uploads from the Technician App.
create policy "service_files_tech_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'service-files'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('technician', 'admin')
  )
);

create policy "service_files_tech_admin_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'service-files'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('technician', 'admin')
  )
);

create policy "service_files_tech_admin_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'service-files'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('technician', 'admin')
  )
)
with check (
  bucket_id = 'service-files'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('technician', 'admin')
  )
);