import ffmpeg from 'fluent-ffmpeg';
import * as path from 'node:path';
import * as fs from 'node:fs';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'episodes');

/**
 * Concatenate scene audio files into a single episode audio file.
 *
 * Scene paths must be provided in ascending scene sequence number order
 * (Property 15). The caller is responsible for sorting; this function
 * concatenates in the order given.
 *
 * Uses the FFmpeg concat demuxer for efficient lossless-ish concatenation.
 * Output: MP3 44.1kHz 192kbps.
 */
export async function concatenateEpisode(
  scenePaths: string[],
  episodeId: string,
  outputDir?: string,
): Promise<string> {
  const outDir = outputDir ?? OUTPUT_DIR;
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outputPath = path.join(outDir, `${episodeId}.mp3`);

  // Filter out missing files with warnings
  const validPaths = scenePaths.filter((p) => {
    if (!fs.existsSync(p)) {
      console.warn(`[AudioMixer] Missing scene file for concatenation: ${p}, skipping`);
      return false;
    }
    return true;
  });

  if (validPaths.length === 0) {
    console.warn(`[AudioMixer] No valid scene files for episode ${episodeId}`);
    // Produce a short silent file
    return new Promise<string>((resolve, reject) => {
      ffmpeg()
        .input('anullsrc=r=44100:cl=stereo')
        .inputFormat('lavfi')
        .duration(1)
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .audioFrequency(44100)
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err: Error) => reject(err))
        .run();
    });
  }

  if (validPaths.length === 1) {
    // Single scene — just copy
    fs.copyFileSync(validPaths[0], outputPath);
    return outputPath;
  }

  // Write a concat list file for the FFmpeg concat demuxer
  const concatListPath = path.join(outDir, `${episodeId}_concat.txt`);
  const concatContent = validPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(concatListPath, concatContent, 'utf-8');

  return new Promise<string>((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .audioFrequency(44100)
      .audioChannels(2)
      .output(outputPath)
      .on('end', () => {
        // Clean up the temporary concat list file
        try {
          fs.unlinkSync(concatListPath);
        } catch {
          // ignore cleanup errors
        }
        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        console.warn(`[AudioMixer] FFmpeg concat error for episode ${episodeId}:`, err.message);
        // Clean up the temporary concat list file
        try {
          fs.unlinkSync(concatListPath);
        } catch {
          // ignore cleanup errors
        }
        reject(err);
      })
      .run();
  });
}
