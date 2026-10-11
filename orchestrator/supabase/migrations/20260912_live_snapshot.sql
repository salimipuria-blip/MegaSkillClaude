-- PORYA OMNI live schema baseline
-- Captured read-only from Supabase project aupkeramhsufnmhkbihl on 2026-09-12.
-- Recovery baseline only; do not apply to the existing production project.
-- Secret values and production rows are intentionally excluded.

create schema if not exists private;

-- Extensions observed by the recovered runtime. pg_net is currently installed in public
-- and is intentionally not relocated by this read-only recovery phase.
create extension if not exists http with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create table if not exists private.github_llm_sources (
  repo_id bigint primary key,
  full_name text not null unique,
  html_url text not null,
  description text,
  stars integer not null default 0,
  forks integer not null default 0,
  language text,
  license_spdx text,
  topics jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  pushed_at timestamptz,
  github_updated_at timestamptz,
  readme_excerpt text,
  score double precision not null default 0,
  capability_class text not null default 'research_only',
  has_api boolean not null default false,
  openai_compatible boolean not null default false,
  free_signal boolean not null default false,
  self_hosted boolean not null default false,
  gateway boolean not null default false,
  eligible boolean not null default false,
  status text not null default 'candidate' check (status in ('candidate','reviewed','promoted','rejected')),
  evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_scanned_at timestamptz not null default now(),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','verified_anonymous','verified_auth_required','self_hosted_only','not_provider','probe_failed','manual_review')),
  verification_kind text,
  verification_score double precision not null default 0,
  endpoint_base_url text,
  models_url text,
  chat_url text,
  auth_required boolean,
  free_verified boolean not null default false,
  probe_status integer,
  verified_at timestamptz,
  verification_evidence jsonb not null default '{}'::jsonb
);

create table if not exists private.github_scan_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(), finished_at timestamptz,
  mode text not null, queries jsonb not null default '[]'::jsonb,
  search_results integer not null default 0, unique_repos integer not null default 0,
  readmes_fetched integer not null default 0, upserted integer not null default 0,
  eligible integer not null default 0, rate_limit_remaining integer, error text,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists private.github_verification_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(), finished_at timestamptz,
  source text not null default 'manual', selected_count integer not null default 0,
  verified_count integer not null default 0, promoted_count integer not null default 0,
  rejected_count integer not null default 0, error_count integer not null default 0,
  error text, meta jsonb not null default '{}'::jsonb
);

