-- AOS GitHub OAuth. Run after supabase_chat_migration.sql.
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS github_user_id BIGINT;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS github_username TEXT;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS github_avatar TEXT;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.github_connections ALTER COLUMN project_id DROP NOT NULL;
UPDATE public.github_connections gc SET user_id = p.user_id FROM public.projects p WHERE p.id = gc.project_id AND gc.user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS github_connections_user_unique ON public.github_connections(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS github_connections_github_user_idx ON public.github_connections(github_user_id);

CREATE TABLE IF NOT EXISTS public.github_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, repository_id BIGINT NOT NULL,
  repository_name TEXT NOT NULL, repository_url TEXT NOT NULL, default_branch TEXT NOT NULL DEFAULT 'main',
  clone_url TEXT, ssh_url TEXT, latest_commit_sha TEXT, latest_commit_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS github_repositories_user_project_idx ON public.github_repositories(user_id, project_id);
ALTER TABLE public.github_repositories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own project resources" ON public.github_connections;
DROP POLICY IF EXISTS "own github connections" ON public.github_connections;
CREATE POLICY "own github connections" ON public.github_connections FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own github repositories" ON public.github_repositories FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.aos_github_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS github_repositories_updated_at ON public.github_repositories;
CREATE TRIGGER github_repositories_updated_at BEFORE UPDATE ON public.github_repositories FOR EACH ROW EXECUTE FUNCTION public.aos_github_updated_at();
