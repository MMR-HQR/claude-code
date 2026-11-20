import { MAX_RECORDING_MS, pickRecorderMimeType } from './media';

// ---------------------------------------------------------------- pure state machine
export type RecState = 'idle' | 'requesting' | 'listening' | 'review' | 'saved' | 'error';
export type RecEvent = 'START' | 'GRANTED' | 'FAIL' | 'STOP' | 'DISCARD' | 'SAVE' | 'RESET' | 'CANCEL';

const TRANSITIONS: Record<RecState, Partial<Record<RecEvent, RecState>>> = {
  idle: { START: 'requesting' },
  requesting: { GRANTED: 'listening', FAIL: 'error', CANCEL: 'idle' },
  listening: { STOP: 'review', FAIL: 'error', CANCEL: 'idle' },
  review: { DISCARD: 'idle', SAVE: 'saved', START: 'requesting' },
  saved: { RESET: 'idle', START: 'requesting' },
  error: { RESET: 'idle', START: 'requesting' },
};

export function recTransition(state: RecState, ev: RecEvent): RecState {
  const next = TRANSITIONS[state][ev];
  if (!next) throw new Error(`Invalid recording transition ${state} --${ev}-->`);
  return next;
}

// ---------------------------------------------------------------- capture
export type RecorderErrorCode = 'insecure' | 'unsupported' | 'denied' | 'no_mic' | 'busy' | 'empty' | 'unknown';
export class RecorderError extends Error {
  constructor(public code: RecorderErrorCode, message?: string) {
    super(message ?? code);
  }
}

export interface CapturedAudio { bytes: ArrayBuffer; mimeType: string; durationMs: number }

export function classifyMediaError(e: unknown): RecorderErrorCode {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'no_mic';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'unknown';
}

/**
 * Wraps getUserMedia + MediaRecorder. Must be started from a user gesture.
 * Tracks are always stopped after each recording (and on dispose) so the mic
 * indicator never lingers.
 */
export class AudioRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Uint8Array | null = null;
  private autoStop: ReturnType<typeof setTimeout> | null = null;
  onAutoStop: (() => void) | null = null;

  static support(): RecorderErrorCode | null {
    if (typeof window === 'undefined') return 'unsupported';
    if (!window.isSecureContext) return 'insecure';
    if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
    if (typeof window.MediaRecorder !== 'function') return 'unsupported';
    return null;
  }

  async start(): Promise<void> {
    const unsupported = AudioRecorder.support();
    if (unsupported) throw new RecorderError(unsupported);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      throw new RecorderError(classifyMediaError(e), (e as Error)?.message);
    }
    const mimeType = pickRecorderMimeType((t) => MediaRecorder.isTypeSupported(t));
    try {
      this.rec = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    } catch {
      this.rec = new MediaRecorder(this.stream);
    }
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data && e.data.size > 0 && this.chunks.push(e.data);
    this.rec.start(250);
    this.startedAt = performance.now();
    this.autoStop = setTimeout(() => this.onAutoStop?.(), MAX_RECORDING_MS);
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
      this.buf = new Uint8Array(this.analyser.fftSize);
    } catch {
      this.analyser = null; // level meter is decorative; recording still works
    }
  }

  /** 0..1 loudness for the visual meter. */
  level(): number {
    if (!this.analyser || !this.buf) return 0;
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 4);
  }

  elapsedMs(): number {
    return this.rec ? performance.now() - this.startedAt : 0;
  }

  async stop(): Promise<CapturedAudio> {
    const rec = this.rec;
    if (!rec) throw new RecorderError('unknown', 'Not recording');
    const durationMs = this.elapsedMs();
    const stopped = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    const mimeType = rec.mimeType || this.chunks[0]?.type || 'audio/webm';
    const blob = new Blob(this.chunks, { type: mimeType });
    this.release();
    if (blob.size === 0) throw new RecorderError('empty', 'No audio was captured');
    return { bytes: await blob.arrayBuffer(), mimeType, durationMs };
  }

  cancel() {
    try {
      if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    } catch { /* ignore */ }
    this.chunks = [];
    this.release();
  }

  private release() {
    if (this.autoStop) clearTimeout(this.autoStop);
    this.autoStop = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    this.analyser = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
