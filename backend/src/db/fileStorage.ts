import * as fs from 'node:fs';
import * as path from 'node:path';
import { uploadToCloudinary, deleteCloudinaryFolder } from './cloudinaryClient.js';

/**
 * Cloud file storage for Auditorium using Cloudinary.
 *
 * Structure in Cloudinary:
 *   auditorium/
 *     audio/{dramaId}/speech/    — TTS dialogue + narration
 *     audio/{dramaId}/sfx/       — Sound effects
 *     audio/{dramaId}/music/     — Music tracks
 *     audio/{dramaId}/episodes/  — Final episode audio
 *     thumbnails/{dramaId}       — Drama cover thumbnails
 *
 * Local temp directory is still used during pipeline processing.
 * Files are uploaded to Cloudinary after generation and the URL is stored.
 */

const LOCAL_TEMP_DIR = path.join(process.cwd(), 'temp');

/** Get a local temp directory for a drama (used during pipeline processing) */
export function getDramaDir(dramaId: string): string {
  const dir = path.join(LOCAL_TEMP_DIR, dramaId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Get a subdirectory within a drama's temp folder */
export function getDramaSubDir(dramaId: string, sub: string): string {
  const dir = path.join(LOCAL_TEMP_DIR, dramaId, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Upload an audio file to Cloudinary and return the URL.
 * The file is uploaded as 'raw' resource type (for mp3 files).
 */
export async function uploadAudioFile(
  dramaId: string,
  type: string,
  filename: string,
  filePath: string,
): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const publicId = `${type}/${filename.replace(/\.[^.]+$/, '')}`;
  return uploadToCloudinary(buffer, {
    folder: `auditorium/audio/${dramaId}`,
    publicId,
    resourceType: 'raw',
    format: 'mp3',
  });
}

/**
 * Upload a thumbnail to Cloudinary and return the URL.
 */
export async function uploadThumbnail(
  dramaId: string,
  buffer: Buffer,
  format: 'png' | 'webp' = 'webp',
): Promise<string> {
  return uploadToCloudinary(buffer, {
    folder: 'auditorium/thumbnails',
    publicId: dramaId,
    resourceType: 'image',
    format,
  });
}

/**
 * Upload an episode audio file to Cloudinary and return the URL.
 */
export async function uploadEpisodeAudio(
  dramaId: string,
  episodeId: string,
  filePath: string,
): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  return uploadToCloudinary(buffer, {
    folder: `auditorium/audio/${dramaId}/episodes`,
    publicId: episodeId,
    resourceType: 'raw',
    format: 'mp3',
  });
}

/** Get the local temp path for a thumbnail (used during generation) */
export function getThumbnailPath(dramaId: string): string {
  const dir = path.join(LOCAL_TEMP_DIR, 'thumbnails');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${dramaId}.png`);
}

/** Delete all Cloudinary resources for a drama */
export async function deleteDramaFiles(dramaId: string): Promise<void> {
  await deleteCloudinaryFolder(`auditorium/audio/${dramaId}`);
  // Delete thumbnail
  try {
    const { deleteFromCloudinary } = await import('./cloudinaryClient.js');
    await deleteFromCloudinary(`auditorium/thumbnails/${dramaId}`, 'image');
  } catch {
    // Thumbnail might not exist
  }

  // Clean up local temp files
  const tempDir = path.join(LOCAL_TEMP_DIR, dramaId);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** Save an audio file locally (for pipeline processing) and return the path */
export function saveAudioFile(
  dramaId: string,
  type: string,
  filename: string,
  buffer: Buffer,
): string {
  const dir = getDramaSubDir(dramaId, type);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/** Get the path where an audio file would be stored locally */
export function getAudioFilePath(
  dramaId: string,
  type: string,
  filename: string,
): string {
  return path.join(getDramaSubDir(dramaId, type), filename);
}

/** Legacy compat — save thumbnail locally */
export function saveThumbnail(dramaId: string, buffer: Buffer): string {
  const filePath = getThumbnailPath(dramaId);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
