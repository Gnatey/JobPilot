-- JobPilot — schéma Supabase
-- À coller dans Supabase > SQL Editor > New query > Run.
-- Chaque table est protégée par Row Level Security : chaque utilisateur ne voit que ses données.


-- Profil "maître" (toute l'expérience, source de vérité pour générer les CV)
create table if not exists profiles (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Offres analysées
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  url text,
  source text,                -- linkedin, indeed, france_travail, wttj, autre
  external_id text,           -- id France Travail, etc.
  title text,
  company text,
  location text,
  contract text,
  raw_text text,
  extracted jsonb,            -- infos structurées extraites par Claude
  analysis jsonb,             -- score détaillé + recommandations
  score int,
  decision text,              -- accepted, rejected
  reject_reason text,
  created_at timestamptz not null default now()
);
create index if not exists offers_user_idx on offers(user_id, created_at desc);

-- Candidatures (le "Notion")
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  offer_id uuid references offers on delete set null,
  company text not null,
  title text not null,
  url text,
  location text,
  contract text,
  status text not null default 'a_postuler',
  channel text,               -- France Travail, LinkedIn, Indeed, WTTJ, Spontanée, Cooptation, Malt...
  cv_variant text,            -- data_bi, ba_amoa, autre
  score int,
  applied_at date,
  next_action_at date,
  contact text,
  salary text,
  notes text,
  last_email_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists applications_user_idx on applications(user_id, updated_at desc);

-- Historique des statuts (pour mesurer délais et taux de conversion)
create table if not exists status_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  application_id uuid not null references applications on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now()
);

create or replace function log_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into status_history(user_id, application_id, from_status, to_status)
    values (new.user_id, new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into status_history(user_id, application_id, from_status, to_status)
    values (new.user_id, new.id, old.status, new.status);
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists applications_status_ins on applications;
create trigger applications_status_ins after insert on applications
  for each row execute function log_status_change();

create or replace function touch_application() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into status_history(user_id, application_id, from_status, to_status)
    values (new.user_id, new.id, old.status, new.status);
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists applications_status_upd on applications;
create trigger applications_status_upd before update on applications
  for each row execute function touch_application();

-- Documents générés (CV, lettres, préparation d'entretien)
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  offer_id uuid references offers on delete cascade,
  application_id uuid references applications on delete set null,
  kind text not null,         -- cv, lettre, prep, relance
  variant text,               -- cible : data_bi, ba_amoa...
  template text,              -- classique, moderne, esn, compact
  reused_from uuid,           -- CV réutilisé depuis un autre document
  content jsonb not null,
  created_at timestamptz not null default now()
);

-- Connexion Gmail (lecture seule)
create table if not exists gmail_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  email text,
  refresh_token text not null,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

-- Emails liés à la recherche d'emploi
create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  gmail_id text not null,
  thread_id text,
  from_addr text,
  subject text,
  snippet text,
  received_at timestamptz,
  category text,              -- accuse_reception, refus, entretien, test, offre, relance_recruteur, autre
  application_id uuid references applications on delete set null,
  created_at timestamptz not null default now(),
  unique(user_id, gmail_id)
);

-- Offres recommandées (alertes emploi lues dans Gmail + recherches automatiques)
create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source text,                -- LinkedIn, Indeed, APEC, France Travail...
  origin text,                -- email, search
  dedupe_key text not null,
  title text,
  company text,
  location text,
  url text,
  snippet text,
  quick_score int,
  matched text[],
  status text not null default 'new',  -- new, analyzed, accepted, rejected
  reject_reason text,          -- trop_senior, lieu, salaire, metier, secteur, contrat, entreprise, autre
  decided_at timestamptz,
  senior boolean not null default false, -- demande plus d'expérience que le profil
  offer_id uuid references offers on delete set null,
  email_id text,
  received_at timestamptz default now(),
  created_at timestamptz not null default now(),
  unique(user_id, dedupe_key)
);

-- Analyses d'auto-amélioration
create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  content jsonb not null,
  created_at timestamptz not null default now()
);

-- Recherches sauvegardées (l'"enquête")
create table if not exists searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text,
  criteria jsonb not null,
  auto boolean not null default true,   -- relancée chaque matin
  created_at timestamptz not null default now()
);

-- Row Level Security
do $$
declare t text;
begin
  foreach t in array array['profiles','offers','applications','status_history','documents','gmail_accounts','emails','insights','searches','recommendations']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Diagnostics de CV (questionnaire d'accueil + analyses de CV redéposés)
create table if not exists diagnostics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  kind text not null,          -- onboarding, refresh
  answers jsonb,               -- réponses au questionnaire
  files text[],                -- noms des fichiers déposés
  content jsonb not null,      -- diagnostic
  proposed_profile jsonb,      -- profil proposé (à appliquer ou non)
  applied boolean not null default false,
  created_at timestamptz not null default now()
);
alter table diagnostics enable row level security;
drop policy if exists "own rows" on diagnostics;
create policy "own rows" on diagnostics for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Mise à jour 3 : agenda, entretiens et index de vitesse (identique à migration-3-upgrade.sql)
-- Heure des entretiens (alimente l'agenda et l'affichage du suivi)
alter table applications add column if not exists interview_at timestamptz;

