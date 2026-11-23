import { expect, test } from '@playwright/test';
import { CHEEK_EYE_SCRIPT } from '../../src/features/wonder/demoScript';
import { verifyExportZip } from '../../src/lib/archive';
import { enterPin, PIN, recordClip, setupFamily, speechStub, spoken, startSession, waitPhase } from './helpers';
import { readFileSync } from 'node:fs';

const SHOTS = !!process.env.SCREENSHOTS;
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (SHOTS) { if (name.startsWith('parent')) await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `docs/screenshots/${name}.png` }); }
};

test.beforeEach(async ({ page }) => {
  if (SHOTS) await page.addInitScript(() => { (window as unknown as { __speechMs: number }).__speechMs = 2500; });
  await page.addInitScript(speechStub);
});

test('north star: four-turn cheek-eye exploration with no typing, then kept and replayed in the journal', async ({ page }) => {
  if (SHOTS) { await page.goto('/'); await page.waitForTimeout(400); await shot(page, 'landing'); }
  await setupFamily(page);
  await shot(page, 'parent-home');
  await startSession(page, 'script');

  // Onboarding: the guide says it is AI and can be wrong — spoken, not just written.
  await waitPhase(page, 'idle');
  expect((await spoken(page))[0]).toMatch(/computer program, not a person/);
  await shot(page, 'child-idle');

  const expectations = [/^Ooh, eyes! .*six small muscles/s, /different spots.*eye muscles/s, /pretend idea/, /pretend game, your cheek eye blinks all by itself.*eyelashes/s];
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('wonder-button').click();
    await waitPhase(page, 'listening');
    if (i === 0) await shot(page, 'child-listening');
    await page.waitForTimeout(900);
    await page.getByTestId('wonder-button').click();
    await waitPhase(page, 'review');
    if (i === 0) await shot(page, 'child-review');
    await page.getByTestId('send').click();
    if (i === 2 && SHOTS) { await waitPhase(page, 'speaking'); await shot(page, 'child-speaking'); }
    await waitPhase(page, 'idle');
    if (i === 0) await shot(page, 'child-explore');
    const caption = page.getByTestId('caption');
    await expect(caption).toHaveCount(1); // one current reply — never a scrolling chat transcript
    await expect(caption).toHaveText(expectations[i]);
    // No typing in the child flow: no text inputs on screen.
    await expect(page.locator('.wonder-room input, .wonder-room textarea')).toHaveCount(0);
  }
  // Earlier replies are not stacked up on the child screen.
  await expect(page.locator('.wonder-room')).not.toContainText('six small muscles');
  await expect(page.getByRole('button', { name: 'Ask TT another question' })).toBeVisible();
  const said = await spoken(page);
  expect(said.length).toBe(5); // intro + four replies were actually spoken

  // Parent locks the room; parent area requires the PIN.
  await page.getByRole('button', { name: 'End' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByRole('heading', { name: 'All done exploring for now.' })).toBeVisible();
  await page.getByRole('button', { name: 'Grown-up' }).click();
  await enterPin(page);
  await expect(page.getByRole('heading', { name: 'Keep this Wonder Thread?' })).toBeVisible();
  await page.getByRole('button', { name: /Keep in journal/ }).click();
  await expect(page.getByRole('heading', { name: 'Keep this Wonder Thread?' })).toHaveCount(0);

  // Wonder Thread: ordered turns, original playable recordings, honest provenance.
  const turns = page.getByTestId('turn');
  await expect(turns).toHaveCount(8);
  for (let i = 0; i < 4; i++) {
    await expect(turns.nth(i * 2)).toContainText(CHEEK_EYE_SCRIPT[i]);
    await expect(turns.nth(i * 2)).toContainText('scripted practice line');
    await expect(turns.nth(i * 2 + 1)).toContainText('pre-written practice reply (not live AI)');
  }
  const audio = page.locator('.own-words audio');
  await expect(audio).toHaveCount(4);
  // The stored originals are real recordings from the microphone stream, and they decode.
  const durations = await audio.evaluateAll((els) => Promise.all((els as HTMLAudioElement[]).map((a) => new Promise<number>((res) => {
    if (a.readyState >= 1) return res(a.duration);
    a.addEventListener('loadedmetadata', () => res(a.duration), { once: true });
    a.addEventListener('error', () => res(-1), { once: true });
    a.load();
  }))));
  for (const d of durations) expect(d === Infinity || d > 0.3).toBe(true); // webm from MediaRecorder may report Infinity until fully read
  const media = await page.evaluate(async () => {
    const open = indexedDB.open('tinkadoo');
    const dbh: IDBDatabase = await new Promise((r) => { open.onsuccess = () => r(open.result); });
    const all: Array<{ mimeType: string; byteCount: number; kind: string; state: string }> = await new Promise((r) => { const q = dbh.transaction('media').objectStore('media').getAll(); q.onsuccess = () => r(q.result); });
    return all.filter((m) => m.kind === 'child_audio' && !('synthetic' in m && (m as { synthetic?: boolean }).synthetic));
  });
  expect(media).toHaveLength(4);
  for (const m of media) { expect(m.byteCount).toBeGreaterThan(1000); expect(m.mimeType).toMatch(/^audio\//); expect(m.state).toBe('final'); }

  // Parent note + keep-this-moment highlight (metadata only).
  await page.getByPlaceholder(/What you noticed/).fill('She blinked one eye at a time all through dinner.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('She blinked one eye at a time')).toBeVisible();
  await turns.nth(4).getByRole('button', { name: 'Keep this moment' }).click();
  await expect(turns.nth(4).getByRole('button', { name: 'Remove from kept moments' })).toBeVisible();
  await shot(page, 'parent-wonder-thread');

  // Journal lists it; export downloads a verifiable archive including the 4 originals.
  await page.getByRole('link', { name: 'Journal', exact: true }).click();
  await expect(page.locator('.memory-card', { hasText: 'How do my eyes move?' })).toBeVisible();
  await page.getByPlaceholder(/Search/).fill('cheek');
  await expect(page.locator('.memory-card')).toHaveCount(2); // ours + synthetic seed
  if (SHOTS) await shot(page, 'parent-journal');
  await page.getByRole('link', { name: 'Archive', exact: true }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export everything kept/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^Tinkadoo-Family-Export-\d{4}-\d{2}-\d{2}\.zip$/);
  const zip = new Uint8Array(readFileSync(await dl.path()));
  const v = await verifyExportZip(zip);
  expect(v.errors).toEqual([]);
  expect(v.memoryCount).toBe(2);
  expect(v.mediaCount).toBe(8); // 4 real + 4 synthetic tones
});

test('recording survives a reload mid-session (and works offline from the app shell)', async ({ page, context }) => {
  await setupFamily(page, { seed: false });
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await startSession(page, 'script');
  await waitPhase(page, 'idle');
  await recordClip(page);
  await context.setOffline(true);
  await page.reload();
  // Offline + reload: the shell comes from the service worker; the unsent recording comes back from IndexedDB.
  await waitPhase(page, 'review');
  await page.getByTestId('send').click();
  await waitPhase(page, 'idle');
  await expect(page.getByTestId('caption')).toContainText('six small muscles');
  await context.setOffline(false);
});

test('parent can pause, must use the PIN to resume, and can take over with their own answer', async ({ page }) => {
  await setupFamily(page, { seed: false });
  await startSession(page, 'typed');
  await waitPhase(page, 'idle');

  // Typed mode: a grown-up writes what the child asked.
  await recordClip(page);
  await page.getByTestId('send').click();
  await page.getByRole('textbox', { name: 'Their question' }).fill('Why do cats purr?');
  await page.getByRole('button', { name: 'Use this' }).click();
  await waitPhase(page, 'idle');
  await expect(page.getByTestId('caption')).toHaveText(/practice conversation.*grown-up/); // honest, not invented

  // Pause → wrong PIN refused → right PIN resumes.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: /Grown-up: resume/ }).click();
  await enterPin(page, '1111');
  await expect(page.locator('.pin-msg')).toHaveText(/didn’t match/);
  await enterPin(page);
  await expect(page.getByRole('heading', { name: 'Paused' })).toHaveCount(0);

  // Take over: the grown-up answers.
  await page.getByRole('button', { name: /I’ll answer/ }).click();
  await page.getByPlaceholder(/type what you told them/).fill('Cats purr when they are relaxed, and sometimes to soothe themselves.');
  await page.getByRole('button', { name: 'Save my answer' }).click();
  await expect(page.getByTestId('caption')).toContainText('Cats purr when they are relaxed');
  await expect(page.locator('.wonder-room')).not.toContainText(/friend/i);

  // The parent area stays locked while the child room is open.
  const url = page.url();
  await page.goto(url.replace(/#\/wonder\/.*/, '#/parent/archive'));
  await expect(page.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Archive/ })).toHaveCount(0);
  await enterPin(page);
  await expect(page.getByRole('heading', { name: /Archive/ })).toBeVisible();
});

test('“Don’t save” discards the recording, and “Don’t keep” deletes the whole session', async ({ page }) => {
  await setupFamily(page, { seed: false });
  await startSession(page, 'script');
  await waitPhase(page, 'idle');
  await recordClip(page);
  await page.getByRole('button', { name: 'Don\'t save' }).click();
  await waitPhase(page, 'idle');
  const count = () => page.evaluate(async () => {
    const open = indexedDB.open('tinkadoo');
    const dbh: IDBDatabase = await new Promise((r) => { open.onsuccess = () => r(open.result); });
    return new Promise<number>((r) => { const q = dbh.transaction('media').objectStore('media').count(); q.onsuccess = () => r(q.result); });
  });
  expect(await count()).toBe(0);
  await recordClip(page);
  await page.getByTestId('send').click();
  await waitPhase(page, 'idle');
  expect(await count()).toBe(1);
  await page.getByRole('button', { name: 'End' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Grown-up' }).click();
  await enterPin(page);
  await page.getByRole('button', { name: 'Don’t keep' }).click();
  await page.getByRole('button', { name: /Delete all 1 recordings for good/ }).click();
  await expect(page.getByRole('heading', { name: 'Ready when they are.' })).toBeVisible();
  expect(await count()).toBe(0);
});

test('microphone denied: gentle recovery, and the grown-up can type the question instead', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await setupFamily(page, { seed: false });
  await startSession(page, 'script');
  await waitPhase(page, 'idle');
  await page.getByTestId('wonder-button').click();
  await waitPhase(page, 'error');
  await expect(page.getByRole('heading', { name: 'The microphone is asleep.' })).toBeVisible();
  await page.getByText('Grown-up help').click();
  await expect(page.getByText(/Settings › Apps › Safari › Microphone/)).toBeVisible();
  await page.getByRole('button', { name: 'Type their question instead' }).click();
  await page.getByRole('textbox', { name: 'Their question' }).fill('How do my eyes move?');
  await page.getByRole('button', { name: 'Use this' }).click();
  await waitPhase(page, 'idle');
  await expect(page.getByTestId('caption')).toContainText('six small muscles');
});

test('speech unavailable: replies still appear as captions with a grown-up note', async ({ page }) => {
  await page.addInitScript(() => {
    // Runs after speechStub: remove speech entirely.
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
  });
  await setupFamily(page, { seed: false });
  await startSession(page, 'script');
  await waitPhase(page, 'idle');
  await expect(page.getByTestId('caption')).toContainText('computer program');
  await recordClip(page);
  await page.getByTestId('send').click();
  await waitPhase(page, 'idle');
  await expect(page.getByTestId('caption')).toContainText('six small muscles');
  await expect(page.getByText(/Sound isn’t available here/)).toBeVisible();
});

test('explore cards: optional, tappable, and recorded honestly in the journal', async ({ page }) => {
  await setupFamily(page, { seed: false });
  await startSession(page, 'script');
  await waitPhase(page, 'idle');
  await expect(page.locator('.explore-card')).toHaveCount(0); // nothing offered before a real answer
  await recordClip(page);
  await page.getByTestId('send').click();
  await waitPhase(page, 'idle');
  const cards = page.locator('.explore-card');
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: 'Why do we blink?' }).click();
  await waitPhase(page, 'idle');
  await expect(page.getByTestId('caption')).toContainText('Blinking spreads tears');
  await expect(cards).not.toContainText(['Why do we blink?']);
  await page.getByRole('button', { name: 'End' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Grown-up' }).click();
  await enterPin(page);
  await expect(page.getByTestId('turn').filter({ hasText: 'Why do we blink?' })).toContainText('tapped an explore idea suggested by TT');
});

test('child room at phone width keeps the 96px+ mic button and the brand’s 56px tap targets', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await setupFamily(page, { seed: false });
  await startSession(page, 'script');
  await waitPhase(page, 'idle');
  const box = await page.getByTestId('wonder-button').boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(96);
  for (const b of await page.locator('.wonder-room button').all()) {
    const bb = await b.boundingBox();
    if (bb) { expect(bb.height, await b.innerText()).toBeGreaterThanOrEqual(56); expect(bb.width).toBeGreaterThanOrEqual(56); }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  if (SHOTS) await shot(page, 'child-idle-phone');
  void PIN;
});
