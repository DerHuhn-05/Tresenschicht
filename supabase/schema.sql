-- Kneipen-App: Datenbank für Supabase (Postgres + PostGIS)
-- Einmal im SQL-Editor des Supabase-Projekts ausführen. Danach countries.sql (npm run import:countries)
-- und den Kneipen-Import (npm run import:pubs).

create extension if not exists postgis;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

-- users aus dem Anforderungsblatt: Login und E-Mail liegen in auth.users, das Profil hier.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9._]{3,24}$'),
  first_name text not null,
  last_name text not null,
  birth_date date not null check (birth_date <= (current_date - interval '18 years')), -- A5: Mindestalter 18
  city text not null,
  avatar_path text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower on public.profiles (lower(username)); -- A2

create table public.countries (
  code char(2) primary key,
  name text not null,
  geom geometry(MultiPolygon, 4326) not null
);
create index countries_geom on public.countries using gist (geom);

create table public.pubs (
  id uuid primary key default gen_random_uuid(),
  osm_id text unique,
  name text not null,
  type text not null check (type in ('kneipe', 'bar', 'biergarten')), -- C2: keine Clubs
  lat double precision not null,
  lon double precision not null,
  geom geography(Point, 4326) generated always as (st_setsrid(st_makepoint(lon, lat), 4326)::geography) stored,
  address text not null default '',
  city text not null default '',
  country char(2),
  opening_hours text,
  status text not null default 'aktiv' check (status in ('aktiv', 'geschlossen', 'zu_pruefen')),
  source text not null default 'osm' check (source in ('osm', 'nutzer')),
  updated_at timestamptz not null default now()
);
create index pubs_geom on public.pubs using gist (geom);
create index pubs_search on public.pubs using gin ((name || ' ' || city) gin_trgm_ops);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  pub_id uuid not null references public.pubs on delete cascade,
  created_at timestamptz not null default now(),
  accuracy integer not null
);
create index checkins_user_time on public.checkins (user_id, created_at desc);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  path text not null unique, -- im Bucket „photos“: <user_id>/<datei>.jpg
  size integer not null check (size <= 2000000),
  created_at timestamptz not null default now()
);

create table public.checkin_details (
  checkin_id uuid primary key references public.checkins on delete cascade,
  note text check (char_length(note) <= 500),
  bartender text check (char_length(bartender) <= 60),
  drink text check (char_length(drink) <= 40),
  photo_id uuid references public.photos on delete set null,
  photo_alt text check (char_length(photo_alt) <= 200),
  updated_at timestamptz not null default now()
);

create table public.friendships (
  user_id uuid not null references public.profiles on delete cascade,  -- fragt an
  other_id uuid not null references public.profiles on delete cascade, -- nimmt an
  status text not null default 'angefragt' check (status in ('angefragt', 'angenommen')),
  created_at timestamptz not null default now(),
  primary key (user_id, other_id),
  check (user_id <> other_id)
);
create unique index friendships_pair on public.friendships (least(user_id, other_id), greatest(user_id, other_id));

