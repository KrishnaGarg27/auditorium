import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: probe-outputs.ts <drama-output-dir>');
  process.exit(1);
}

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.mp3'))
  .sort();

for (const f of files) {
  const fp = path.join(dir, f);
  const out = execFileSync(
    ffprobeInstaller.path,
    [
      '-v',
      'error',
      '-show_entries',
      'stream=channels,sample_rate,duration,bit_rate:format=duration',
      '-of',
      'default=noprint_wrappers=1',
      fp,
    ],
    { encoding: 'utf-8' },
  );
  console.log(`--- ${f} ---`);
  console.log(out.trim());
}
