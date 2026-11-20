import { __resetAuthForTests, hasPin, isUnlocked, lockParent, setPin, unlock, verifyPin } from '../../src/lib/auth';
import { db } from '../../src/lib/db';
import { freshDb } from './helpers';

beforeEach(() => { freshDb(); __resetAuthForTests(); });

describe('parent PIN gate', () => {
  it('stores only a salted PBKDF2 hash', async () => {
    await setPin('2468');
    const rec = (await db.settings.get('parentPin'))!.value as Record<string, unknown>;
    expect(JSON.stringify(rec)).not.toContain('2468');
    expect(rec.algo).toBe('pbkdf2-sha256');
    expect(await hasPin()).toBe(true);
  });
  it('rejects weak PIN formats', async () => {
    await expect(setPin('12')).rejects.toThrow();
    await expect(setPin('abcd')).rejects.toThrow();
  });
  it('unlocks with the right PIN, not the wrong one, and relocks', async () => {
    await setPin('2468');
    expect(await unlock('1111')).toEqual({ ok: false, reason: 'wrong' });
    expect(isUnlocked()).toBe(false);
    expect((await unlock('2468')).ok).toBe(true);
    expect(isUnlocked()).toBe(true);
    lockParent();
    expect(isUnlocked()).toBe(false);
    expect(await verifyPin('2468')).toBe(true);
  });
  it('unlock expires after 15 minutes', async () => {
    await setPin('2468');
    const now = Date.now();
    await unlock('2468', now);
    expect(isUnlocked(now + 14 * 60_000)).toBe(true);
    expect(isUnlocked(now + 16 * 60_000)).toBe(false);
  });
  it('locks out after 5 wrong attempts, even for the right PIN', async () => {
    await setPin('2468');
    const now = Date.now();
    for (let i = 0; i < 4; i++) expect((await unlock('0000', now)).ok).toBe(false);
    expect(await unlock('0000', now)).toMatchObject({ ok: false, reason: 'locked_out' });
    expect(await unlock('2468', now + 1000)).toMatchObject({ ok: false, reason: 'locked_out' });
    expect((await unlock('2468', now + 31_000)).ok).toBe(true);
  });
});

describe('verify-only PIN check (resume a child session)', () => {
  it('confirms the PIN without opening the parent area', async () => {
    const { checkPin } = await import('../../src/lib/auth');
    await setPin('2468');
    expect((await checkPin('2468')).ok).toBe(true);
    expect(isUnlocked()).toBe(false);
    expect((await checkPin('0000')).ok).toBe(false);
  });
});
