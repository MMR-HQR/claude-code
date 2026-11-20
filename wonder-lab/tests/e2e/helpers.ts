import { expect, type Page } from '@playwright/test';

export const PIN = '2468';

/** Deterministic speechSynthesis stand-in: records what was spoken, "finishes" quickly. */
export const speechStub = () => {
  const spoken: string[] = [];
  (window as unknown as { __spoken: string[] }).__spoken = spoken;
  class FakeUtterance {
    text: string; rate = 1; pitch = 1; lang = ''; volume = 1;
    onend: (() => void) | null = null; onerror: ((e: { error: string }) => void) | null = null;
    constructor(t: string) { this.text = t; }
  }
  let current: FakeUtterance | null = null;
  const synth = {
    speak(u: FakeUtterance) { current = u; if (u.text.trim()) spoken.push(u.text); setTimeout(() => { if (current === u) { current = null; u.onend?.(); } }, (window as unknown as { __speechMs?: number }).__speechMs ?? 150); },
    cancel() { const u = current; current = null; u?.onerror?.({ error: 'canceled' }); },
    getVoices: () => [], speaking: false, pending: false, paused: false,
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
};

export async function setupFamily(page: Page, opts: { seed?: boolean } = {}) {
  await page.goto('/');
  await page.getByLabel(/Family name/).fill('Test household');
  await page.getByLabel(/nickname/).fill('Juniper');
  await page.getByLabel(/^Parent PIN/).fill(PIN);
  await page.getByLabel(/Repeat PIN/).fill(PIN);
  if (opts.seed === false) await page.getByLabel(/synthetic demo/).uncheck();
  await page.getByRole('button', { name: 'Create family space' }).click();
  await expect(page.getByRole('heading', { name: 'Ready when they are.' })).toBeVisible();
}

export async function startSession(page: Page, mode: 'script' | 'typed' = 'script') {
  await page.getByRole('link', { name: /Start wondering/ }).click();
  await page.locator('label.choice', { hasText: 'Juniper' }).click();
  await page.locator('label.choice', { hasText: mode === 'script' ? 'Practice script' : 'I’ll type what they asked' }).click();
  await page.getByLabel(/Record my child’s voice/).check();
  await page.getByRole('button', { name: /Start wondering/ }).click();
  await expect(page).toHaveURL(/#\/wonder\//);
}

export const phase = (page: Page) => page.locator('.wonder-room');

export async function waitPhase(page: Page, p: string) {
  await expect(phase(page)).toHaveAttribute('data-phase', p, { timeout: 15_000 });
}

/** Tap the Wonder Button, speak (fake mic tone) for a moment, tap Done. Leaves the room in review. */
export async function recordClip(page: Page, ms = 900) {
  await page.getByTestId('wonder-button').click();
  await waitPhase(page, 'listening');
  await page.waitForTimeout(ms);
  await page.getByTestId('wonder-button').click();
  await waitPhase(page, 'review');
}

export async function enterPin(page: Page, pin = PIN) {
  await page.locator('#pin-input').fill(pin);
  await page.getByRole('button', { name: 'Unlock' }).click();
}

export async function spoken(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken ?? []);
}