create table public.pub_edits (
  id uuid primary key default gen_random_uuid(),
  pub_id uuid references public.pubs on delete cascade, -- leer bei neuer Kneipe
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('neu', 'aenderung', 'geschlossen')),
  vorschlag jsonb not null,
  status text not null default 'offen' check (status in ('offen', 'angenommen', 'abgelehnt')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a = b or exists (
    select 1 from friendships
    where status = 'angenommen'
      and ((user_id = a and other_id = b) or (user_id = b and other_id = a))
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.country_at(p_lat double precision, p_lon double precision) returns char(2)
language sql stable security definer set search_path = public as $$
  select code from countries where st_contains(geom, st_setsrid(st_makepoint(p_lon, p_lat), 4326)) limit 1;
$$;

-- Profil beim Registrieren aus den Metadaten anlegen. Schlägt fehl bei vergebenem Namen oder unter 18.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, first_name, last_name, birth_date, city)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    (new.raw_user_meta_data ->> 'birth_date')::date,
    new.raw_user_meta_data ->> 'city'
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Zugriffsregeln (Row Level Security)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.countries enable row level security;
alter table public.pubs enable row level security;
alter table public.checkins enable row level security;
alter table public.photos enable row level security;
alter table public.checkin_details enable row level security;
alter table public.friendships enable row level security;
alter table public.pub_edits enable row level security;
alter table public.reports enable row level security;

-- F3: volles Profil nur für dich und deine Freunde; Name und Bild für alle über get_profile()/search_users()
create policy profiles_select on public.profiles for select to authenticated using (are_friends(auth.uid(), id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and is_admin = (select p.is_admin from profiles p where p.id = auth.uid()));

-- Kneipendaten sind öffentlich (OSM); geschlossene bleiben lesbar, damit sie in Sammlungen stehen bleiben
create policy pubs_select on public.pubs for select to authenticated using (true);

-- Check-ins entstehen nur über check_in(); lesen darfst du deine und die deiner Freunde (H2: nie Live-Standorte)
create policy checkins_select on public.checkins for select to authenticated using (are_friends(auth.uid(), user_id));
create policy checkins_delete on public.checkins for delete to authenticated using (user_id = auth.uid());

create policy photos_select on public.photos for select to authenticated using (are_friends(auth.uid(), user_id));
create policy photos_insert on public.photos for insert to authenticated with check (user_id = auth.uid());
create policy photos_delete on public.photos for delete to authenticated using (user_id = auth.uid());

create policy details_select on public.checkin_details for select to authenticated
  using (exists (select 1 from checkins c where c.id = checkin_id and are_friends(auth.uid(), c.user_id)));
create policy details_write on public.checkin_details for all to authenticated
  using (exists (select 1 from checkins c where c.id = checkin_id and c.user_id = auth.uid()))
  with check (exists (select 1 from checkins c where c.id = checkin_id and c.user_id = auth.uid()));

create policy friendships_select on public.friendships for select to authenticated using (auth.uid() in (user_id, other_id));
create policy friendships_insert on public.friendships for insert to authenticated with check (user_id = auth.uid() and status = 'angefragt');
create policy friendships_accept on public.friendships for update to authenticated using (other_id = auth.uid()) with check (status = 'angenommen');
create policy friendships_delete on public.friendships for delete to authenticated using (auth.uid() in (user_id, other_id));

create policy edits_insert on public.pub_edits for insert to authenticated with check (user_id = auth.uid() and status = 'offen');
create policy edits_select on public.pub_edits for select to authenticated using (user_id = auth.uid() or is_admin());

create policy reports_insert on public.reports for insert to authenticated with check (user_id = auth.uid());
create policy reports_select on public.reports for select to authenticated using (is_admin());

-- ---------------------------------------------------------------------------
-- Funktionen für die App (RPC)
-- ---------------------------------------------------------------------------

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where lower(username) = lower(trim(p_username)));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

create or replace function public.pubs_in_bbox(w double precision, s double precision, e double precision, n double precision)
returns setof public.pubs language sql stable as $$
  select * from pubs
  where status = 'aktiv' and geom && st_makeenvelope(w, s, e, n, 4326)::geography
  limit 3000;
$$;

-- C1/C3: Kneipen im Umkreis, nach Entfernung sortiert; Länderprüfung (B4) auf dem Server
create or replace function public.nearby_pubs(p_lat double precision, p_lon double precision, p_accuracy double precision)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me geography := st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography;
begin
  if country_at(p_lat, p_lon) is null then
    return jsonb_build_object('inArea', false, 'pubs', '[]'::jsonb);
  end if;
  return jsonb_build_object('inArea', true, 'pubs', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.distance)
    from (
      select p.id, p.name, p.type, p.lat, p.lon, p.address, p.city, p.country, p.status, p.source, p.opening_hours,
             st_distance(p.geom, me) as distance
      from pubs p
      where p.status = 'aktiv' and st_dwithin(p.geom, me, 50)
      order by st_distance(p.geom, me)
      limit 10
    ) x
  ), '[]'::jsonb));
end;
$$;

create or replace function public.search_pubs(q text) returns setof public.pubs
language sql stable as $$
  select * from pubs
  where status = 'aktiv'
    and (select bool_and((name || ' ' || city || ' ' || address) ilike '%' || w || '%') from unnest(string_to_array(trim(q), ' ')) w)
  order by similarity(name || ' ' || city, q) desc
  limit 30;
$$;

