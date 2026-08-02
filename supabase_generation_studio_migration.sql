-- AOS Generation Studio: run this after supabase_chat_migration.sql.
-- All rows and storage objects are isolated by the owning project's user_id.

CREATE OR REPLACE FUNCTION public.aos_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

CREATE TABLE IF NOT EXISTS public.generation_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  generation_type TEXT NOT NULL CHECK (generation_type IN ('pdf','word','powerpoint','excel','image','video','audio','code','markdown','html','json','zip','other')),
  prompt TEXT NOT NULL DEFAULT '',
  file_url TEXT,
  storage_path TEXT,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('queued','generating','ready','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT generation_files_location CHECK (file_url IS NOT NULL OR storage_path IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.project_activity (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generation_files_project_updated ON public.generation_files(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_files_owner_type ON public.generation_files(user_id, generation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_activity_project_created ON public.project_activity(project_id, created_at DESC);

DROP TRIGGER IF EXISTS generation_files_set_updated_at ON public.generation_files;
CREATE TRIGGER generation_files_set_updated_at BEFORE UPDATE ON public.generation_files
FOR EACH ROW EXECUTE FUNCTION public.aos_set_updated_at();

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.aos_set_updated_at();

CREATE OR REPLACE FUNCTION public.aos_log_generation_file()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.project_activity(project_id, user_id, event_type, entity_type, entity_id, summary)
  VALUES (NEW.project_id, NEW.user_id, 'generated', 'generation_file', NEW.id, 'Generated ' || NEW.title);
  UPDATE public.projects SET updated_at = NOW() WHERE id = NEW.project_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS generation_files_activity ON public.generation_files;
CREATE TRIGGER generation_files_activity AFTER INSERT ON public.generation_files
FOR EACH ROW EXECUTE FUNCTION public.aos_log_generation_file();

-- Bring existing AOS image records into the unified Generation Studio history.
-- This is safe to run again: an equivalent image URL in the same project is not duplicated.
INSERT INTO public.generation_files (project_id, user_id, title, generation_type, prompt, file_url, status, created_at, updated_at)
SELECT gi.project_id, p.user_id, COALESCE(NULLIF(left(gi.prompt, 90), ''), 'Generated image'), 'image', gi.prompt,
       gi.storage_path, 'ready', gi.created_at, gi.created_at
FROM public.generated_images gi
JOIN public.projects p ON p.id = gi.project_id
WHERE gi.storage_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.generation_files gf
    WHERE gf.project_id = gi.project_id
      AND gf.generation_type = 'image'
      AND gf.file_url = gi.storage_path
  );

ALTER TABLE public.generation_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own generation files" ON public.generation_files;
CREATE POLICY "own generation files" ON public.generation_files FOR ALL
USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "own project activity" ON public.project_activity;
CREATE POLICY "own project activity" ON public.project_activity FOR ALL
USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

INSERT INTO storage.buckets (id, name, public)
VALUES ('generation-files', 'generation-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "generation files read own" ON storage.objects;
CREATE POLICY "generation files read own" ON storage.objects FOR SELECT
USING (bucket_id = 'generation-files' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "generation files upload own" ON storage.objects;
CREATE POLICY "generation files upload own" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'generation-files' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "generation files update own" ON storage.objects;
CREATE POLICY "generation files update own" ON storage.objects FOR UPDATE
USING (bucket_id = 'generation-files' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'generation-files' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "generation files delete own" ON storage.objects;
CREATE POLICY "generation files delete own" ON storage.objects FOR DELETE
USING (bucket_id = 'generation-files' AND (storage.foldername(name))[1] = auth.uid()::text);
