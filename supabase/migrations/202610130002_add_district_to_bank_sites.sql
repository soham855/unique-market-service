alter table public.sites add column if not exists district text;

-- Keep one linked Bank AMC contract per Admin AMC record; PostgreSQL permits multiple NULL values.
drop index if exists public.amc_contracts_source_amc_id_uidx;
create unique index if not exists amc_contracts_source_amc_id_uidx
  on public.amc_contracts(source_amc_id);

grant select, insert, update, delete on public.amc_contracts to authenticated;
grant select, insert, update, delete on public.bank_amc_visits to authenticated;
grant select on public.sites to authenticated;
