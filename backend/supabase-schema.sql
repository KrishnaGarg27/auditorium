-- Auditorium — Supabase Database Schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

CREATE TABLE IF NOT EXISTS dramas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Drama',
  synopsis TEXT,
  style TEXT NOT NULL DEFAULT 'cinematic',
  creative_mode BOOLEAN NOT NULL DEFAULT false,
  thumbnail_url TEXT,
  source TEXT NOT NULL DEFAULT 'upload',
  status TEXT NOT NULL DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  synopsis TEXT,
  recap_narration TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  audio_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_episodes_drama ON episodes(drama_id);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE dramas ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;

-- Allow all operations for service role (backend uses service role key)
CREATE POLICY "Service role full access on dramas" ON dramas
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on episodes" ON episodes
  FOR ALL USING (true) WITH CHECK (true);
