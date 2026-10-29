-- Beta-Funktionen: Merkliste, Sperren, gemeldete Beiträge prüfen, Filter (Ausstattung der Kneipen).
-- Einmal im SQL-Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.

-- ---------------------------------------------------------------------------
-- Merkliste „Will ich hin“ (nur für dich sichtbar)
-- ---------------------------------------------------------------------------
create table if not exists public.bookmarks (
  user_id uuid not null references public.profiles on delete cascade,
  pub_id uuid not null references public.pubs on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pub_id)
);
alter table public.bookmarks enable row level security;
drop policy if exists bookmarks_own on public.bookmarks;
create policy bookmarks_own on public.bookmarks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.bookmarks to authenticated;

-- ---------------------------------------------------------------------------
-- Sperren: Gesperrte finden dich nicht mehr, können nicht anfragen, Freundschaft endet
-- ---------------------------------------------------------------------------
create table if not exists public.blocks (
  user_id uuid not null references public.profiles on delete cascade,   -- sperrt
  blocked_id uuid not null references public.profiles on delete cascade, -- ist gesperrt
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  check (user_id <> blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.blocks to authenticated;

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (user_id = a and blocked_id = b) or (user_id = b and blocked_id = a));
$$;

create or replace function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user = auth.uid() then raise exception 'Du kannst dich nicht selbst sperren.'; end if;
  insert into blocks (user_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
  delete from friendships where (user_id = auth.uid() and other_id = p_user) or (user_id = p_user and other_id = auth.uid());
end;
$$;

create or replace function public.blocked_users() returns table (id uuid, username text, avatar_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_path from blocks b join profiles p on p.id = b.blocked_id
  where b.user_id = auth.uid() order by p.username;
$$;

-- Bestehende Funktionen um Sperren ergänzen
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert to authenticated
  with check (user_id = auth.uid() and status = 'angefragt' and not is_blocked(user_id, other_id));

create or replace function public.search_users(q text) returns table (id uuid, username text, avatar_path text, friendship text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_path,
    case
      when f.status = 'angenommen' then 'friends'
      when f.user_id = auth.uid() then 'requested_by_me'
      when f.other_id = auth.uid() then 'requested_by_them'
      else 'none'
    end
  from profiles p
  left join friendships f on (f.user_id = auth.uid() and f.other_id = p.id) or (f.other_id = auth.uid() and f.user_id = p.id)
  where p.id <> auth.uid() and not is_blocked(auth.uid(), p.id)
    and length(trim(q)) >= 2 and lower(p.username) like '%' || lower(trim(leading '@' from trim(q))) || '%'
  order by lower(p.username) = lower(trim(q)) desc, p.username
  limit 20;
$$;

create or replace function public.get_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles;
  f friendships;
  rel text := 'none';
begin
  select * into p from profiles where id = p_user;
  if not found then return null; end if;
  if exists (select 1 from blocks where user_id = p_user and blocked_id = auth.uid()) then return null; end if;
  if exists (select 1 from blocks where user_id = auth.uid() and blocked_id = p_user) then
    return jsonb_build_object('id', p.id, 'username', p.username, 'avatar_path', p.avatar_path, 'friendship', 'blocked');
  end if;
  if p_user = auth.uid() then rel := 'self';
  else
    select * into f from friendships where (user_id = auth.uid() and other_id = p_user) or (other_id = auth.uid() and user_id = p_user);
    if found then rel := case when f.status = 'angenommen' then 'friends' when f.user_id = auth.uid() then 'requested_by_me' else 'requested_by_them' end; end if;
  end if;
  if rel in ('self', 'friends') then
    return jsonb_build_object('id', p.id, 'username', p.username, 'avatar_path', p.avatar_path, 'friendship', rel,
      'firstName', p.first_name, 'lastName', p.last_name, 'city', p.city);
  end if;
  return jsonb_build_object('id', p.id, 'username', p.username, 'avatar_path', p.avatar_path, 'friendship', rel);
end;
$$;

create or replace function public.friend_requests() returns table (id uuid, username text, avatar_path text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_path, f.created_at
  from friendships f join profiles p on p.id = f.user_id
  where f.other_id = auth.uid() and f.status = 'angefragt' and not is_blocked(auth.uid(), p.id)
  order by f.created_at desc;
$$;

create or replace function public.send_friend_request(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if is_blocked(auth.uid(), p_user) then raise exception 'Anfrage nicht möglich.'; end if;
  update friendships set status = 'angenommen' where user_id = p_user and other_id = auth.uid() and status = 'angefragt';
  if not found then
    insert into friendships (user_id, other_id) values (auth.uid(), p_user) on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gemeldete Beiträge prüfen (nur Prüfer)
-- ---------------------------------------------------------------------------
alter table public.reports add column if not exists status text not null default 'offen';

create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Nur für die Prüfung freigeschaltete Konten.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reason', r.reason, 'at', r.created_at, 'checkinId', c.id,
      'reporter', rp.username, 'author', ap.username, 'pubName', pb.name,
      'note', d.note, 'bartender', d.bartender, 'drink', d.drink, 'photoPath', ph.path
    ) order by r.created_at)
    from reports r
    join checkins c on c.id = r.checkin_id
    join profiles rp on rp.id = r.user_id
    join profiles ap on ap.id = c.user_id
    join pubs pb on pb.id = c.pub_id
    left join checkin_details d on d.checkin_id = c.id
    left join photos ph on ph.id = d.photo_id
    where r.status = 'offen'
  ), '[]'::jsonb);
end;
$$;

-- p_remove: Text und Foto des Beitrags entfernen (die Datei löscht die App vorher aus dem Speicher)
create or replace function public.admin_resolve_report(p_id uuid, p_remove boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if not is_admin() then raise exception 'Nur für die Prüfung freigeschaltete Konten.'; end if;
  select checkin_id into cid from reports where id = p_id;
  if p_remove then
    delete from photos where id in (select photo_id from checkin_details where checkin_id = cid);
    delete from checkin_details where checkin_id = cid;
    update reports set status = 'entfernt' where checkin_id = cid and status = 'offen';
  else
    update reports set status = 'verworfen' where id = p_id;
  end if;
end;
$$;

drop policy if exists photos_admin_read on storage.objects;
create policy photos_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and is_admin());
drop policy if exists photos_admin_remove on storage.objects;
create policy photos_admin_remove on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and is_admin());

-- ---------------------------------------------------------------------------
-- Ausstattung der Kneipen aus OSM (Filter bei der Suche); füllt der nächste Import
-- ---------------------------------------------------------------------------
alter table public.pubs add column if not exists features jsonb not null default '{}'::jsonb;
create index if not exists pubs_features on public.pubs using gin (features);

drop function if exists public.search_pubs(text);
create or replace function public.search_pubs(q text, p_features text[] default '{}') returns setof public.pubs
language sql stable as $$
  select * from pubs
  where status = 'aktiv'
    and (cardinality(p_features) = 0 or features ?& p_features)
    and (select bool_and((name || ' ' || city || ' ' || address) ilike '%' || w || '%') from unnest(string_to_array(trim(q), ' ')) w)
  order by similarity(name || ' ' || city, q) desc
  limit 30;
$$;
grant execute on function public.search_pubs(text, text[]) to authenticated;

-- Import übernimmt die Ausstattung (ersetzt import_pubs aus import-functions.sql)
create or replace function public.import_pubs(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  n integer;
begin
  with r as (
    select distinct on (x.osm_id) x.*
    from jsonb_to_recordset(p_rows) as x(osm_id text, name text, type text, lat float8, lon float8, address text, city text, opening_hours text, features jsonb)
    where x.osm_id is not null and x.type in ('kneipe', 'bar', 'biergarten')
    order by x.osm_id
  ), located as (
    select r.*, (select c.code from countries c where st_contains(c.geom, st_setsrid(st_makepoint(r.lon, r.lat), 4326)) limit 1) as country
    from r
  )
  insert into pubs (osm_id, name, type, lat, lon, address, city, opening_hours, features, country, source, updated_at)
  select osm_id, name, type, lat, lon, coalesce(address, ''), coalesce(city, ''), nullif(opening_hours, ''), coalesce(features, '{}'), country, 'osm', now()
  from located where country is not null
  on conflict (osm_id) do update set
    name = excluded.name,
    type = excluded.type,
    lat = excluded.lat,
    lon = excluded.lon,
    address = excluded.address,
    city = excluded.city,
    opening_hours = coalesce(excluded.opening_hours, pubs.opening_hours),
    features = excluded.features,
    country = excluded.country,
    updated_at = now()
  where pubs.source = 'osm';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.import_pubs(jsonb) from public, anon, authenticated;
grant execute on function public.import_pubs(jsonb) to service_role;
