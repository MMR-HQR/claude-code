import { useState } from 'react';
import { checkPin, unlock } from '../lib/auth';
import { Icon } from './Icon';

/** Numeric keypad gate. Used to enter parent mode and to resume/leave a child session. */
/**
 * mode='unlock' opens the parent area. mode='verify' only confirms a grown-up is present
 * (e.g. resuming a child session) and leaves the parent area locked.
 */
export function PinGate({ title = 'Grown-ups only', subtitle = 'Enter your parent PIN', onUnlock, onCancel, tone = 'light', mode = 'unlock' }: { title?: string; subtitle?: string; onUnlock: () => void; onCancel?: () => void; tone?: 'light' | 'dark'; mode?: 'unlock' | 'verify' }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value = pin) {
    if (value.length < 4 || busy) return;
    setBusy(true);
    const r = mode === 'unlock' ? await unlock(value) : await checkPin(value);
    setBusy(false);
    if (r.ok) return onUnlock();
    setPin('');
    setMsg(r.reason === 'locked_out' ? `Too many tries. Wait ${Math.ceil((r.retryInMs ?? 0) / 1000)} seconds.` : r.reason === 'no_pin' ? 'No PIN is set up yet.' : 'That PIN didn’t match.');
  }

  const press = (d: string) => {
    setMsg(null);
    setPin((p) => (p.length < 8 ? p + d : p));
  };

  return (
    <div className={`pin-gate pin-${tone}`} role="dialog" aria-modal="true" aria-labelledby="pin-title">
      <Icon name="lock" size={28} />
      <h2 id="pin-title">{title}</h2>
      <p>{subtitle}</p>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="sr-only" htmlFor="pin-input">Parent PIN</label>
        <input id="pin-input" className="pin-display" type="password" inputMode="numeric" autoComplete="off" pattern="\d*" maxLength={8} value={pin}
          onChange={(e) => { setMsg(null); setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); }} aria-describedby="pin-msg" />
        <div className="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button type="button" key={d} onClick={() => press(d)} aria-label={`Digit ${d}`}>{d}</button>
          ))}
          <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete last digit">⌫</button>
          <button type="button" onClick={() => press('0')} aria-label="Digit 0">0</button>
          <button type="submit" className="pin-go" aria-label="Unlock" disabled={pin.length < 4 || busy}><Icon name="check" /></button>
        </div>
      </form>
      <p id="pin-msg" className="pin-msg" role="status" aria-live="polite">{msg}</p>
      {onCancel && <button type="button" className="link-btn" onClick={onCancel}>Cancel</button>}
    </div>
  );
}
