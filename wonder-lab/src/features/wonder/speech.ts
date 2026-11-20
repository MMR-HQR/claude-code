import type { SpeechProvider } from './provider';

/**
 * Speaks with the browser's speechSynthesis. Resolves on end, error, cancel, or a
 * length-based timeout (some engines never fire 'end'). Never throws: callers fall
 * back to the visible caption + "Hear again" button.
 */
export class BrowserSpeechProvider implements SpeechProvider {
  private settle: ((v: 'spoken' | 'cancelled' | 'unavailable') => void) | null = null;

  get available() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  }

  /** Call inside a user gesture (iOS requires the first utterance to be gesture-initiated). */
  prime() {
    if (!this.available) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  speak(text: string): Promise<'spoken' | 'unavailable' | 'cancelled'> {
    if (!this.available) return Promise.resolve('unavailable');
    this.cancel();
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: 'spoken' | 'cancelled' | 'unavailable') => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.settle = null;
        resolve(v);
      };
      this.settle = finish;
      const timer = setTimeout(() => finish('spoken'), 4000 + text.split(/\s+/).length * 450);
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.92;
        u.pitch = 1.05;
        u.lang = 'en-US';
        u.onend = () => finish('spoken');
        u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? 'cancelled' : 'unavailable');
        window.speechSynthesis.speak(u);
      } catch {
        finish('unavailable');
      }
    });
  }

  cancel() {
    if (!this.available) return;
    const s = this.settle;
    this.settle = null;
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    s?.('cancelled');
  }
}

export const speech = new BrowserSpeechProvider();
