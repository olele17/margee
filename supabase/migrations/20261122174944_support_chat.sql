-- ══════════════════════════════════════════════════════════════════
-- 0020 · Messagerie de support (e-commerçant ⇄ équipe Margee+)
--
-- Une conversation par e-commerçant (support_threads), des messages
-- (support_messages). L'e-commerçant écrit depuis son espace ; le super
-- admin et le support répondent depuis /admin/messages.
--
-- Sécurité :
--   - un e-commerçant ne lit que SA conversation (RLS) et n'écrit que par
--     send_support_message (expéditeur forcé à « merchant ») ;
--   - un compte suspendu peut quand même écrire au support ;
--   - seuls les admins ACTIFS lisent toutes les conversations et répondent
--     (fonctions admin_*), le nom de l'admin n'est jamais montré au client ;
--   - anti-abus : 30 messages par heure et par compte, 2 000 caractères.
-- ══════════════════════════════════════════════════════════════════

create table public.support_threads (
  account_id       uuid primary key references public.profiles (id) on delete cascade,
  status           text not null default 'open' check (status in ('open', 'closed')),
  last_message_at  timestamptz not null default now(),
  last_sender      text not null default 'merchant' check (last_sender in ('merchant', 'admin')),
  last_preview     text not null default '',
  merchant_read_at timestamptz,
  admin_read_at    timestamptz,
  created_at       timestamptz not null default now()
);
create index support_threads_last_idx on public.support_threads (status, last_message_at desc);

create table public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.support_threads (account_id) on delete cascade,
  sender      text not null check (sender in ('merchant', 'admin')),
  author_id   uuid references auth.users (id) on delete set null,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index support_messages_thread_idx on public.support_messages (account_id, created_at);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

-- Lecture : l'e-commerçant voit sa conversation. author_id n'est pas
-- exposé au client (colonne non accordée), l'équipe reste « Margee+ ».
create policy support_threads_select_own on public.support_threads for select to authenticated
  using (account_id = (select auth.uid()));
create policy support_messages_select_own on public.support_messages for select to authenticated
  using (account_id = (select auth.uid()));
revoke all on public.support_threads, public.support_messages from anon, authenticated;
grant select (account_id, status, last_message_at, last_sender, merchant_read_at, created_at) on public.support_threads to authenticated;
grant select (id, account_id, sender, body, created_at) on public.support_messages to authenticated;

