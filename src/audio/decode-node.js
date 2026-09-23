// Node only: decode an audio file (the narration take) to mono Float32 at `sr` with ffmpeg.
import { spawnSync } from 'node:child_process';

export function decodeAudio(file, sr = 48000) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(sr), 'pipe:1'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  const buf = r.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}
