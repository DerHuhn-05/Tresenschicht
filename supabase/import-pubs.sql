-- Kneipen aus pubs.csv (scripts/osm-to-csv.mjs) übernehmen. Läuft im Workflow „Kneipen importieren“.
-- Nutzer-Einträge (source = 'nutzer') bleiben unberührt; Kneipen mit Check-ins werden nie gelöscht.
\set ON_ERROR_STOP 1

create temp table staging (osm_id text, name text, type text, lat float8, lon float8, address text, city text, opening_hours text, features jsonb);
\copy staging from 'pubs.csv' with (format csv, header true)

begin;

insert into public.pubs (osm_id, name, type, lat, lon, address, city, opening_hours, features, source)
select distinct on (osm_id) osm_id, name, type, lat, lon, coalesce(address, ''), coalesce(city, ''), nullif(opening_hours, ''), coalesce(features, '{}'), 'osm'
from staging
order by osm_id
on conflict (osm_id) do update set
  name = excluded.name,
  type = excluded.type,
  lat = excluded.lat,
  lon = excluded.lon,
  address = excluded.address,
  city = excluded.city,
  opening_hours = coalesce(excluded.opening_hours, pubs.opening_hours),
  features = excluded.features,
  updated_at = now()
where pubs.source = 'osm';

-- B4: Land bestimmen; was außerhalb von dem Arbeitsbereich liegt, fliegt raus
update public.pubs p set country = c.code
from public.countries c
where p.source = 'osm' and st_contains(c.geom, st_setsrid(st_makepoint(p.lon, p.lat), 4326)) and p.country is distinct from c.code;

update public.pubs p set country = null
where p.source = 'osm' and p.country is not null
  and not exists (select 1 from public.countries c where c.code = p.country and st_contains(c.geom, st_setsrid(st_makepoint(p.lon, p.lat), 4326)));

delete from public.pubs p
where p.source = 'osm' and p.country is null
  and not exists (select 1 from public.checkins c where c.pub_id = p.id);

-- In OSM verschwunden oder als Club umgetragen: ausblenden statt löschen, damit Sammlungen bleiben
update public.pubs p set status = 'geschlossen', updated_at = now()
where p.source = 'osm' and p.status = 'aktiv' and not exists (select 1 from staging s where s.osm_id = p.osm_id)
  and p.country in (select distinct p2.country from public.pubs p2 join staging s on s.osm_id = p2.osm_id);

commit;

select country as land, type as art, count(*) as anzahl
from public.pubs where status = 'aktiv'
group by rollup (country, type)
order by country nulls last, type nulls last;
