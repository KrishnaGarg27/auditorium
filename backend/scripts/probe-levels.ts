import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: probe-levels.ts <drama-output-dir>');
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort();

for (const f of files) {
  const fp = path.join(dir, f);
  const proc = spawnSync(ffmpegInstaller.path, [
    '-hide_banner',
    '-i',
    fp,
    '-af',
    'volumedetect',
    '-vn',
    '-f',
    'null',
    '-',
  ]);
  const stderr = proc.stderr.toString();
  const mean = stderr.match(/mean_volume: (-?[\d.]+) dB/)?.[1] ?? 'n/a';
  const peak = stderr.match(/max_volume: (-?[\d.]+) dB/)?.[1] ?? 'n/a';
  console.log(`${f.padEnd(60)}  mean=${mean} dB  peak=${peak} dB`);
}
