-- Karten-Funktionen: Kneipen kachelweise laden (Web-Mercator-Kacheln z/x/y).
-- Einmal im SQL-Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.
--
-- Unter Zoom 13 zählt der Server die Kneipen in sehr feinen Feldern (16 × 16 je Kachel, also etwa 16 px)
-- und liefert für jedes Feld Anzahl und Schwerpunkt. Die App fasst die Felder nach echtem Abstand zusammen
-- (erst wenn sich Kreise überlappen würden) und setzt jeden Kreis in den gewichteten Schwerpunkt.
-- Weit herausgezoomt zeigt die App einen Kreis je Land (pub_countries).
-- Ab Zoom 13 kommen alle Kneipen der Kachel einzeln. Rückgabe als ein JSON-Wert, damit die
-- 1.000-Zeilen-Grenze der Supabase-API nicht greift.

-- Punkt-Index in Grad (EPSG:4326): eine Kartenkachel ist darin ein Rechteck, die Suche ist schnell.
create index if not exists pubs_point on public.pubs using gist ((st_setsrid(st_makepoint(lon, lat), 4326)));

create or replace function public.pub_tile(p_z integer, p_x integer, p_y integer) returns jsonb
language plpgsql stable set search_path = public, extensions as $$
declare
  env geometry := st_tileenvelope(least(greatest(p_z, 0), 22), p_x, p_y); -- EPSG:3857
  box geometry := st_transform(env, 4326);
  n constant integer := 16;
  cell float8 := (st_xmax(env) - st_xmin(env)) / n;
begin
  if p_z >= 13 then
    return jsonb_build_object('pubs', coalesce((
      select jsonb_agg(to_jsonb(p) - 'geom' - 'osm_id' - 'updated_at')
      from pubs p
      where p.status = 'aktiv' and st_setsrid(st_makepoint(p.lon, p.lat), 4326) && box
        and st_intersects(st_transform(st_setsrid(st_makepoint(p.lon, p.lat), 4326), 3857), env)
    ), '[]'::jsonb));
  end if;

  -- Erst zählen (schnell), dann nur für Felder mit genau einer Kneipe die Kneipe selbst holen
  return jsonb_build_object('cells', coalesce((
    select jsonb_agg(jsonb_build_object('count', g.c, 'lat', g.la, 'lon', g.lo,
             'pub', case when g.c = 1 then (select to_jsonb(p2) - 'geom' - 'osm_id' - 'updated_at' from pubs p2 where p2.id = g.one) end))
    from (
      select count(*)::integer as c, avg(q.lat) as la, avg(q.lon) as lo, min(q.id::text)::uuid as one
      from (
        select p.id, p.lat, p.lon,
               floor((st_x(m) - st_xmin(env)) / cell)::integer as cx,
               floor((st_ymax(env) - st_y(m)) / cell)::integer as cy
        from pubs p
        cross join lateral (select st_transform(st_setsrid(st_makepoint(p.lon, p.lat), 4326), 3857) as m) t
        where p.status = 'aktiv' and st_setsrid(st_makepoint(p.lon, p.lat), 4326) && box
      ) q
      where q.cx between 0 and n - 1 and q.cy between 0 and n - 1
      group by q.cx, q.cy
    ) g
  ), '[]'::jsonb));
end;
$$;

-- Letzte Stufe beim Herauszoomen: ein Kreis je Land, in der Mitte der größten Landesfläche
create or replace function public.pub_countries() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'count', n.cnt,
           'lat', st_y(m.center), 'lon', st_x(m.center)) order by c.code), '[]'::jsonb)
  from countries c
  join (select country, count(*)::integer as cnt from pubs where status = 'aktiv' group by country) n on n.country = c.code
  cross join lateral (
    select case when st_contains(d.geom, st_centroid(d.geom)) then st_centroid(d.geom) else st_pointonsurface(d.geom) end as center
    from (select (st_dump(c.geom)).geom) d
    order by st_area(d.geom) desc
    limit 1
  ) m;
$$;

-- Listenansicht der Karte: die nächsten Kneipen, nach Entfernung
create or replace function public.pubs_nearest(p_lat double precision, p_lon double precision, p_limit integer default 100)
returns jsonb language sql stable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(x.j order by x.distance), '[]'::jsonb) from (
    select (to_jsonb(p) - 'geom' - 'osm_id' - 'updated_at') || jsonb_build_object('distance', st_distance(p.geom, m.me)) as j,
           st_distance(p.geom, m.me) as distance
    from pubs p, (select st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography as me) m
    where p.status = 'aktiv'
    order by p.geom <-> m.me
    limit least(greatest(p_limit, 1), 200)
  ) x;
$$;

revoke execute on function public.pub_tile(integer, integer, integer) from public, anon;
revoke execute on function public.pubs_nearest(double precision, double precision, integer) from public, anon;
grant execute on function public.pub_tile(integer, integer, integer) to authenticated;
revoke execute on function public.pub_countries() from public, anon;
grant execute on function public.pub_countries() to authenticated;
grant execute on function public.pubs_nearest(double precision, double precision, integer) to authenticated;
