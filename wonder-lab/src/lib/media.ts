/**
 * Recording format negotiation. Never hardcode a container: ask the browser what
 * it can produce and persist the MIME type + extension of what it actually produced.
 */
export const PREFERRED_AUDIO_TYPES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
] as const;

export function pickRecorderMimeType(isSupported: (t: string) => boolean): string | undefined {
  return PREFERRED_AUDIO_TYPES.find((t) => {
    try {
      return isSupported(t);
    } catch {
      return false;
    }
  });
}

export function extensionForMime(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  switch (base) {
    case 'audio/mp4':
    case 'audio/x-m4a':
    case 'audio/aac':
      return 'm4a';
    case 'audio/webm':
      return 'webm';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
      return 'wav';
    case 'audio/mpeg':
      return 'mp3';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    default:
      return 'bin';
  }
}

/** Default per-recording cap (bytes). Documented in README; configurable via VITE_MAX_RECORDING_BYTES. */
export const MAX_RECORDING_BYTES = Number(import.meta.env?.VITE_MAX_RECORDING_BYTES ?? 25 * 1024 * 1024);
/** Child recordings auto-stop after this many ms so a forgotten mic can't run on. */
export const MAX_RECORDING_MS = 90_000;

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
