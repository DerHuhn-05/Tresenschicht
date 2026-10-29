-- Check-in-Umkreis 20 m (plus bis zu 20 m Spielraum je nach GPS-Genauigkeit, also höchstens 40 m).
-- Einmal im SQL-Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.

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
      where p.status = 'aktiv' and st_dwithin(p.geom, me, 20 + least(greatest(p_accuracy, 0), 20))
      order by st_distance(p.geom, me)
      limit 10
    ) x
  ), '[]'::jsonb));
end;
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
  if not found or st_distance(pub.geom, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) > 20 + least(p_accuracy, 20) then
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

create or replace function public.propose_pub(
  p_name text, p_type text, p_lat double precision, p_lon double precision, p_address text, p_city text,
  p_photo_path text default null,
  p_checkin boolean default false, p_pos_lat double precision default null, p_pos_lon double precision default null,
  p_accuracy double precision default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  land text;
  new_pub pubs;
  last_ci checkins;
  new_ci checkins;
  ci jsonb := null;
begin
  if uid is null then raise exception 'Bitte melde dich an.'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if length(trim(coalesce(p_name, ''))) = 0 or length(p_name) > 80 then raise exception 'Bitte gib einen Namen an.'; end if;
  if p_type not in ('kneipe', 'bar', 'biergarten') then raise exception 'Unbekannte Art.'; end if;
  land := country_at(p_lat, p_lon);
  if land is null then raise exception 'Kneipen gehen nur in Deutschland, seinen Nachbarländern, Italien und Spanien.'; end if;
  -- Schutz vor Massen-Einträgen: höchstens 10 offene Vorschläge am Tag
  if (select count(*) from pub_edits where user_id = uid and kind = 'neu' and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Du hast heute schon 10 Kneipen eingetragen. Morgen geht es weiter.';
  end if;

  insert into pubs (name, type, lat, lon, address, city, country, source, status)
  values (trim(p_name), p_type, p_lat, p_lon, coalesce(trim(p_address), ''), coalesce(trim(p_city), ''), land, 'nutzer', 'zu_pruefen')
  returning * into new_pub;

  insert into pub_edits (pub_id, user_id, kind, vorschlag)
  values (new_pub.id, uid, 'neu', jsonb_build_object('name', new_pub.name, 'type', p_type, 'lat', p_lat, 'lon', p_lon,
          'address', new_pub.address, 'city', new_pub.city, 'photoPath', p_photo_path, 'checkin', p_checkin));

  if p_checkin then
    -- dieselben Regeln wie check_in(): Genauigkeit, Abstand, 5-Minuten-Sperre
    if p_accuracy is null or p_accuracy > 100 then
      ci := jsonb_build_object('ok', false, 'reason', 'accuracy');
    elsif st_distance(new_pub.geom, st_setsrid(st_makepoint(p_pos_lon, p_pos_lat), 4326)::geography) > 20 + least(p_accuracy, 20) then
      ci := jsonb_build_object('ok', false, 'reason', 'too_far');
    else
      select * into last_ci from checkins where user_id = uid order by created_at desc limit 1;
      if found and last_ci.created_at > now() - interval '5 minutes' then
        ci := jsonb_build_object('ok', false, 'reason', 'lock', 'retryAt', last_ci.created_at + interval '5 minutes');
      else
        insert into checkins (user_id, pub_id, accuracy) values (uid, new_pub.id, round(p_accuracy)) returning * into new_ci;
        ci := jsonb_build_object('ok', true, 'id', new_ci.id, 'at', new_ci.created_at, 'lockedUntil', new_ci.created_at + interval '5 minutes');
      end if;
    end if;
  end if;

  return jsonb_build_object('pubId', new_pub.id, 'checkin', ci);
end;
$$;

