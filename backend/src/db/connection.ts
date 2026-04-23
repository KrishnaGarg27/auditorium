import { getSupabase } from './supabaseClient.js';
import { initCloudinary } from './cloudinaryClient.js';

/**
 * Initialize all external services (Supabase + Cloudinary).
 * Creates tables if they don't exist via Supabase SQL.
 */
export async function initDb(): Promise<void> {
  // Validate Supabase connection
  const supabase = getSupabase();
  const { error } = await supabase.from('dramas').select('id').limit(1);

  if (error && error.code === '42P01') {
    // Table doesn't exist — create schema
    console.log('[DB] Creating Supabase tables...');
    await createSchema();
  } else if (error) {
    console.warn('[DB] Supabase connection check:', error.message);
  }

  // Initialize Cloudinary
  try {
    initCloudinary();
    console.log('[DB] Cloudinary configured');
  } catch (err) {
    console.warn('[DB] Cloudinary not configured:', (err as Error).message);
  }
}

async function createSchema(): Promise<void> {
  const supabase = getSupabase();

  // Use rpc to run raw SQL for table creation
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
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
    `,
  });

  if (error) {
    // If rpc doesn't exist, tables need to be created manually via Supabase dashboard
    console.warn('[DB] Could not auto-create tables. Please create them manually in Supabase SQL editor.');
    console.warn('[DB] Error:', error.message);
  }
}

// Re-export for backward compatibility
export { getSupabase as getDb } from './supabaseClient.js';
