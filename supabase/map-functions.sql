-- Karten-Funktionen: Kneipen kachelweise laden (Web-Mercator-Kacheln z/x/y).
-- Einmal im SQL-Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.
--
-- Unter Zoom 13 zählt der Server die Kneipen in einem festen Raster (6 × 6 Felder je Kachel).
-- Die Felder hängen nur an der Kachel, nicht am Bildausschnitt: Zahlen bleiben beim Verschieben gleich.
-- Ab Zoom 13 kommen alle Kneipen der Kachel einzeln. Rückgabe als ein JSON-Wert, damit die
-- 1.000-Zeilen-Grenze der Supabase-API nicht greift.

create or replace function public.pub_tile(p_z integer, p_x integer, p_y integer) returns jsonb
language plpgsql stable set search_path = public, extensions as $$
declare
  env geometry := st_tileenvelope(least(greatest(p_z, 0), 22), p_x, p_y); -- EPSG:3857
  box geography := st_transform(env, 4326)::geography;
  n constant integer := 6;
  cell float8 := (st_xmax(env) - st_xmin(env)) / n;
begin
  if p_z >= 13 then
    return jsonb_build_object('pubs', coalesce((
      select jsonb_agg(to_jsonb(p) - 'geom' - 'osm_id' - 'updated_at')
      from pubs p
      where p.status = 'aktiv' and p.geom && box
        and st_intersects(st_transform(st_setsrid(st_makepoint(p.lon, p.lat), 4326), 3857), env)
    ), '[]'::jsonb));
  end if;

  return jsonb_build_object('cells', coalesce((
    select jsonb_agg(jsonb_build_object('count', g.c, 'lat', g.la, 'lon', g.lo, 'pub', case when g.c = 1 then g.pub end))
    from (
      select count(*)::integer as c, avg(q.lat) as la, avg(q.lon) as lo, (array_agg(q.j))[1] as pub
      from (
        select p.lat, p.lon, to_jsonb(p) - 'geom' - 'osm_id' - 'updated_at' as j,
               floor((st_x(m) - st_xmin(env)) / cell)::integer as cx,
               floor((st_ymax(env) - st_y(m)) / cell)::integer as cy
        from pubs p
        cross join lateral (select st_transform(st_setsrid(st_makepoint(p.lon, p.lat), 4326), 3857) as m) t
        where p.status = 'aktiv' and p.geom && box
      ) q
      where q.cx between 0 and n - 1 and q.cy between 0 and n - 1
      group by q.cx, q.cy
    ) g
  ), '[]'::jsonb));
end;
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
grant execute on function public.pubs_nearest(double precision, double precision, integer) to authenticated;
