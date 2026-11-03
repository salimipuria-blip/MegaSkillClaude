-- Owner-only contract. Any failed assertion raises and stops the run (ON_ERROR_STOP).
\set owner '00000000-0000-0000-0000-00000000000a'
\set other '00000000-0000-0000-0000-00000000000b'
insert into auth.users (id, email) values (:'owner', 'owner@lithos.test'), (:'other', 'other@lithos.test');
insert into public.lithos_owners (user_id) values (:'owner');
insert into public.lithos_kpi_snapshots (qualified_leads, revenue) values (7, 1200);

-- 1. The owner ingests a snapshot through the RPC and reads it back.
set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
do $$
declare v_id bigint;
begin
  v_id := public.lithos_ingest_buffer_snapshot('{"followers":1201,"reach":50,"engagement_rate":2.5,"followers_supported":true}'::jsonb);
  if v_id is null then raise exception 'ingest returned no id'; end if;
  if (select followers from public.lithos_insight_snapshots where id = v_id) <> 1201 then raise exception 'followers not stored'; end if;
  if (select metadata ->> 'followers_supported' from public.lithos_insight_snapshots where id = v_id) <> 'true' then raise exception 'metadata lost'; end if;
  if (select status from public.lithos_sync_state where source = 'buffer') <> 'connected' then raise exception 'source not connected'; end if;
  perform public.lithos_set_buffer_sync_state('error', repeat('x', 900));
  if (select length(last_error) from public.lithos_sync_state where source = 'buffer') <> 500 then raise exception 'error not clipped'; end if;
  if (select count(*) from public.lithos_kpi_snapshots) <> 1 then raise exception 'owner cannot read KPIs'; end if;
end $$;

-- 2. Another signed-in account sees nothing and cannot write.
select set_config('request.jwt.claim.sub', :'other', false);
do $$
begin
  if (select count(*) from public.lithos_insight_snapshots) <> 0 then raise exception 'non-owner read insights'; end if;
  if (select count(*) from public.lithos_kpi_snapshots) <> 0 then raise exception 'non-owner read KPIs'; end if;
  if (select count(*) from public.lithos_sync_state) <> 0 then raise exception 'non-owner read sync state'; end if;
  if (select count(*) from public.lithos_owners) <> 0 then raise exception 'non-owner read the owner list'; end if;
  begin
    perform public.lithos_ingest_buffer_snapshot('{}'::jsonb);
    raise exception 'non-owner ingested';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lithos_set_buffer_sync_state('connected', null);
    raise exception 'non-owner changed sync state';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lithos_insight_snapshots (followers) values (1);
    raise exception 'direct snapshot insert allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lithos_leads (name) values ('x');
    raise exception 'non-owner inserted a lead';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. Anonymous callers get permission errors, not empty results.
reset role;
set role anon;
do $$
begin
  begin
    perform 1 from public.lithos_leads;
    raise exception 'anon read leads';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'owner-only contract: all checks passed' as result;
