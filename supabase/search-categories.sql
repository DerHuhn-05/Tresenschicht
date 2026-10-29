-- Suche nach Kategorien (Kneipe, Raucherkneipe, Bar, Biergarten) und Ausstattung.
-- Einmal im SQL-Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.
--
-- Mit Standort sortiert die Suche nach Entfernung (die nächsten zuerst). Ohne Suchtext, aber mit Standort:
-- die nächsten Treffer der gewählten Kategorie in der Nähe.
-- Raucherkneipe = Ausstattung „smoking“ (OSM: smoking=yes/dedicated/isolated), kommt mit dem nächsten Import.

drop function if exists public.search_pubs(text, text[]);

create or replace function public.search_pubs(
  q text default '', p_features text[] default '{}', p_types text[] default '{}',
  p_lat double precision default null, p_lon double precision default null
) returns setof public.pubs
language sql stable set search_path = public, extensions as $$
  select p.* from pubs p
  where p.status = 'aktiv'
    and (cardinality(p_features) = 0 or p.features ?& p_features)
    and (cardinality(p_types) = 0 or p.type = any (p_types))
    and (
      length(trim(coalesce(q, ''))) = 0
      or (select bool_and((p.name || ' ' || p.city || ' ' || p.address) ilike '%' || w || '%') from unnest(string_to_array(trim(q), ' ')) w)
    )
    and (length(trim(coalesce(q, ''))) > 0 or p_lat is not null)
  -- mit Standort: die nächsten zuerst; ohne Standort: die besten Namenstreffer zuerst
  order by
    case when p_lat is not null then p.geom <-> st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography end,
    case when length(trim(coalesce(q, ''))) > 0 then -similarity(p.name || ' ' || p.city, q) end
  limit 40;
$$;

revoke execute on function public.search_pubs(text, text[], text[], double precision, double precision) from public, anon;
grant execute on function public.search_pubs(text, text[], text[], double precision, double precision) to authenticated;
