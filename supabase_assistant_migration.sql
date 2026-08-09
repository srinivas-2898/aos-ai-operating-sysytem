-- AOS AI Assistant Database Migration
-- Run this in the Supabase SQL Editor. 
-- This script sets up the persistence layer for Assistant Preferences and Conversations.

-- 1. Create Assistant Preferences Table
CREATE TABLE IF NOT EXISTS public.assistant_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  voice_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  speech_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  welcome_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_language TEXT NOT NULL DEFAULT 'en-US',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assistant_preferences_user_unique UNIQUE (user_id)
);

-- 2. Create Assistant Conversations Table
CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  chat_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  user_message TEXT NOT NULL,
  assistant_response TEXT,
  intent TEXT,
  action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.assistant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for assistant_preferences
DROP POLICY IF EXISTS "Users can manage their own assistant preferences" ON public.assistant_preferences;
CREATE POLICY "Users can manage their own assistant preferences" ON public.assistant_preferences
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5. RLS Policies for assistant_conversations
DROP POLICY IF EXISTS "Users can manage their own assistant conversations" ON public.assistant_conversations;
CREATE POLICY "Users can manage their own assistant conversations" ON public.assistant_conversations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_assistant_preferences_user ON public.assistant_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user ON public.assistant_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_project ON public.assistant_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_created ON public.assistant_conversations(created_at DESC);

-- 7. Trigger for updated_at (Reusing public.aos_set_updated_at)
DROP TRIGGER IF EXISTS assistant_preferences_set_updated_at ON public.assistant_preferences;
CREATE TRIGGER assistant_preferences_set_updated_at 
  BEFORE UPDATE ON public.assistant_preferences
  FOR EACH ROW 
  EXECUTE FUNCTION public.aos_set_updated_at();
