alter table public.amc add column if not exists site_id uuid references public.sites(id) on delete set null;

alter table public.amc_contracts add column if not exists source_amc_id uuid references public.amc(id) on delete set null;

create unique index if not exists amc_contracts_source_amc_id_uidx on public.amc_contracts(source_amc_id) where source_amc_id is not null;

grant select, insert, update, delete on public.amc_contracts to authenticated;
grant select, insert, update, delete on public.bank_amc_visits to authenticated;
grant select on public.sites to authenticated;
