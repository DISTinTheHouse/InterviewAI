-- InterviewAI Agency Console v2
-- Namespaced migration: it does not modify existing application tables.

create extension if not exists pgcrypto;

create table if not exists public.interviewai_agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interviewai_memberships (
  agency_id uuid not null references public.interviewai_agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'recruiter' check (role in ('owner','admin','recruiter','viewer')),
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

create table if not exists public.interviewai_jobs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.interviewai_agencies(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  department text not null default 'General',
  location text not null default 'México',
  work_mode text not null default 'Híbrido' check (work_mode in ('Remoto','Híbrido','Presencial')),
  summary text not null default '',
  status text not null default 'active' check (status in ('draft','active','paused','closed')),
  rubric jsonb not null default '{}'::jsonb,
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interviewai_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.interviewai_agencies(id) on delete cascade,
  job_id uuid not null references public.interviewai_jobs(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  label text not null default 'Enlace general',
  candidate_email text,
  expires_at timestamptz not null default (now() + interval '30 days'),
  max_uses integer not null default 100 check (max_uses between 1 and 10000),
  use_count integer not null default 0 check (use_count >= 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.interviewai_candidates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.interviewai_agencies(id) on delete cascade,
  job_id uuid not null references public.interviewai_jobs(id) on delete cascade,
  invite_id uuid references public.interviewai_invites(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null default '',
  location text not null default '',
  linkedin_url text not null default '',
  experience_years numeric(5,1) not null default 0,
  professional_summary text not null default '',
  skills text[] not null default '{}',
  cv_path text,
  cv_text_excerpt text not null default '',
  consent_at timestamptz not null,
  status text not null default 'evaluated' check (status in ('received','evaluating','evaluated','shortlist','interview','offer','rejected','hired')),
  ai_score numeric(5,2) not null default 0 check (ai_score between 0 and 100),
  ai_recommendation text not null default 'review',
  ai_summary text not null default '',
  recruiter_decision text not null default 'pending' check (recruiter_decision in ('pending','advance','hold','reject')),
  recruiter_notes text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interviewai_answers (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.interviewai_candidates(id) on delete cascade,
  question_order smallint not null check (question_order between 1 and 20),
  competency text not null,
  question text not null,
  answer text not null,
  score numeric(5,2) not null check (score between 0 and 100),
  evidence text not null default '',
  gaps text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(candidate_id, question_order)
);

create table if not exists public.interviewai_audit_logs (
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.interviewai_agencies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists interviewai_jobs_agency_status_idx on public.interviewai_jobs(agency_id, status);
create index if not exists interviewai_invites_token_idx on public.interviewai_invites(token) where active;
create index if not exists interviewai_candidates_job_score_idx on public.interviewai_candidates(job_id, ai_score desc);
create index if not exists interviewai_candidates_agency_status_idx on public.interviewai_candidates(agency_id, status);
create index if not exists interviewai_answers_candidate_idx on public.interviewai_answers(candidate_id, question_order);
create index if not exists interviewai_audit_agency_time_idx on public.interviewai_audit_logs(agency_id, created_at desc);

create or replace function public.interviewai_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists interviewai_agencies_touch on public.interviewai_agencies;
create trigger interviewai_agencies_touch before update on public.interviewai_agencies
for each row execute function public.interviewai_touch_updated_at();
drop trigger if exists interviewai_jobs_touch on public.interviewai_jobs;
create trigger interviewai_jobs_touch before update on public.interviewai_jobs
for each row execute function public.interviewai_touch_updated_at();
drop trigger if exists interviewai_candidates_touch on public.interviewai_candidates;
create trigger interviewai_candidates_touch before update on public.interviewai_candidates
for each row execute function public.interviewai_touch_updated_at();

create or replace function public.interviewai_is_member(p_agency_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.interviewai_memberships
    where agency_id = p_agency_id and user_id = auth.uid()
  );
$$;

revoke all on function public.interviewai_is_member(uuid) from public;
grant execute on function public.interviewai_is_member(uuid) to authenticated;

create or replace function public.interviewai_bootstrap_agency(p_name text default 'Mi agencia')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_agency uuid;
  v_slug text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select agency_id into v_agency from public.interviewai_memberships where user_id = v_user order by created_at limit 1;
  if v_agency is not null then return v_agency; end if;

  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_name),''),'mi-agencia'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(v_user::text,1,8);
  insert into public.interviewai_agencies(name, slug, created_by)
  values (left(coalesce(nullif(trim(p_name),''),'Mi agencia'),120), v_slug, v_user)
  returning id into v_agency;
  insert into public.interviewai_memberships(agency_id,user_id,role) values(v_agency,v_user,'owner');

  insert into public.interviewai_jobs(agency_id,title,department,location,work_mode,summary,status,rubric,questions,created_by) values
  (v_agency,'Desarrollador Full Stack','Tecnología','Guadalajara','Híbrido','Construcción y mantenimiento de productos web con JavaScript, APIs, bases de datos y prácticas de entrega continua.','active',
   '{"technical":35,"problemSolving":25,"communication":20,"ownership":20}'::jsonb,
   '[{"competency":"Experiencia técnica","weight":25,"question":"Cuéntanos sobre el producto web más completo que hayas construido. ¿Qué parte desarrollaste y qué resultado tuvo?","signals":["javascript","api","base de datos","frontend","backend"]},{"competency":"Resolución de problemas","weight":20,"question":"Describe un error complejo de producción: ¿cómo encontraste la causa y cómo verificaste la solución?","signals":["logs","pruebas","causa","monitoreo"]},{"competency":"Arquitectura","weight":20,"question":"¿Cómo diseñarías una función que recibe datos, los valida, los guarda y notifica al usuario?","signals":["validación","api","seguridad","datos"]},{"competency":"Colaboración","weight":15,"question":"Háblanos de una decisión técnica que tuviste que explicar o negociar con otra persona.","signals":["equipo","decisión","acuerdo","comunicación"]},{"competency":"Impacto y ownership","weight":20,"question":"¿Qué mejorarías durante tus primeros 90 días y cómo medirías el impacto?","signals":["métrica","prioridad","impacto","resultado"]}]'::jsonb,v_user),
  (v_agency,'Auxiliar Contable','Contabilidad','Monterrey','Presencial','Soporte en registros, conciliaciones, control documental y elaboración de reportes contables.','active',
   '{"technical":30,"accuracy":30,"communication":15,"ownership":25}'::jsonb,
   '[{"competency":"Experiencia contable","weight":25,"question":"Describe tu experiencia con registros contables, conciliaciones y cierres. ¿Qué herramientas utilizaste?","signals":["conciliación","póliza","excel","erp"]},{"competency":"Precisión","weight":20,"question":"Cuéntanos de un error en un registro o reporte. ¿Cómo lo detectaste y evitaste que se repitiera?","signals":["revisión","control","diferencia","validación"]},{"competency":"Análisis","weight":20,"question":"¿Cómo investigarías una diferencia entre el banco y los registros internos?","signals":["movimientos","soporte","conciliar","saldo"]},{"competency":"Organización","weight":15,"question":"¿Cómo priorizas documentos y solicitudes cuando se acerca un cierre?","signals":["prioridad","fecha","control","seguimiento"]},{"competency":"Colaboración","weight":20,"question":"Describe cómo coordinaste información financiera con otra área o proveedor.","signals":["área","proveedor","evidencia","acuerdo"]}]'::jsonb,v_user),
  (v_agency,'Coordinador Administrativo','Administración','CDMX','Híbrido','Coordinación de operaciones, proveedores, documentación, seguimiento y mejora de procesos administrativos.','active',
   '{"planning":30,"problemSolving":25,"communication":25,"ownership":20}'::jsonb,
   '[{"competency":"Coordinación","weight":25,"question":"Cuéntanos sobre una operación o proyecto administrativo que hayas coordinado de principio a fin.","signals":["plan","seguimiento","entrega","equipo"]},{"competency":"Priorización","weight":20,"question":"Tienes varias solicitudes urgentes e información incompleta. ¿Cómo defines prioridades?","signals":["impacto","urgencia","fecha","responsable"]},{"competency":"Mejora de procesos","weight":20,"question":"Describe un proceso que hayas simplificado. ¿Qué cambió y cómo lo mediste?","signals":["tiempo","automatización","indicador","resultado"]},{"competency":"Comunicación","weight":15,"question":"¿Cómo mantienes informadas a distintas áreas cuando existe un retraso?","signals":["estatus","riesgo","acuerdo","comunicación"]},{"competency":"Resolución de problemas","weight":20,"question":"Háblanos de un problema con un proveedor o recurso crítico y cómo lo resolviste.","signals":["proveedor","alternativa","negociación","solución"]}]'::jsonb,v_user);

  insert into public.interviewai_audit_logs(agency_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(v_agency,v_user,'agency.created','agency',v_agency,jsonb_build_object('source','bootstrap'));
  return v_agency;
end;
$$;

revoke all on function public.interviewai_bootstrap_agency(text) from public;
grant execute on function public.interviewai_bootstrap_agency(text) to authenticated;

create or replace function public.interviewai_log_candidate_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.recruiter_decision is distinct from new.recruiter_decision then
    insert into public.interviewai_audit_logs(agency_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(new.agency_id,auth.uid(),'candidate.decision_changed','candidate',new.id,
      jsonb_build_object('from',old.recruiter_decision,'to',new.recruiter_decision));
  end if;
  return new;
end;
$$;

drop trigger if exists interviewai_candidate_decision_audit on public.interviewai_candidates;
create trigger interviewai_candidate_decision_audit after update on public.interviewai_candidates
for each row execute function public.interviewai_log_candidate_decision();

alter table public.interviewai_agencies enable row level security;
alter table public.interviewai_memberships enable row level security;
alter table public.interviewai_jobs enable row level security;
alter table public.interviewai_invites enable row level security;
alter table public.interviewai_candidates enable row level security;
alter table public.interviewai_answers enable row level security;
alter table public.interviewai_audit_logs enable row level security;

drop policy if exists interviewai_agencies_member_all on public.interviewai_agencies;
create policy interviewai_agencies_member_all on public.interviewai_agencies for all to authenticated
using (public.interviewai_is_member(id)) with check (public.interviewai_is_member(id));
drop policy if exists interviewai_memberships_member_read on public.interviewai_memberships;
create policy interviewai_memberships_member_read on public.interviewai_memberships for select to authenticated
using (public.interviewai_is_member(agency_id));
drop policy if exists interviewai_jobs_member_all on public.interviewai_jobs;
create policy interviewai_jobs_member_all on public.interviewai_jobs for all to authenticated
using (public.interviewai_is_member(agency_id)) with check (public.interviewai_is_member(agency_id));
drop policy if exists interviewai_invites_member_all on public.interviewai_invites;
create policy interviewai_invites_member_all on public.interviewai_invites for all to authenticated
using (public.interviewai_is_member(agency_id)) with check (public.interviewai_is_member(agency_id));
drop policy if exists interviewai_candidates_member_all on public.interviewai_candidates;
create policy interviewai_candidates_member_all on public.interviewai_candidates for all to authenticated
using (public.interviewai_is_member(agency_id)) with check (public.interviewai_is_member(agency_id));
drop policy if exists interviewai_answers_member_read on public.interviewai_answers;
create policy interviewai_answers_member_read on public.interviewai_answers for select to authenticated
using (exists(select 1 from public.interviewai_candidates c where c.id=candidate_id and public.interviewai_is_member(c.agency_id)));
drop policy if exists interviewai_audit_member_read on public.interviewai_audit_logs;
create policy interviewai_audit_member_read on public.interviewai_audit_logs for select to authenticated
using (public.interviewai_is_member(agency_id));
drop policy if exists interviewai_audit_member_insert on public.interviewai_audit_logs;
create policy interviewai_audit_member_insert on public.interviewai_audit_logs for insert to authenticated
with check (public.interviewai_is_member(agency_id) and actor_user_id = auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('interviewai-cvs','interviewai-cvs',false,5242880,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists interviewai_cv_member_read on storage.objects;
create policy interviewai_cv_member_read on storage.objects for select to authenticated
using (
  bucket_id='interviewai-cvs'
  and split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  and public.interviewai_is_member(split_part(name,'/',1)::uuid)
);

grant select,insert,update,delete on public.interviewai_agencies, public.interviewai_memberships,
  public.interviewai_jobs, public.interviewai_invites, public.interviewai_candidates to authenticated;
grant select on public.interviewai_answers, public.interviewai_audit_logs to authenticated;
grant insert on public.interviewai_audit_logs to authenticated;
