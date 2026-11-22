-- ══════════════════════════════════════════════════════════════════
-- 0022 · Factures et devis
--
-- Une table « documents » pour les deux types :
--   kind = 'quote'   (devis)   numéro DEV-AAAA-0001, statuts : brouillon,
--                              envoyé, accepté, refusé
--   kind = 'invoice' (facture) numéro FAC-AAAA-0001, statuts : brouillon,
--                              envoyée, payée, annulée
-- Les lignes (désignation, quantité, prix unitaire) sont dans « items ».
-- La base calcule TOUS les montants (sous-total, remise, TVA, total) et
-- attribue le numéro : le navigateur ne peut imposer ni l'un ni l'autre.
-- Numérotation continue par compte, par type et par année, sans doublon
-- même si deux documents sont créés en même temps (verrou de ligne).
-- Accès : comme les autres données métier (propriétaire uniquement ;
-- écriture avec un abonnement ou un essai en cours). Disponible sur tous
-- les plans. « Payée » est un statut : aucune vente n'est créée.
-- ══════════════════════════════════════════════════════════════════

create table public.document_counters (
  account_id  uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('quote', 'invoice')),
  year        integer not null,
  last_number integer not null default 0,
  primary key (account_id, kind, year)
);
alter table public.document_counters enable row level security;
revoke all on public.document_counters from anon, authenticated;

create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind             text not null check (kind in ('quote', 'invoice')),
  number           text not null,
  status           text not null default 'draft',
  client_name      text not null check (char_length(btrim(client_name)) between 1 and 120),
  client_phone     text check (char_length(client_phone) <= 40),
  client_email     text check (char_length(client_email) <= 254),
  client_address   text check (char_length(client_address) <= 200),
  issue_date       date not null default current_date,
  due_date         date,                                  -- échéance (facture) / validité (devis)
  items            jsonb not null,
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  tax_rate         numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  subtotal         bigint not null default 0,
  discount_amount  bigint not null default 0,
  tax_amount       bigint not null default 0,
  total            bigint not null default 0,
  notes            text check (char_length(notes) <= 1000),
  source_quote_id  uuid references public.documents (id) on delete set null,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint documents_number_format check (number ~ '^(DEV|FAC)-[0-9]{4}-[0-9]{4,}$'),
  constraint documents_number_unique unique (account_id, number),
  constraint documents_status_check check (
    (kind = 'quote' and status in ('draft', 'sent', 'accepted', 'refused'))
    or (kind = 'invoice' and status in ('draft', 'sent', 'paid', 'cancelled'))
  ),
  constraint documents_due_after_issue check (due_date is null or due_date >= issue_date)
);
create index documents_account_kind_idx on public.documents (account_id, kind, issue_date desc);
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();

-- ── Numéro + montants calculés par la base ───────────────────────
create or replace function private.documents_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item     jsonb;
  v_qty      numeric;
  v_price    numeric;
  v_desc     text;
  v_items    jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_year     integer;
  v_next     integer;