create table if not exists private.dynamic_llm_providers (
  id bigint generated always as identity primary key,
  provider_key text not null unique, display_name text not null,
  source_repo_id bigint references private.github_llm_sources(repo_id) on delete set null,
  base_url text not null, models_url text not null, chat_url text not null,
  auth_mode text not null default 'none' check (auth_mode in ('none','bearer','other')),
  zero_cost_verified boolean not null default false,
  anonymous_verified boolean not null default false,
  enabled boolean not null default false, default_model text,
  models jsonb not null default '[]'::jsonb, last_probe_at timestamptz,
  last_probe_status integer, evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists private.skills (
  skill_id uuid primary key default gen_random_uuid(),
  skill_key text not null unique, name text not null, summary text not null,
  instructions text not null, category text not null default 'general',
  subcategories text[] not null default '{}',
  keywords text[] not null check (cardinality(keywords) >= 5),
  trigger_phrases text[] not null default '{}', tools_required text[] not null default '{}',
  runtimes text[] not null default '{}', dependencies jsonb not null default '[]'::jsonb,
  input_types text[] not null default '{}', output_types text[] not null default '{}',
  risk_level text not null default 'low' check (risk_level in ('low','medium','high')),
  quality_score double precision not null default 0 check (quality_score between 0 and 1),
  usage_count bigint not null default 0 check (usage_count >= 0),
  success_count bigint not null default 0 check (success_count >= 0),
  failure_count bigint not null default 0 check (failure_count >= 0),
  success_rate double precision not null default 0 check (success_rate between 0 and 1),
  average_latency_ms double precision not null default 0 check (average_latency_ms >= 0),
  version text not null default '1', status text not null default 'active'
    check (status in ('active','quarantined','disabled')),
  source_ref text, checksum text, embedding vector, embedding_model text,
  embedding_dims integer check (embedding_dims is null or embedding_dims > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  search_text text not null default ''::text
);

create table if not exists private.skill_chunks (
  chunk_id bigint generated always as identity primary key,
  skill_id uuid not null references private.skills(skill_id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_type text not null default 'instructions' check (chunk_type in ('instructions','example','reference','notes')),
  content text not null, token_estimate integer check (token_estimate is null or token_estimate >= 0),
  embedding vector, embedding_model text,
  embedding_dims integer check (embedding_dims is null or embedding_dims > 0),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique (skill_id, chunk_index)
);

create table if not exists private.skill_assets (
  asset_id bigint generated always as identity primary key,
  skill_id uuid not null references private.skills(skill_id) on delete cascade,
  asset_type text not null check (asset_type in ('original_skill','installed_skill','reference','script','other')),
  source_path text not null, content text not null, sha256 text not null,
  is_canonical boolean not null default false, created_at timestamptz not null default now(),
  unique (skill_id, asset_type, source_path)
);

create table if not exists private.skill_executions (
  execution_id uuid primary key default gen_random_uuid(), task_id uuid,
  skill_id uuid not null references private.skills(skill_id) on delete cascade,
  started_at timestamptz not null default now(), finished_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms >= 0), success boolean,
  error_class text, quality_score double precision check (quality_score is null or quality_score between 0 and 1),
  fallback_used boolean not null default false, metadata jsonb not null default '{}'::jsonb
);

create table if not exists private.task_executions (
  task_id uuid primary key default gen_random_uuid(), objective_hash text, task_profile text,
  selected_skill_ids uuid[] not null default '{}', provider text, model text,
  started_at timestamptz not null default now(), finished_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms >= 0), success boolean,
  error_class text, fallback_used boolean not null default false,
  estimated_cost double precision check (estimated_cost is null or estimated_cost >= 0),
  quality_score double precision check (quality_score is null or quality_score between 0 and 1),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists private.skill_import_staging (
  import_key text not null, chunk_index integer not null check (chunk_index >= 0),
  payload_b64 text not null, created_at timestamptz not null default now(),
  primary key (import_key, chunk_index)
);

create table if not exists private.skill_install_runs (
  install_id text primary key, bundle_id text, expected_skills integer, expected_triggers integer,
  source_hash text, payload_sha256 text,
  status text not null default 'staging' check (status in ('staging','installing','installed','failed')),
  installed_skills integer not null default 0, installed_assets integer not null default 0,
  installed_triggers integer not null default 0, repaired_skills integer not null default 0,
  error text, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists private.skill_install_staging (
  install_id text not null, chunk_index integer not null check (chunk_index >= 0),
  payload_chunk text not null, created_at timestamptz not null default now(),
  primary key (install_id, chunk_index)
);

create table if not exists private.skill_install_payload_chunks (
  install_id text not null, chunk_index integer not null check (chunk_index >= 0),
  data text not null, created_at timestamptz not null default now(),
  primary key (install_id, chunk_index)
);

create table if not exists private.skill_runtime_policy (
  singleton boolean primary key default true check (singleton),
  install_mode text not null default 'preinstalled' check (install_mode = 'preinstalled'),
  lazy_install_enabled boolean not null default false check (lazy_install_enabled = false),
  updated_at timestamptz not null default now()
);

create or replace view private.skill_install_status as
select install_id,bundle_id,expected_skills,expected_triggers,status,installed_skills,
       installed_assets,installed_triggers,repaired_skills,error,started_at,finished_at,updated_at
from private.skill_install_runs;

-- Internal schemas/tables are not exposed through the public Data API.
alter table private.github_llm_sources enable row level security;
alter table private.github_scan_runs enable row level security;
alter table private.github_verification_runs enable row level security;
alter table private.dynamic_llm_providers enable row level security;
alter table private.skills enable row level security;
alter table private.skill_chunks enable row level security;
alter table private.skill_assets enable row level security;
alter table private.skill_executions enable row level security;
alter table private.task_executions enable row level security;
alter table private.skill_import_staging enable row level security;
alter table private.skill_install_runs enable row level security;
alter table private.skill_install_staging enable row level security;
alter table private.skill_install_payload_chunks enable row level security;
alter table private.skill_runtime_policy enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

create or replace function private.enforce_github_llm_source_eligibility()
returns trigger language plpgsql set search_path to '' as $$
begin
  new.eligible := coalesce(new.eligible,false)
    and coalesce(new.archived,false)=false
    and coalesce(new.has_api,false)=true;
  return new;
end;
$$;

drop trigger if exists github_llm_sources_enforce_eligibility on private.github_llm_sources;
create trigger github_llm_sources_enforce_eligibility
before insert or update on private.github_llm_sources
for each row execute function private.enforce_github_llm_source_eligibility();

create or replace function private.enforce_skill_runtime_policy()
returns trigger language plpgsql set search_path to '' as $$
begin
  new.install_mode:='preinstalled';
  new.lazy_install_enabled:=false;
  new.singleton:=true;
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists skill_runtime_policy_guard on private.skill_runtime_policy;
create trigger skill_runtime_policy_guard before insert or update on private.skill_runtime_policy
for each row execute function private.enforce_skill_runtime_policy();

create or replace function private.load_skill(p_skill_key text)
returns jsonb language sql stable set search_path to '' as $$
 select jsonb_build_object(
   'skill_id',s.skill_id,'skill_key',s.skill_key,'name',s.name,'summary',s.summary,'category',s.category,
   'keywords',s.keywords,'triggers',s.trigger_phrases,'instructions',s.instructions,'risk_level',s.risk_level,
   'quality_score',s.quality_score,'version',s.version,'source_ref',s.source_ref,'checksum',s.checksum,'metadata',s.metadata,
   'assets',(select coalesce(jsonb_agg(jsonb_build_object('asset_type',a.asset_type,'source_path',a.source_path,
      'sha256',a.sha256,'is_canonical',a.is_canonical) order by a.asset_type,a.source_path),'[]'::jsonb)
      from private.skill_assets a where a.skill_id=s.skill_id)
 ) from private.skills s where s.skill_key=p_skill_key limit 1;
$$;

create or replace function private.search_skills(p_query text, p_limit integer default 20)
returns table(skill_id uuid, skill_key text, name text, summary text, category text,
  trigger_phrases text[], quality_score double precision, success_rate double precision, score double precision)
language sql stable set search_path to '' as $$
  select s.skill_id,s.skill_key,s.name,s.summary,s.category,s.trigger_phrases,s.quality_score,s.success_rate,
    greatest(
      case when lower(s.skill_key)=lower(p_query) then 1.0 else 0.0 end,
      case when exists(select 1 from unnest(s.trigger_phrases) t where lower(t)=lower(p_query)) then 0.98 else 0.0 end,
      case when exists(select 1 from unnest(s.trigger_phrases) t where lower(t) like '%'||lower(p_query)||'%' or lower(p_query) like '%'||lower(t)||'%') then 0.88 else 0.0 end,
      extensions.similarity(s.search_text,p_query)*0.82
    ) + least(coalesce(s.quality_score,0),1)*0.08 + least(coalesce(s.success_rate,0),1)*0.10 as score
  from private.skills s
  where s.status='active'
    and (extensions.similarity(s.search_text,p_query)>0.08
      or lower(s.search_text) like '%'||lower(p_query)||'%'
      or exists(select 1 from unnest(s.trigger_phrases) t where lower(t)=lower(p_query)))
  order by score desc,s.skill_key
  limit greatest(1,least(coalesce(p_limit,20),100));
$$;

create or replace function private.get_skill_install_expectation(p_install_id text)
returns jsonb language sql security definer set search_path to '' as $$
 select jsonb_build_object('install_id',install_id,'bundle_id',bundle_id,'expected_skills',expected_skills,
   'expected_triggers',expected_triggers,'source_hash',source_hash,'payload_sha256',payload_sha256,'status',status)
 from private.skill_install_runs where install_id=p_install_id;
$$;

create or replace function private.validate_skill_install_counts(p_bundle jsonb)
returns jsonb language sql immutable set search_path to '' as $$
 select jsonb_build_object('skills',coalesce((p_bundle->'counts'->>'skills')::int,0),
   'triggers',coalesce((p_bundle->'counts'->>'triggers')::int,0),
   'entries',jsonb_array_length(coalesce(p_bundle->'entries','[]'::jsonb)));
$$;

create or replace function private.skill_install_invariant()
returns jsonb language sql security definer set search_path to '' as $$
 select jsonb_build_object('policy','all_skills_preinstalled','on_demand_install',false,
   'routing_uses_triggers_only_for_selection',true,'expected_skills',3000,'expected_triggers',15000);
$$;

create or replace function private.skill_preinstall_status()
returns jsonb language sql security definer set search_path to '' as $$
 select jsonb_build_object('skills',(select count(*) from private.skills),
   'assets',(select count(*) from private.skill_assets),'chunks',(select count(*) from private.skill_chunks),
   'policy',(select jsonb_build_object('install_mode',install_mode,'lazy_install_enabled',lazy_install_enabled)
     from private.skill_runtime_policy where singleton=true));
$$;

create or replace function private.install_mega_skills_bundle(p_install_id text,p_bundle jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_run private.skill_install_runs%rowtype; v_bundle_id text; v_source_hash text;
  v_schema_version int; v_skill_count int; v_trigger_count int; v_repaired int;
  v_asset_count int; v_chunk_count int; v_error text;
begin
  select * into v_run from private.skill_install_runs where install_id=p_install_id for update;
  if not found then raise exception 'unknown install_id: %',p_install_id; end if;
  v_schema_version:=coalesce((p_bundle->>'schema_version')::int,0);
  v_bundle_id:=p_bundle->>'bundle_id'; v_source_hash:=p_bundle->>'source_hash';
  v_skill_count:=coalesce((p_bundle->'counts'->>'skills')::int,0);
  v_trigger_count:=coalesce((p_bundle->'counts'->>'triggers')::int,0);
  if v_schema_version not in (2,3) then raise exception 'unsupported bundle schema_version: %',v_schema_version; end if;
  if v_bundle_id is distinct from v_run.bundle_id then raise exception 'bundle_id mismatch: expected %, got %',v_run.bundle_id,v_bundle_id; end if;
  if v_source_hash is distinct from v_run.source_hash then raise exception 'source_hash mismatch'; end if;
  if v_skill_count<>v_run.expected_skills then raise exception 'skill count mismatch: expected %, got %',v_run.expected_skills,v_skill_count; end if;
  if v_trigger_count<>v_run.expected_triggers then raise exception 'trigger count mismatch: expected %, got %',v_run.expected_triggers,v_trigger_count; end if;
  if jsonb_array_length(coalesce(p_bundle->'entries','[]'::jsonb))<>v_skill_count then raise exception 'entries length does not equal declared skill count'; end if;
  update private.skill_install_runs set status='installing',started_at=now(),finished_at=null,error=null,updated_at=now() where install_id=p_install_id;
  begin
    with entries as (select value e from jsonb_array_elements(p_bundle->'entries'))
    insert into private.skills(skill_key,name,summary,instructions,category,subcategories,keywords,trigger_phrases,
      tools_required,runtimes,dependencies,input_types,output_types,risk_level,quality_score,version,status,source_ref,checksum,metadata,search_text,updated_at)
    select e->>'skill_key',coalesce(nullif(e->>'name',''),e->>'skill_key'),coalesce(e->>'summary',''),coalesce(e->>'instructions',''),
      coalesce(nullif(e->>'category',''),'uncategorized'),array[]::text[],array(select jsonb_array_elements_text(coalesce(e->'keywords','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(e->'triggers','[]'::jsonb))),array[]::text[],array[]::text[],'[]'::jsonb,
      array['text']::text[],array['text']::text[],'low',case when coalesce(e->>'audit_status','healthy')='healthy' then 0.95 else 0.90 end,
      '1','active',e->>'original_path',e->>'installed_sha256',
      jsonb_build_object('bundle_id',v_bundle_id,'source_hash',v_source_hash,'audit_status',coalesce(e->>'audit_status','healthy'),
        'original_sha256',e->>'original_sha256','installed_sha256',e->>'installed_sha256','original_path',e->>'original_path',
        'installed_path',e->>'installed_path','installation_mode','preinstalled_full_asset','bundle_schema_version',v_schema_version),
      lower(concat_ws(' ',e->>'skill_key',coalesce(e->>'name',''),e->>'summary',e->>'category',
        array_to_string(array(select jsonb_array_elements_text(coalesce(e->'keywords','[]'::jsonb))),' '),
        array_to_string(array(select jsonb_array_elements_text(coalesce(e->'triggers','[]'::jsonb))),' '))),now()
    from entries where coalesce(e->>'skill_key','')<>''
    on conflict(skill_key) do update set name=excluded.name,summary=excluded.summary,instructions=excluded.instructions,
      category=excluded.category,subcategories=excluded.subcategories,keywords=excluded.keywords,trigger_phrases=excluded.trigger_phrases,
      tools_required=excluded.tools_required,runtimes=excluded.runtimes,dependencies=excluded.dependencies,input_types=excluded.input_types,
      output_types=excluded.output_types,risk_level=excluded.risk_level,quality_score=excluded.quality_score,version=excluded.version,
      status='active',source_ref=excluded.source_ref,checksum=excluded.checksum,metadata=excluded.metadata,search_text=excluded.search_text,updated_at=now();
    with entries as (select value e from jsonb_array_elements(p_bundle->'entries'))
    insert into private.skill_assets(asset_id,skill_id,asset_type,source_path,content,sha256,is_canonical)
    select nextval('private.skill_assets_asset_id_seq'::regclass),s.skill_id,'original_skill',e->>'original_path',
      coalesce(e->>'original_content',e->>'instructions'),e->>'original_sha256',true
    from entries join private.skills s on s.skill_key=e->>'skill_key'
    on conflict(skill_id,asset_type,source_path) do update set content=excluded.content,sha256=excluded.sha256,is_canonical=true;
    with entries as (select value e from jsonb_array_elements(p_bundle->'entries'))
    insert into private.skill_assets(asset_id,skill_id,asset_type,source_path,content,sha256,is_canonical)
    select nextval('private.skill_assets_asset_id_seq'::regclass),s.skill_id,'installed_skill',e->>'installed_path',e->>'instructions',e->>'installed_sha256',false
    from entries join private.skills s on s.skill_key=e->>'skill_key'
    on conflict(skill_id,asset_type,source_path) do update set content=excluded.content,sha256=excluded.sha256,is_canonical=false;
    with entries as (select value e from jsonb_array_elements(p_bundle->'entries'))
    insert into private.skill_chunks(chunk_id,skill_id,chunk_index,chunk_type,content,token_estimate,metadata)
    select nextval('private.skill_chunks_chunk_id_seq'::regclass),s.skill_id,0,'instructions',e->>'instructions',
      greatest(1,ceil(length(coalesce(e->>'instructions',''))::numeric/4.0)::int),
      jsonb_build_object('bundle_id',v_bundle_id,'source','installed_skill','full_asset',true)
    from entries join private.skills s on s.skill_key=e->>'skill_key'
    on conflict(skill_id,chunk_index) do update set chunk_type='instructions',content=excluded.content,token_estimate=excluded.token_estimate,metadata=excluded.metadata;
    select count(*) into v_skill_count from private.skills s where s.skill_key in(select e->>'skill_key' from jsonb_array_elements(p_bundle->'entries') e);
    select coalesce(sum(cardinality(s.trigger_phrases)),0)::int into v_trigger_count from private.skills s where s.skill_key in(select e->>'skill_key' from jsonb_array_elements(p_bundle->'entries') e);
    select count(*) into v_asset_count from private.skill_assets a join private.skills s on s.skill_id=a.skill_id
      where s.skill_key in(select e->>'skill_key' from jsonb_array_elements(p_bundle->'entries') e) and a.asset_type in('original_skill','installed_skill');
    select count(*) into v_chunk_count from private.skill_chunks c join private.skills s on s.skill_id=c.skill_id
      where s.skill_key in(select e->>'skill_key' from jsonb_array_elements(p_bundle->'entries') e) and c.chunk_index=0;
    select count(*) into v_repaired from jsonb_array_elements(p_bundle->'entries') e where coalesce(e->>'audit_status','healthy')<>'healthy';
    if v_skill_count<>v_run.expected_skills then raise exception 'post-install skill verification failed: %',v_skill_count; end if;
    if v_trigger_count<>v_run.expected_triggers then raise exception 'post-install trigger verification failed: %',v_trigger_count; end if;
    if v_asset_count<>v_run.expected_skills*2 then raise exception 'post-install asset verification failed: %',v_asset_count; end if;
    if v_chunk_count<>v_run.expected_skills then raise exception 'post-install chunk verification failed: %',v_chunk_count; end if;
  exception when others then
    get stacked diagnostics v_error=message_text;
    update private.skill_install_runs set status='failed',error=v_error,finished_at=now(),updated_at=now() where install_id=p_install_id;
    return jsonb_build_object('ok',false,'install_id',p_install_id,'error',v_error);
  end;
  update private.skill_install_runs set status='installed',installed_skills=v_skill_count,installed_assets=v_asset_count,
    installed_triggers=v_trigger_count,repaired_skills=v_repaired,error=null,finished_at=now(),updated_at=now() where install_id=p_install_id;
  return jsonb_build_object('ok',true,'install_id',p_install_id,'bundle_id',v_bundle_id,'skills',v_skill_count,
    'assets',v_asset_count,'chunks',v_chunk_count,'triggers',v_trigger_count,'repaired_skills',v_repaired,
    'mode','preinstalled_full_asset','schema_version',v_schema_version);
end;
$$;

-- Live bridge/invocation function signatures recovered by pg_get_functiondef.
-- Bodies use only Vault-held credentials; secret values are never included in this file.
-- private.call_free_llm_router(payload jsonb) returns jsonb
-- private.call_global_free_llm_mesh(payload jsonb) returns jsonb
-- private.call_github_llm_scanner(payload jsonb) returns jsonb
-- private.call_github_admin_gateway(payload jsonb) returns jsonb
-- private.call_skill_installer_health() returns jsonb
-- private.invoke_global_free_llm_mesh(p_body jsonb) returns bigint
-- private.invoke_github_llm_verifier(p_source text,p_limit integer) returns bigint
-- private.invoke_skill_installer_from_chunks(p_install_id text) returns jsonb

-- Current live index catalogue. Constraint-owned indexes are represented by their constraints above.
create index if not exists dynamic_llm_providers_enabled_idx on private.dynamic_llm_providers (enabled,zero_cost_verified,anonymous_verified);
create index if not exists github_llm_sources_class_score_idx on private.github_llm_sources (capability_class,score desc);
create index if not exists github_llm_sources_score_idx on private.github_llm_sources (score desc);
create index if not exists github_llm_sources_status_score_idx on private.github_llm_sources (status,score desc);
create index if not exists github_llm_sources_verification_status_idx on private.github_llm_sources (verification_status,verification_score desc);
create index if not exists skill_chunks_skill_idx on private.skill_chunks (skill_id,chunk_index);
create unique index if not exists skill_chunks_skill_id_chunk_index_uidx on private.skill_chunks (skill_id,chunk_index);
create index if not exists skill_executions_skill_started_idx on private.skill_executions (skill_id,started_at desc);
create index if not exists skills_category_idx on private.skills (category);
create index if not exists skills_keywords_gin_idx on private.skills using gin (keywords);
create index if not exists skills_status_category_idx on private.skills (status,category);
create index if not exists skills_status_idx on private.skills (status);
create index if not exists skills_subcategories_gin_idx on private.skills using gin (subcategories);
create index if not exists skills_triggers_gin_idx on private.skills using gin (trigger_phrases);
create index if not exists task_executions_started_idx on private.task_executions (started_at desc);

-- Search-text trigram index exists live as:
-- CREATE INDEX skills_search_text_trgm_idx ON private.skills USING gin (search_text gin_trgm_ops)

-- Scheduler metadata only; command bodies are intentionally excluded.
-- jobid=1 jobname=github-llm-source-scan-6h schedule='17 */6 * * *' active=true
-- jobid=2 jobname=github-llm-verifier-6h schedule='37 */6 * * *' active=true