-- ── Côté e-commerçant ────────────────────────────────────────────
create or replace function public.send_support_message(p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_msg  public.support_messages%rowtype;
begin
  if v_uid is null then
    raise exception 'Connecte-toi pour écrire au support.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid)
     or exists (select 1 from public.admins where user_id = v_uid) then
    raise exception 'Messagerie réservée aux comptes e-commerçants.' using errcode = '42501';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'Écris ton message avant de l''envoyer.' using errcode = '22023';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Message trop long (2 000 caractères maximum).' using errcode = '22023';
  end if;
  if (select count(*) from public.support_messages
       where account_id = v_uid and sender = 'merchant' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Tu as envoyé beaucoup de messages : patiente un peu, l''équipe te répond.' using errcode = 'P0001';
  end if;

  insert into public.support_threads (account_id) values (v_uid) on conflict (account_id) do nothing;
  insert into public.support_messages (account_id, sender, author_id, body)
  values (v_uid, 'merchant', v_uid, v_body) returning * into v_msg;
  update public.support_threads
     set status = 'open', last_message_at = v_msg.created_at, last_sender = 'merchant',
         last_preview = left(v_body, 140), merchant_read_at = v_msg.created_at
   where account_id = v_uid;
  return jsonb_build_object('id', v_msg.id, 'created_at', v_msg.created_at);
end;
$$;
revoke all on function public.send_support_message(text) from public, anon;
grant execute on function public.send_support_message(text) to authenticated;

-- Marque les réponses de l'équipe comme lues
create or replace function public.mark_support_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.support_threads set merchant_read_at = now() where account_id = (select auth.uid());
$$;
revoke all on function public.mark_support_read() from public, anon;
grant execute on function public.mark_support_read() to authenticated;

-- ── Côté équipe (super admin et support) ─────────────────────────
create or replace function public.admin_list_threads(
  p_status text default null, p_unread boolean default null, p_search text default null,
  p_page integer default 1, p_page_size integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_size   integer := least(greatest(coalesce(p_page_size, 30), 1), 200);
  v_page   integer := greatest(coalesce(p_page, 1), 1);
  v_search text := nullif(btrim(p_search), '');
  v_like   text;
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'Accès réservé à l''équipe Margee+.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'closed') then
    raise exception 'Statut invalide.' using errcode = '22023';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with base as (
    select t.*, p.business_name, p.email, p.owner_name,
           (t.last_sender = 'merchant' and (t.admin_read_at is null or t.admin_read_at < t.last_message_at)) as unread
      from public.support_threads t
      join public.profiles p on p.id = t.account_id
     where (p_status is null or t.status = p_status)
       and (v_like is null or p.business_name ilike v_like or p.email ilike v_like or t.last_preview ilike v_like)
  ),
  filtered as (select * from base where p_unread is null or unread = p_unread)
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'unread_total', (select count(*) from base where unread),
    'page', v_page,
    'rows', coalesce((
      select jsonb_agg(r) from (
        select f.account_id, f.business_name, f.owner_name, f.email, f.status, f.last_message_at,
               f.last_sender, f.last_preview, f.unread
          from filtered f
         order by f.unread desc, f.last_message_at desc
         limit v_size offset (v_page - 1) * v_size
      ) r
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_list_threads(text, boolean, text, integer, integer) from public, anon;
grant execute on function public.admin_list_threads(text, boolean, text, integer, integer) to authenticated;

-- Nombre de conversations en attente de réponse (badge du menu admin)
create or replace function public.admin_unread_threads()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès réservé à l''équipe Margee+.' using errcode = '42501';
  end if;
  return (select count(*)::integer from public.support_threads t
           where t.last_sender = 'merchant' and (t.admin_read_at is null or t.admin_read_at < t.last_message_at));
end;
$$;
revoke all on function public.admin_unread_threads() from public, anon;
grant execute on function public.admin_unread_threads() to authenticated;

-- Messages d'une conversation (marque la conversation comme lue par l'équipe)
create or replace function public.admin_thread_messages(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'Accès réservé à l''équipe Margee+.' using errcode = '42501';
  end if;
  update public.support_threads set admin_read_at = now() where account_id = p_account_id;
  select jsonb_build_object(
    'thread', (select to_jsonb(t) - 'last_preview' from public.support_threads t where t.account_id = p_account_id),
    'account', (select jsonb_build_object('id', p.id, 'business_name', p.business_name, 'owner_name', p.owner_name, 'email', p.email, 'phone', p.phone)
                  from public.profiles p where p.id = p_account_id),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at,
               'author_email', case when m.sender = 'admin' then u.email end)
             order by m.created_at)
        from public.support_messages m left join auth.users u on u.id = m.author_id
       where m.account_id = p_account_id
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_thread_messages(uuid) from public, anon;
grant execute on function public.admin_thread_messages(uuid) to authenticated;

create or replace function public.admin_send_support_message(p_account_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_msg  public.support_messages%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Accès réservé à l''équipe Margee+.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_account_id)
     or exists (select 1 from public.admins where user_id = p_account_id) then
    raise exception 'Compte e-commerçant introuvable.' using errcode = 'P0002';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'Écris ta réponse avant de l''envoyer.' using errcode = '22023';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Message trop long (2 000 caractères maximum).' using errcode = '22023';
  end if;
  insert into public.support_threads (account_id) values (p_account_id) on conflict (account_id) do nothing;
  insert into public.support_messages (account_id, sender, author_id, body)
  values (p_account_id, 'admin', (select auth.uid()), v_body) returning * into v_msg;
  update public.support_threads
     set status = 'open', last_message_at = v_msg.created_at, last_sender = 'admin',
         last_preview = left(v_body, 140), admin_read_at = v_msg.created_at
   where account_id = p_account_id;
  return jsonb_build_object('id', v_msg.id, 'created_at', v_msg.created_at);
end;
$$;
revoke all on function public.admin_send_support_message(uuid, text) from public, anon;
grant execute on function public.admin_send_support_message(uuid, text) to authenticated;

create or replace function public.admin_set_thread_status(p_account_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès réservé à l''équipe Margee+.' using errcode = '42501';
  end if;
  if p_status not in ('open', 'closed') then
    raise exception 'Statut invalide.' using errcode = '22023';
  end if;
  update public.support_threads set status = p_status where account_id = p_account_id;
  if not found then
    raise exception 'Conversation introuvable.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.admin_set_thread_status(uuid, text) from public, anon;
grant execute on function public.admin_set_thread_status(uuid, text) to authenticated;
