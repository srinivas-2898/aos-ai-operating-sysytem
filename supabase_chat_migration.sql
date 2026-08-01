-- AOS project-centric Supabase schema
-- Run in Supabase SQL Editor. It creates project-isolated resources and RLS.

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO profiles (id, full_name)
SELECT id, COALESCE(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')
FROM auth.users
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.aos_create_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS aos_auth_user_profile ON auth.users;
CREATE TRIGGER aos_auth_user_profile AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.aos_create_profile();

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  description TEXT NOT NULL CHECK (char_length(trim(description)) > 0),
  programming_language TEXT,
  framework TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_user_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'ai')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chats created before projects are assigned to one imported project per user.
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS project_id UUID;
INSERT INTO projects (user_id, name, description)
SELECT DISTINCT cs.user_id, 'Imported conversations', 'Chats created before project workspaces were enabled.'
FROM chat_sessions cs
WHERE cs.project_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.user_id = cs.user_id AND p.name = 'Imported conversations');
UPDATE chat_sessions cs SET project_id = p.id
FROM projects p
WHERE cs.project_id IS NULL AND p.user_id = cs.user_id AND p.name = 'Imported conversations';
ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_project_id_fkey;
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE chat_sessions ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE chat_sessions ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE messages ADD COLUMN IF NOT EXISTS project_id UUID;
UPDATE messages m SET project_id = cs.project_id FROM chat_sessions cs WHERE m.session_id = cs.id AND m.project_id IS NULL;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_project_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE messages ALTER COLUMN project_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', language TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, path)
);
CREATE TABLE IF NOT EXISTS github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  repository_url TEXT, repository_name TEXT, status TEXT NOT NULL DEFAULT 'disconnected', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT, status TEXT NOT NULL DEFAULT 'pending', deployment_url TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL, storage_path TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, document_type TEXT, content TEXT, storage_path TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ai_agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL, event_type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.aos_sync_message_project()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT project_id INTO NEW.project_id FROM chat_sessions WHERE id = NEW.session_id;
  IF NEW.project_id IS NULL THEN RAISE EXCEPTION 'Chat session does not belong to a project'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS aos_messages_project_guard ON messages;
CREATE TRIGGER aos_messages_project_guard BEFORE INSERT OR UPDATE OF session_id ON messages
FOR EACH ROW EXECUTE FUNCTION public.aos_sync_message_project();

CREATE INDEX IF NOT EXISTS idx_projects_user_opened ON projects(user_id, last_opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_project_session ON messages(project_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own profile" ON profiles;
CREATE POLICY "own profile" ON profiles FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "own projects" ON projects;
CREATE POLICY "own projects" ON projects FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own chat sessions" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_select" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_insert" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_update" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_delete" ON chat_sessions;
CREATE POLICY "own chat sessions" ON chat_sessions FOR ALL USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
DROP POLICY IF EXISTS "own messages" ON messages;
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "own messages" ON messages FOR ALL USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_files','github_connections','deployments','generated_images','generated_documents','ai_agent_logs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "own project resources" ON %I', t);
    EXECUTE format('CREATE POLICY "own project resources" ON %I FOR ALL USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()))', t);
  END LOOP;
END $$;