-- C4, C5 und die 12-Stunden-Regel: alles hier, damit sich nichts in der App umgehen lässt
create or replace function public.check_in(p_pub uuid, p_lat double precision, p_lon double precision, p_accuracy double precision)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pub pubs;
  last_ci checkins;
  same_ci checkins;
  new_ci checkins;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;
  perform pg_advisory_xact_lock(hashtext(uid::text)); -- zwei schnelle Tipps zählen nicht doppelt

  if p_accuracy > 100 then return jsonb_build_object('ok', false, 'reason', 'accuracy'); end if;
  if country_at(p_lat, p_lon) is null then return jsonb_build_object('ok', false, 'reason', 'country'); end if;

  select * into pub from pubs where id = p_pub and status = 'aktiv';
  if not found or st_distance(pub.geom, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) > 50 + least(p_accuracy, 50) then
    return jsonb_build_object('ok', false, 'reason', 'too_far');
  end if;

  select * into last_ci from checkins where user_id = uid order by created_at desc limit 1;
  if found and last_ci.created_at > now() - interval '5 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'lock', 'retryAt', last_ci.created_at + interval '5 minutes');
  end if;

  select * into same_ci from checkins where user_id = uid and pub_id = p_pub order by created_at desc limit 1;
  if found and same_ci.created_at > now() - interval '12 hours' then
    return jsonb_build_object('ok', false, 'reason', 'same_pub', 'retryAt', same_ci.created_at + interval '12 hours');
  end if;

  insert into checkins (user_id, pub_id, accuracy) values (uid, p_pub, round(p_accuracy)) returning * into new_ci;
  return jsonb_build_object('ok', true, 'id', new_ci.id, 'at', new_ci.created_at, 'lockedUntil', new_ci.created_at + interval '5 minutes');
end;
$$;

-- Fehlklick: falsche Kneipe gewählt. In den ersten 5 Minuten zurücknehmen, danach hebt sich auch die Sperre auf.
create or replace function public.undo_checkin(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from checkins where id = p_id and user_id = auth.uid() and created_at > now() - interval '5 minutes';
  if not found then raise exception 'Zurücknehmen geht nur in den ersten 5 Minuten. Du kannst den Besuch löschen.'; end if;
end;
$$;

-- E1/E2: Sammlung = Kneipen mit Anzahl Besuchen
create or replace function public.collection(p_user uuid) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x."lastAt" desc), '[]'::jsonb) from (
    select to_jsonb(p) - 'geom' as pub, count(*)::int as visits, min(c.created_at) as "firstAt", max(c.created_at) as "lastAt"
    from checkins c join pubs p on p.id = c.pub_id
    where c.user_id = p_user -- RLS auf checkins: nur du und Freunde
    group by p.id
  ) x;
$$;

-- F1: Suche nach Benutzername; zeigt nur Name und Bild
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
  where p.id <> auth.uid() and length(trim(q)) >= 2 and lower(p.username) like '%' || lower(trim(leading '@' from trim(q))) || '%'
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
  where f.other_id = auth.uid() and f.status = 'angefragt'
  order by f.created_at desc;
$$;

