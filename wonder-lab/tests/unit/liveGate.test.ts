import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateLiveGate, APPROVED_PROVIDERS } from '../../server/providers/liveGate';

const consent = { providerProcessingGranted: true, revoked: false };
const fullEnv = { LIVE_AI_ENABLED: 'true', PROVIDER_PRIVACY_APPROVED: 'true', LIVE_AI_PROVIDER: 'someprovider', AI_PROVIDER_API_KEY: 'x' };

describe('live provider gate fails closed', () => {
  it('denies with an empty environment', () => {
    const d = evaluateLiveGate({}, null);
    expect(d.allowed).toBe(false);
  });
  it('denies the shipped .env.example defaults', () => {
    const env = Object.fromEntries(readFileSync('.env.example', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split('#')[0].trim().split('=') as [string, string]));
    expect(evaluateLiveGate(env, consent).allowed).toBe(false);
  });
  it.each([
    ['LIVE_AI_ENABLED', 'false'], ['LIVE_AI_ENABLED', 'TRUE'], ['LIVE_AI_ENABLED', '1'],
    ['PROVIDER_PRIVACY_APPROVED', 'false'], ['PROVIDER_PRIVACY_APPROVED', ''],
    ['LIVE_AI_PROVIDER', 'none'], ['AI_PROVIDER_API_KEY', ''],
  ])('denies when %s=%s', (k, v) => {
    expect(evaluateLiveGate({ ...fullEnv, [k]: v }, consent).allowed).toBe(false);
  });
  it('denies without, or with revoked, provider-processing consent', () => {
    expect(evaluateLiveGate(fullEnv, null).allowed).toBe(false);
    expect(evaluateLiveGate(fullEnv, { providerProcessingGranted: false, revoked: false }).allowed).toBe(false);
    expect(evaluateLiveGate(fullEnv, { providerProcessingGranted: true, revoked: true }).allowed).toBe(false);
  });
  it('denies every provider while none has passed Gate C — even with every flag set', () => {
    expect(APPROVED_PROVIDERS).toHaveLength(0);
    const d = evaluateLiveGate(fullEnv, consent);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reasons.join(' ')).toMatch(/Gate C/);
  });
});

describe('browser bundle hygiene', () => {
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((f) => { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(p)) files.push(p); });
  walk('src');
  it('src/ never imports server-only code', () => {
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/from ['"][^'"]*server\//);
  });
  it('src/ makes no network calls and references no secrets', () => {
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
      expect(s, f).not.toMatch(/SERVICE_ROLE|AI_PROVIDER_API_KEY|SESSION_SIGNING_SECRET/);
      expect(s, f).not.toMatch(/webkitSpeechRecognition|SpeechRecognition\b/); // cloud STT is gated
    }
  });
});
