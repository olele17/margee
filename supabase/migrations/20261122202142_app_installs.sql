-- Installations de l'application (PWA) : une ligne par compte et par type d'appareil.
create table public.app_installs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios', 'desktop')),
  installed_at timestamptz not null default now(),
  unique (account_id, platform)
);

alter table public.app_installs enable row level security;

revoke all on public.app_installs from anon, authenticated;
grant select, insert on public.app_installs to authenticated;

-- Chacun n'écrit que ses propres lignes (date fixée par le serveur)
create policy app_installs_insert_own on public.app_installs
  for insert to authenticated
  with check (account_id = (select auth.uid()) and installed_at > now() - interval '1 minute' and installed_at <= now() + interval '1 minute');

create policy app_installs_select_own on public.app_installs
  for select to authenticated
  using (account_id = (select auth.uid()));

-- Admin : totaux uniquement (aucun détail par e-commerçant)
create or replace function public.admin_app_install_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès réservé à l''équipe Margee+.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'total', count(*),
      'accounts', count(distinct i.account_id),
      'android', count(*) filter (where i.platform = 'android'),
      'ios', count(*) filter (where i.platform = 'ios'),
      'desktop', count(*) filter (where i.platform = 'desktop'),
      'last_30_days', count(*) filter (where i.installed_at >= now() - interval '30 days')
    )
    from public.app_installs i
    where not exists (select 1 from public.admins a where a.user_id = i.account_id)
  );
end;
$$;

revoke all on function public.admin_app_install_stats() from public, anon;
grant execute on function public.admin_app_install_stats() to authenticated;
