-- Vorschläge per E-Mail prüfen und Rückmeldung an die Person, die vorgeschlagen hat.
-- Einmal im SQL-Editor ausführen (nach propose-functions.sql). Kann gefahrlos mehrfach ausgeführt werden.

-- mailed_at: Hinweis-Mail an tresenschicht@gmx.net ist raus (nicht doppelt senden)
-- seen_at: die vorschlagende Person hat die Rückmeldung in der App gesehen
alter table public.pub_edits add column if not exists mailed_at timestamptz;
alter table public.pub_edits add column if not exists seen_at timestamptz;

-- Entschiedene eigene Vorschläge, die noch nicht angezeigt wurden (für die Meldung in der App)
create or replace function public.my_review_news() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'kind', e.kind, 'accepted', e.status = 'angenommen',
           'name', coalesce(e.vorschlag ->> 'name', p.name, '')) order by e.created_at), '[]'::jsonb)
  from pub_edits e left join pubs p on p.id = e.pub_id
  where e.user_id = auth.uid() and e.status <> 'offen' and e.seen_at is null;
$$;

create or replace function public.mark_review_news_seen(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update pub_edits set seen_at = now() where user_id = auth.uid() and id = any (p_ids) and seen_at is null;
$$;

revoke execute on function public.my_review_news() from public, anon;
revoke execute on function public.mark_review_news_seen(uuid[]) from public, anon;
grant execute on function public.my_review_news() to authenticated;
grant execute on function public.mark_review_news_seen(uuid[]) to authenticated;

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
