-- Import-Funktionen für den Workflow „Kneipen importieren“ (scripts/import-supabase.mjs).
-- Einmal im SQL-Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.
-- Aufrufbar nur mit dem Service-Role-Key, nicht aus der App.

-- Serverzeit zu Beginn eines Imports (für „in OSM verschwunden“)
create or replace function public.import_now() returns timestamptz
language sql stable as $$ select now() $$;

-- B4: Land mit etwa 1 km Puffer speichern, damit Kneipen an Küste und Grenze nicht herausfallen
create or replace function public.import_country(p_code text, p_name text, p_geom jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_code not in ('DE', 'DK', 'PL', 'CZ', 'AT', 'CH', 'FR', 'LU', 'BE', 'NL', 'IT', 'ES') then
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
