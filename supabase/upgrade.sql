-- JobPilot : mises à jour 3, 4 et 5 (agenda, vitesse, site ouvert à plusieurs personnes, limites de requêtes)
-- Sans risque : tu peux la lancer plusieurs fois, elle ne supprime rien.

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

-- ===== Site ouvert à plusieurs personnes =====
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
