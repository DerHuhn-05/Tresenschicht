-- Mitteilungen: Liste in der App und Push auf dem Handy.
-- Einmal im SQL-Editor ausführen (nach notify-functions.sql). Kann gefahrlos mehrfach ausgeführt werden.
--
-- Ereignisse legen eine Zeile in notifications an (Trigger unten), passend zu den Einstellungen der Person.
-- Die Edge Function „push“ verschickt offene Zeilen als Push an alle Geräte der Person (push_subscriptions).

-- Einstellungen je Person; fehlende Schlüssel gelten als Standard (siehe notify_wants)
alter table public.profiles add column if not exists notify jsonb not null default '{}'::jsonb;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('friend_request', 'friend_accepted', 'pub_approved', 'pub_rejected', 'friend_checkin', 'review')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);
create index if not exists notifications_unpushed on public.notifications (created_at) where pushed_at is null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  lang text not null default 'de',
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

drop policy if exists push_select on public.push_subscriptions;
drop policy if exists push_insert on public.push_subscriptions;
drop policy if exists push_update on public.push_subscriptions;
drop policy if exists push_delete on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_update on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Möchte die Person diese Art Mitteilung? Standard: alles an außer „Freund hat eingecheckt“.
create or replace function public.notify_wants(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((p.notify ->> (case when p_kind = 'pub_rejected' then 'pub_approved' else p_kind end))::boolean, p_kind <> 'friend_checkin')
  from profiles p where p.id = p_user;
$$;

create or replace function public.notify_add(p_user uuid, p_kind text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or not coalesce(notify_wants(p_user, p_kind), false) then return; end if;
  insert into notifications (user_id, kind, data) values (p_user, p_kind, p_data);
end;
$$;

-- Freundschaften: neue Anfrage und angenommene Anfrage
create or replace function public.trg_notify_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
begin
  if tg_op = 'INSERT' and new.status = 'angefragt' then
    select * into me from profiles where id = new.user_id;
    perform notify_add(new.other_id, 'friend_request', jsonb_build_object('user_id', me.id, 'username', me.username));
  elsif tg_op = 'UPDATE' and old.status = 'angefragt' and new.status = 'angenommen' then
    select * into me from profiles where id = new.other_id;
    perform notify_add(new.user_id, 'friend_accepted', jsonb_build_object('user_id', me.id, 'username', me.username));
  end if;
  return new;
end;
$$;
drop trigger if exists notify_friendship on public.friendships;
create trigger notify_friendship after insert or update on public.friendships
  for each row execute function public.trg_notify_friendship();

-- Check-in: an alle Freunde (die das eingeschaltet haben)
create or replace function public.trg_notify_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  pub_name text;
  f uuid;
begin
  select * into me from profiles where id = new.user_id;
  select name into pub_name from pubs where id = new.pub_id;
  for f in
    select case when user_id = new.user_id then other_id else user_id end
    from friendships where status = 'angenommen' and (user_id = new.user_id or other_id = new.user_id)
  loop
    if not is_blocked(f, new.user_id) then
      perform notify_add(f, 'friend_checkin', jsonb_build_object('user_id', me.id, 'username', me.username, 'pub_id', new.pub_id, 'pub_name', pub_name));
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_checkin on public.checkins;
create trigger notify_checkin after insert on public.checkins
  for each row execute function public.trg_notify_checkin();

-- Vorschläge: neu → an alle Admins; geprüft → an die Person, die vorgeschlagen hat
create or replace function public.trg_notify_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text;
  pub_name text;
  a uuid;
begin
  pub_name := coalesce(new.vorschlag ->> 'name', (select name from pubs where id = new.pub_id), '');
  if tg_op = 'INSERT' then
    select username into who from profiles where id = new.user_id;
    for a in select id from profiles where is_admin and id <> new.user_id loop
      perform notify_add(a, 'review', jsonb_build_object('edit_id', new.id, 'edit_kind', new.kind, 'pub_name', pub_name, 'username', who));
    end loop;
  elsif old.status = 'offen' and new.status in ('angenommen', 'abgelehnt') then
    perform notify_add(new.user_id, case when new.status = 'angenommen' then 'pub_approved' else 'pub_rejected' end,
      jsonb_build_object('edit_id', new.id, 'edit_kind', new.kind, 'pub_id', new.pub_id, 'pub_name', pub_name));
  end if;
  return new;
end;
$$;
drop trigger if exists notify_edit on public.pub_edits;
create trigger notify_edit after insert or update on public.pub_edits
  for each row execute function public.trg_notify_edit();
