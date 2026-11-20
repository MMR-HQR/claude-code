import { sha256Hex, sha256HexSync } from '../../src/lib/hash';
import { uuid, UUID_RE } from '../../src/lib/ids';
import { extensionForMime, pickRecorderMimeType } from '../../src/lib/media';
import { classifyMediaError, recTransition } from '../../src/lib/recorder';

describe('ids', () => {
  it('generates distinct v4 UUIDs', () => {
    const ids = new Set(Array.from({ length: 500 }, uuid));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(UUID_RE);
  });
});

describe('sha256', () => {
  it('matches the FIPS 180-2 test vectors in both implementations', async () => {
    const abc = new TextEncoder().encode('abc');
    expect(sha256HexSync(abc)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(abc)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256HexSync(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('agrees across block boundaries', async () => {
    for (const n of [55, 56, 63, 64, 65, 1000, 70_001]) {
      const b = new Uint8Array(n).map((_, i) => (i * 31) & 255);
      expect(sha256HexSync(b)).toBe(await sha256Hex(b));
    }
  });
});

describe('media format negotiation', () => {
  it('prefers mp4/AAC, falls back by browser support, never hardcodes', () => {
    expect(pickRecorderMimeType(() => true)).toBe('audio/mp4;codecs=mp4a.40.2');
    expect(pickRecorderMimeType((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickRecorderMimeType(() => false)).toBeUndefined();
    expect(pickRecorderMimeType(() => { throw new Error('boom'); })).toBeUndefined();
  });
  it('derives file extensions from the actual MIME type', () => {
    expect(extensionForMime('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionForMime('audio/ogg')).toBe('ogg');
    expect(extensionForMime('audio/wav')).toBe('wav');
    expect(extensionForMime('application/x-unknown')).toBe('bin');
  });
});

describe('recording state machine', () => {
  it('walks the happy path idle → listening → review → saved', () => {
    let s = recTransition('idle', 'START');
    s = recTransition(s, 'GRANTED');
    expect(s).toBe('listening');
    s = recTransition(s, 'STOP');
    expect(s).toBe('review');
    expect(recTransition(s, 'SAVE')).toBe('saved');
    expect(recTransition(s, 'DISCARD')).toBe('idle');
    expect(recTransition(s, 'START')).toBe('requesting'); // do-over
  });
  it('handles errors and cancellation', () => {
    expect(recTransition('requesting', 'FAIL')).toBe('error');
    expect(recTransition('listening', 'CANCEL')).toBe('idle');
    expect(recTransition('error', 'START')).toBe('requesting');
  });
  it('rejects impossible transitions', () => {
    expect(() => recTransition('idle', 'STOP')).toThrow();
    expect(() => recTransition('saved', 'STOP')).toThrow();
    expect(() => recTransition('listening', 'SAVE')).toThrow();
  });
  it('classifies getUserMedia failures', () => {
    expect(classifyMediaError({ name: 'NotAllowedError' })).toBe('denied');
    expect(classifyMediaError({ name: 'NotFoundError' })).toBe('no_mic');
    expect(classifyMediaError({ name: 'NotReadableError' })).toBe('busy');
    expect(classifyMediaError(new Error('x'))).toBe('unknown');
  });
});
