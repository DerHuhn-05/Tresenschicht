-- Einmalige Reparatur: Kneipen wieder einblenden, die der Import fälschlich als „geschlossen“ markiert hat.
-- Kneipen, die Nutzer als geschlossen gemeldet haben und die in der Prüfliste angenommen wurden, bleiben geschlossen.
update public.pubs p set status = 'aktiv', updated_at = now()
where p.source = 'osm' and p.status = 'geschlossen'
  and not exists (
    select 1 from public.pub_edits e
    where e.pub_id = p.id and e.kind = 'geschlossen' and e.status = 'angenommen'
  );

-- Ergebnis: aktive Kneipen je Land
select country as land, count(*) as kneipen from public.pubs where status = 'aktiv' group by country order by country;
