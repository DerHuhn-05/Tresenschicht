-- Neue Kneipe eintragen und dabei gleich einchecken.
-- Einmal im SQL-Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.
--
-- Die Kneipe wird sofort angelegt, aber mit Status 'zu_pruefen': Karte, Suche und Liste zeigen sie noch nicht,
-- in der Sammlung der Person, die sie eingetragen hat, zählt sie aber sofort (inklusive Check-in, wenn sie vor Ort ist).
-- Nach der Prüfung wird sie 'aktiv' und erscheint für alle. Abgelehnt: Kneipe und Check-ins darauf werden gelöscht.

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

revoke execute on function public.propose_pub(text, text, double precision, double precision, text, text, text, boolean, double precision, double precision, double precision) from public, anon;
grant execute on function public.propose_pub(text, text, double precision, double precision, text, text, text, boolean, double precision, double precision, double precision) to authenticated;

-- Prüfung: neue Kneipen mit bereits angelegtem Eintrag freischalten oder entfernen
create or replace function public.review_edit(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  e pub_edits;
begin
  -- Admin in der App oder die Freigabe per E-Mail-Link (Edge Function mit Service-Schlüssel)
  if not (is_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Nur für die Prüfung freigeschaltete Konten.'; end if;
  select * into e from pub_edits where id = p_id and status = 'offen' for update;
  if not found then return; end if;
  update pub_edits set status = case when p_accept then 'angenommen' else 'abgelehnt' end, reviewed_by = auth.uid() where id = p_id;

  if e.kind = 'neu' and e.pub_id is not null then
    if p_accept then
      update pubs set status = 'aktiv', updated_at = now() where id = e.pub_id and status = 'zu_pruefen';
    else
      -- Vorschlag behalten (ohne Verweis), Kneipe samt Check-ins entfernen
      update pub_edits set pub_id = null where id = p_id;
      delete from pubs where id = e.pub_id and status = 'zu_pruefen';
    end if;
    return;
  end if;

  if not p_accept then return; end if;
  if e.kind = 'neu' then
    -- ältere Vorschläge ohne angelegte Kneipe
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