-- Diagnostics de CV (si tu n'avais pas encore lancé migration-2)
create table if not exists diagnostics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  kind text not null,
  answers jsonb,
  files text[],
  content jsonb not null,
  proposed_profile jsonb,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);
alter table diagnostics enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'diagnostics' and policyname = 'own rows') then
    create policy "own rows" on diagnostics for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- Index : les pages s'ouvrent plus vite quand la liste grandit
create index if not exists recommendations_todo_idx on recommendations(user_id, status, quick_score desc);
create index if not exists applications_offer_idx on applications(offer_id);
create index if not exists applications_followup_idx on applications(user_id, status, next_action_at);
create index if not exists documents_offer_idx on documents(offer_id, kind, created_at desc);
create index if not exists history_app_idx on status_history(application_id, changed_at desc);
create index if not exists emails_recent_idx on emails(user_id, received_at desc);
create index if not exists offers_url_idx on offers(user_id, url);

-- Mise à jour 4 : site ouvert à plusieurs personnes (identique à upgrade.sql)
-- Quota IA du jour, par personne : protège la clé gratuite partagée.
-- La personne peut lire son compteur mais pas le modifier : seule la fonction spend_ai() l'augmente.
create table if not exists ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  n int not null default 0,
  primary key (user_id, day)
);
alter table ai_usage enable row level security;
drop policy if exists "read own" on ai_usage;
create policy "read own" on ai_usage for select using (user_id = auth.uid());

create or replace function spend_ai(cost int, cap int) returns int
language plpgsql security definer set search_path = public as $$
declare used int;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  if cost < 1 or cost > 20 then raise exception 'coût invalide'; end if;
  insert into ai_usage(user_id, day, n) values (auth.uid(), current_date, 0) on conflict do nothing;
  update ai_usage set n = n + cost
    where user_id = auth.uid() and day = current_date and n + cost <= cap
    returning n into used;
  return coalesce(used, -1); -- -1 = quota du jour atteint
end $$;
revoke all on function spend_ai(int, int) from public;
grant execute on function spend_ai(int, int) to authenticated;

-- Tâche du matin : qui a été traité en dernier (équité quand il y a plusieurs personnes)
alter table profiles add column if not exists cron_at timestamptz;

-- ===== Limitation des requêtes par personne (mise à jour 5) =====
-- Fenêtre fixe par personne et par « seau » : au-delà de p_max demandes dans p_window secondes, la fonction répond false.
-- La personne ne peut ni lire ni modifier le compteur : la table n'a aucune politique, seule la fonction (security definer) y écrit.
-- Tant que ce bloc n'est pas lancé, l'appli fonctionne comme avant (aucune limite).
create table if not exists rate_hits (
  user_id uuid not null references auth.users on delete cascade,
  bucket text not null,
  window_start timestamptz not null default now(),
  n int not null default 0,
  primary key (user_id, bucket)
);
alter table rate_hits enable row level security;

create or replace function rate_limit(p_bucket text, p_max int, p_window int) returns boolean
language plpgsql security definer set search_path = public as $$
declare used int;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  if p_max < 1 or p_window < 1 or p_window > 86400 or length(p_bucket) > 40 then raise exception 'paramètres invalides'; end if;
  insert into rate_hits(user_id, bucket, window_start, n) values (auth.uid(), p_bucket, now(), 1)
  on conflict (user_id, bucket) do update set
    n = case when rate_hits.window_start < now() - make_interval(secs => p_window) then 1 else rate_hits.n + 1 end,
    window_start = case when rate_hits.window_start < now() - make_interval(secs => p_window) then now() else rate_hits.window_start end
  returning n into used;
  return used <= p_max;
end $$;
revoke all on function rate_limit(text, int, int) from public;
grant execute on function rate_limit(text, int, int) to authenticated;

-- ===== Texte d'annonce gardé sur une ligne « À analyser » (mise à jour 6) =====
-- « Garder pour plus tard » : le texte collé reste attaché à SA ligne d'Offres & CV. Il revient quand on rouvre la ligne, et « Tout analyser » le lit
-- sans relire le site. Table à part pour ne pas alourdir les listes de candidatures ; supprimée avec la ligne. Tant que ce bloc n'est pas lancé,
-- « Garder » répond qu'il faut mettre la base à jour, et le reste de l'appli fonctionne comme avant.
create table if not exists application_texts (
  application_id uuid primary key references applications on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  body text not null,
  updated_at timestamptz not null default now()
);
alter table application_texts enable row level security;
drop policy if exists "own rows" on application_texts;
create policy "own rows" on application_texts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
