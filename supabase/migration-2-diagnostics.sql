-- À exécuter UNE fois si tu as déjà lancé schema.sql avant cette mise à jour.
-- Supabase > SQL Editor > New query > coller > Run (l'avertissement "destructive" est normal).
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
drop policy if exists "own rows" on diagnostics;
create policy "own rows" on diagnostics for all using (user_id = auth.uid()) with check (user_id = auth.uid());
