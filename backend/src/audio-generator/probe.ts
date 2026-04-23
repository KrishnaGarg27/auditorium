import ffmpeg from 'fluent-ffmpeg';

/**
 * Probe an audio file to get its duration in milliseconds.
 * Uses ffprobe via fluent-ffmpeg (path must be set before calling).
 * Returns 0 if probing fails.
 */
export function probeDurationMs(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata?.format?.duration) {
        resolve(0);
        return;
      }
      resolve(Math.round(metadata.format.duration * 1000));
    });
  });
}