-- Eine Anfrage an jemanden, der dich schon angefragt hat, macht euch direkt zu Freunden.
create or replace function public.send_friend_request(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update friendships set status = 'angenommen' where user_id = p_user and other_id = auth.uid() and status = 'angefragt';
  if not found then
    insert into friendships (user_id, other_id) values (auth.uid(), p_user) on conflict do nothing;
  end if;
end;
$$;

-- D2/D3: Prüfliste anwenden (nur Admin)
create or replace function public.review_edit(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  e pub_edits;
begin
  if not is_admin() then raise exception 'Nur für die Prüfung freigeschaltete Konten.'; end if;
  select * into e from pub_edits where id = p_id and status = 'offen' for update;
  if not found then return; end if;
  update pub_edits set status = case when p_accept then 'angenommen' else 'abgelehnt' end, reviewed_by = auth.uid() where id = p_id;
  if not p_accept then return; end if;
  if e.kind = 'neu' then
    insert into pubs (name, type, lat, lon, address, city, country, source)
    values (e.vorschlag ->> 'name', coalesce(e.vorschlag ->> 'type', 'kneipe'), (e.vorschlag ->> 'lat')::float8, (e.vorschlag ->> 'lon')::float8,
            coalesce(e.vorschlag ->> 'address', ''), coalesce(e.vorschlag ->> 'city', ''),
            country_at((e.vorschlag ->> 'lat')::float8, (e.vorschlag ->> 'lon')::float8), 'nutzer');
  elsif e.kind = 'geschlossen' then
    update pubs set status = 'geschlossen', updated_at = now() where id = e.pub_id;
  else
    update pubs set
      name = coalesce(e.vorschlag ->> 'name', name),
      opening_hours = coalesce(e.vorschlag ->> 'openingHours', opening_hours),
      updated_at = now()
    where id = e.pub_id;
  end if;
end;
$$;

-- A3: Konto löschen (Pflicht). Fotos löscht die App vorher aus dem Speicher.
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from anon;
revoke execute on function public.check_in(uuid, double precision, double precision, double precision) from anon;

-- Aufruf gegen die 7-Tage-Pause von Supabase Free (siehe .github/workflows/keepalive.yml)
create or replace function public.ping() returns text language sql stable as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon;

-- ---------------------------------------------------------------------------
-- Dateispeicher
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2000000, array['image/jpeg']),
       ('avatars', 'avatars', true, 1000000, array['image/jpeg'])
on conflict (id) do nothing;

-- G1/G2: Fotos privat, nur für dich und Freunde
create policy photos_upload on storage.objects for insert to authenticated
  with check (bucket_id in ('photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and are_friends(auth.uid(), ((storage.foldername(name))[1])::uuid));
create policy photos_remove on storage.objects for delete to authenticated
  using (bucket_id in ('photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Import (Inhalt von supabase/import-functions.sql)
-- ---------------------------------------------------------------------------

-- Serverzeit zu Beginn eines Imports (für „in OSM verschwunden“)
create or replace function public.import_now() returns timestamptz
language sql stable as $$ select now() $$;

-- B4: Land mit etwa 1 km Puffer speichern, damit Kneipen an Küste und Grenze nicht herausfallen
create or replace function public.import_country(p_code text, p_name text, p_geom jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_code not in ('DE', 'DK', 'PL', 'CZ', 'AT', 'CH', 'FR', 'LU', 'BE', 'NL', 'IT') then
    raise exception 'Land % gehört nicht zum Arbeitsbereich.', p_code;
  end if;
  insert into countries (code, name, geom)
  values (p_code, p_name, st_multi(st_buffer(st_makevalid(st_setsrid(st_geomfromgeojson(p_geom::text), 4326)), 0.01)))
  on conflict (code) do update set name = excluded.name, geom = excluded.geom;
end;
$$;

-- D1: bis zu einige tausend Kneipen auf einmal übernehmen; Land wird hier bestimmt, Orte außerhalb fallen weg
create or replace function public.import_pubs(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  n integer;
begin
  with r as (
    select distinct on (x.osm_id) x.*
    from jsonb_to_recordset(p_rows) as x(osm_id text, name text, type text, lat float8, lon float8, address text, city text, opening_hours text)
    where x.osm_id is not null and x.type in ('kneipe', 'bar', 'biergarten')
    order by x.osm_id
  ), located as (
    select r.*, (select c.code from countries c where st_contains(c.geom, st_setsrid(st_makepoint(r.lon, r.lat), 4326)) limit 1) as country
    from r
  )
  insert into pubs (osm_id, name, type, lat, lon, address, city, opening_hours, country, source, updated_at)
  select osm_id, name, type, lat, lon, coalesce(address, ''), coalesce(city, ''), nullif(opening_hours, ''), country, 'osm', now()
  from located where country is not null
  on conflict (osm_id) do update set
    name = excluded.name,
    type = excluded.type,
    lat = excluded.lat,
    lon = excluded.lon,
    address = excluded.address,
    city = excluded.city,
    opening_hours = coalesce(excluded.opening_hours, pubs.opening_hours),
    country = excluded.country,
    updated_at = now()
  where pubs.source = 'osm';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Abschluss: Kneipen der importierten Länder, die in OSM fehlen, ausblenden (nicht löschen, Sammlungen bleiben)
create or replace function public.finish_pub_import(p_started timestamptz) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  touched text[];
  closed integer;
begin
  select array_agg(distinct country) into touched from pubs where source = 'osm' and updated_at >= p_started;
  update pubs set status = 'geschlossen', updated_at = now()
  where source = 'osm' and status = 'aktiv' and updated_at < p_started and country = any (coalesce(touched, '{}'));
  get diagnostics closed = row_count;
  return jsonb_build_object(
    'geschlossen', closed,
    'aktiv', (select jsonb_object_agg(country, n) from (select country, count(*) as n from pubs where status = 'aktiv' group by country) s),
    'nach_art', (select jsonb_object_agg(type, n) from (select type, count(*) as n from pubs where status = 'aktiv' group by type) s)
  );
end;
$$;

revoke execute on function public.import_now() from public, anon, authenticated;
revoke execute on function public.import_country(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.import_pubs(jsonb) from public, anon, authenticated;
revoke execute on function public.finish_pub_import(timestamptz) from public, anon, authenticated;
grant execute on function public.import_now() to service_role;
grant execute on function public.import_country(text, text, jsonb) to service_role;
grant execute on function public.import_pubs(jsonb) to service_role;
grant execute on function public.finish_pub_import(timestamptz) to service_role;
