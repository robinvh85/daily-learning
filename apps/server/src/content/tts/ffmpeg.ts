/**
 * ffmpeg / ffprobe helpers for the audio pipeline (plan 2.3 / 2.4).
 *
 * Clips are decoded to 24 kHz mono 16-bit WAV, joined with exact silence gaps by the concat
 * demuxer (sample-exact, so segment offsets are the sum of the measured WAV durations), then
 * encoded once to MP3 mono 64 kbps.
 */
import { execFile, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const SAMPLE_RATE = 24000;
export const MP3_BITRATE = '64k';

export const FFMPEG_INSTALL_HINT =
  'ffmpeg (with ffprobe) is required for the audio pipeline.\n' +
  '  macOS:  brew install ffmpeg   (then open a new terminal)\n' +
  '  Linux:  sudo apt install ffmpeg';

export class FfmpegMissingError extends Error {}

/** Throw a clear install message when ffmpeg, ffprobe or its MP3 encoder is missing. */
export function assertFfmpeg(): void {
  for (const bin of ['ffmpeg', 'ffprobe']) {
    try {
      execFileSync(bin, ['-hide_banner', '-version'], { stdio: 'ignore' });
    } catch {
      throw new FfmpegMissingError(`${bin} not found.\n${FFMPEG_INSTALL_HINT}`);
    }
  }
  const encoders = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (!encoders.includes('libmp3lame')) {
    throw new FfmpegMissingError(
      `this ffmpeg build has no MP3 encoder (libmp3lame).\n${FFMPEG_INSTALL_HINT}`,
    );
  }
}

/** True when ffmpeg + ffprobe + libmp3lame are available (used to skip tests). */
export function hasFfmpeg(): boolean {
  try {
    assertFfmpeg();
    return true;
  } catch {
    return false;
  }
}

async function ffmpeg(args: string[]): Promise<Buffer> {
  const { stdout } = await execFileAsync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], {
    encoding: 'buffer',
    maxBuffer: 512 * 1024 * 1024,
  });
  return stdout;
}

/** Duration of a media file in milliseconds (ffprobe, not rounded). */
export async function probeDurationMs(file: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe: no duration for ${file}`);
  return seconds * 1000;
}

/** Decode any audio file to 24 kHz mono 16-bit WAV. */
export async function toWav(input: string, output: string): Promise<void> {
  await ffmpeg(['-i', input, '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le', output]);
}

/** Exact silence as 24 kHz mono WAV. */
export async function silenceWav(ms: number, output: string): Promise<void> {
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=${SAMPLE_RATE}:cl=mono`,
    '-t',
    (ms / 1000).toFixed(3),
    '-c:a',
    'pcm_s16le',
    output,
  ]);
}

/** Join WAV files in order and encode to MP3 mono 64 kbps. */
export async function concatToMp3(inputs: readonly string[], output: string, workDir: string) {
  const list = join(workDir, 'concat.txt');
  writeFileSync(list, inputs.map((f) => `file '${f.replace(/'/g, `'\\''`)}'`).join('\n') + '\n');
  await ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-c:a',
    'libmp3lame',
    '-b:a',
    MP3_BITRATE,
    output,
  ]);
}

/** Re-encode one file to MP3 mono 64 kbps (word pronunciations). */
export async function normalizeMp3(input: string, output: string): Promise<void> {
  await ffmpeg([
    '-i',
    input,
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-c:a',
    'libmp3lame',
    '-b:a',
    MP3_BITRATE,
    output,
  ]);
}

/** `bars` waveform peaks (max |sample| per bar), normalized so the loudest bar is 1. */
export async function computePeaks(file: string, bars = 80): Promise<number[]> {
  const raw = await ffmpeg(['-i', file, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']);
  const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
  const peaks = new Array<number>(bars).fill(0);
  if (samples.length === 0) return peaks;
  for (let b = 0; b < bars; b++) {
    const from = Math.floor((b * samples.length) / bars);
    const to = Math.max(from + 1, Math.floor(((b + 1) * samples.length) / bars));
    let max = 0;
    for (let i = from; i < to && i < samples.length; i++) {
      const v = Math.abs(samples[i]!);
      if (v > max) max = v;
    }
    peaks[b] = max;
  }
  const top = Math.max(...peaks);
  return peaks.map((p) => (top > 0 ? Math.round((p / top) * 1000) / 1000 : 0));
}

/** A test tone as MP3 bytes (fake provider). */
export async function toneMp3(opts: { ms: number; frequency: number }): Promise<Buffer> {
  return ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${opts.frequency}:sample_rate=${SAMPLE_RATE}:duration=${(opts.ms / 1000).toFixed(3)}`,
    '-af',
    'volume=0.3,tremolo=f=3:d=0.8',
    '-ac',
    '1',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '48k',
    '-f',
    'mp3',
    '-',
  ]);
}