begin
  -- Lignes : 1 à 50, désignation 1-200 caractères, quantité > 0, prix ≥ 0
  if new.items is null or jsonb_typeof(new.items) <> 'array'
     or jsonb_array_length(new.items) < 1 or jsonb_array_length(new.items) > 50 then
    raise exception 'Ajoute entre 1 et 50 lignes.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(new.items) loop
    v_desc := btrim(coalesce(v_item ->> 'description', ''));
    begin
      v_qty := (v_item ->> 'qty')::numeric;
      v_price := (v_item ->> 'unit_price')::numeric;
    exception when others then
      raise exception 'Quantité ou prix invalide.' using errcode = '22023';
    end;
    if char_length(v_desc) < 1 or char_length(v_desc) > 200 then
      raise exception 'Chaque ligne a besoin d''une désignation (200 caractères maximum).' using errcode = '22023';
    end if;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000 then
      raise exception 'Quantité invalide sur la ligne « % ».', left(v_desc, 40) using errcode = '22023';
    end if;
    if v_price is null or v_price < 0 or v_price > 1000000000 or v_price <> trunc(v_price) then
      raise exception 'Prix unitaire invalide sur la ligne « % » (nombre entier de F CFA).', left(v_desc, 40) using errcode = '22023';
    end if;
    v_items := v_items || jsonb_build_object('description', v_desc, 'qty', v_qty, 'unit_price', v_price,
                                             'total', round(v_qty * v_price));
    v_subtotal := v_subtotal + round(v_qty * v_price);
  end loop;
  new.items := v_items;
  new.client_name := btrim(new.client_name);
  new.subtotal := v_subtotal;
  new.discount_amount := round(v_subtotal * new.discount_percent / 100);
  new.tax_amount := round((v_subtotal - new.discount_amount) * new.tax_rate / 100);
  new.total := v_subtotal - new.discount_amount + new.tax_amount;

  -- Statut « payée » : date de paiement ; sinon effacée
  if new.kind = 'invoice' and new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  else
    new.paid_at := null;
  end if;

  if tg_op = 'INSERT' then
    -- Numéro attribué par la base (le numéro envoyé est ignoré)
    v_year := extract(year from new.issue_date)::integer;
    insert into public.document_counters (account_id, kind, year, last_number)
    values (new.account_id, new.kind, v_year, 1)
    on conflict (account_id, kind, year)
      do update set last_number = public.document_counters.last_number + 1
    returning last_number into v_next;
    new.number := case new.kind when 'quote' then 'DEV' else 'FAC' end
                  || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
  else
    -- Le type, le numéro et le compte ne changent jamais
    new.kind := old.kind;
    new.number := old.number;
    new.account_id := old.account_id;
  end if;
  return new;
end;
$$;
revoke all on function private.documents_prepare() from public, anon, authenticated;

create trigger documents_prepare before insert or update on public.documents
  for each row execute function private.documents_prepare();

-- ── Accès : propriétaire uniquement ──────────────────────────────
alter table public.documents enable row level security;
create policy documents_select_own on public.documents for select to authenticated
  using (account_id = (select auth.uid()));
create policy documents_insert_own on public.documents for insert to authenticated
  with check (account_id = (select auth.uid()) and (select private.has_active_subscription()));
create policy documents_update_own on public.documents for update to authenticated
  using (account_id = (select auth.uid()) and (select private.has_active_subscription()))
  with check (account_id = (select auth.uid()));
create policy documents_delete_own on public.documents for delete to authenticated
  using (account_id = (select auth.uid()) and (select private.has_active_subscription()));
revoke all on public.documents from anon;

-- ── Devis accepté → facture ──────────────────────────────────────
-- Crée la facture (mêmes client, lignes, remise, TVA, notes), lie le
-- devis et le passe en « accepté ». Un devis ne donne qu'une facture.
create or replace function public.convert_quote_to_invoice(p_quote_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.documents%rowtype;
  v_id    uuid;
begin
  select * into v_quote from public.documents where id = p_quote_id and kind = 'quote' for update;
  if not found then
    raise exception 'Devis introuvable.' using errcode = 'P0002';
  end if;
  if v_quote.status = 'refused' then
    raise exception 'Ce devis a été refusé : il ne peut pas devenir une facture.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.documents where source_quote_id = p_quote_id) then
    raise exception 'Une facture a déjà été créée à partir de ce devis.' using errcode = 'P0001';
  end if;
  insert into public.documents (account_id, kind, number, status, client_name, client_phone, client_email,
                                client_address, issue_date, due_date, items, discount_percent, tax_rate, notes, source_quote_id)
  values (v_quote.account_id, 'invoice', 'FAC-0000-0000', 'draft', v_quote.client_name, v_quote.client_phone,
          v_quote.client_email, v_quote.client_address, current_date, current_date + 30, v_quote.items,
          v_quote.discount_percent, v_quote.tax_rate, v_quote.notes, v_quote.id)
  returning id into v_id;
  update public.documents set status = 'accepted' where id = p_quote_id;
  return v_id;
end;
$$;
revoke all on function public.convert_quote_to_invoice(uuid) from public, anon;
grant execute on function public.convert_quote_to_invoice(uuid) to authenticated;
