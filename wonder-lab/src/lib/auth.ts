/**
 * Local parent gate (this slice). A 4–8 digit PIN is stretched with PBKDF2-SHA256
 * and only the salt + derived hash are stored. This protects parent routes on a
 * shared device; it is NOT server authentication. Server-side parent auth arrives
 * with the Supabase sprint (see docs/architecture.md).
 */
import { db } from './db';
import { sha256HexSync } from './hash';

const PIN_KEY = 'parentPin';
const UNLOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
const ITERATIONS = 150_000;

interface StoredPin { salt: string; hash: string; iterations: number; algo: 'pbkdf2-sha256' | 'sha256-iter' }

let unlockedUntil = 0;
let failed = 0;
let lockedOutUntil = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeAuth(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export const isPinValid = (pin: string) => /^\d{4,8}$/.test(pin);

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

async function derive(pin: string, saltHex: string, iterations: number): Promise<StoredPin> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations }, key, 256);
    return { salt: saltHex, hash: hex(new Uint8Array(bits)), iterations, algo: 'pbkdf2-sha256' };
  }
  // Insecure-context fallback (e.g. plain-http LAN). Weaker; documented.
  let h = saltHex + pin;
  for (let i = 0; i < 20_000; i++) h = sha256HexSync(new TextEncoder().encode(h));
  return { salt: saltHex, hash: h, iterations: 20_000, algo: 'sha256-iter' };
}

export async function setPin(pin: string): Promise<void> {
  if (!isPinValid(pin)) throw new Error('PIN must be 4–8 digits');
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const stored = await derive(pin, hex(salt), ITERATIONS);
  await db.settings.put({ key: PIN_KEY, value: stored });
}

export async function hasPin(): Promise<boolean> {
  return !!(await db.settings.get(PIN_KEY));
}

export type UnlockResult = { ok: true } | { ok: false; reason: 'wrong' | 'locked_out' | 'no_pin'; retryInMs?: number };

/** Check the PIN (with lockout) WITHOUT opening the parent area. Used to resume a child session. */
export async function checkPin(pin: string, now = Date.now()): Promise<UnlockResult> {
  if (now < lockedOutUntil) return { ok: false, reason: 'locked_out', retryInMs: lockedOutUntil - now };
  const rec = (await db.settings.get(PIN_KEY))?.value as StoredPin | undefined;
  if (!rec) return { ok: false, reason: 'no_pin' };
  const attempt = await derive(pin, rec.salt, rec.iterations);
  if (attempt.hash === rec.hash) {
    failed = 0;
    return { ok: true };
  }
  failed += 1;
  if (failed >= MAX_ATTEMPTS) {
    failed = 0;
    lockedOutUntil = now + LOCKOUT_MS;
    return { ok: false, reason: 'locked_out', retryInMs: LOCKOUT_MS };
  }
  return { ok: false, reason: 'wrong' };
}

/** Check the PIN and open the parent area for UNLOCK_MS. */
export async function unlock(pin: string, now = Date.now()): Promise<UnlockResult> {
  const r = await checkPin(pin, now);
  if (r.ok) {
    unlockedUntil = now + UNLOCK_MS;
    emit();
  }
  return r;
}

/** Re-verify the PIN without changing unlock state (for sensitive actions). */
export async function verifyPin(pin: string): Promise<boolean> {
  const rec = (await db.settings.get(PIN_KEY))?.value as StoredPin | undefined;
  if (!rec) return false;
  return (await derive(pin, rec.salt, rec.iterations)).hash === rec.hash;
}

export function isUnlocked(now = Date.now()): boolean {
  return now < unlockedUntil;
}

/** Refresh the unlock window on parent activity. */
export function touchUnlock(now = Date.now()) {
  if (isUnlocked(now)) unlockedUntil = now + UNLOCK_MS;
}

export function lockParent() {
  unlockedUntil = 0;
  emit();
}

/** Test-only reset. */
export function __resetAuthForTests() {
  unlockedUntil = 0;
  failed = 0;
  lockedOutUntil = 0;
}
