import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hasPin, isPinValid, setPin, unlock } from '../lib/auth';
import { addProfile, createFamily, getHomeFamily } from '../lib/journal';
import { seedSyntheticFamilyThread } from '../lib/synthetic';
import type { AgeBand } from '../lib/db';
import { PinGate } from '../components/PinGate';

export function Landing() {
  const nav = useNavigate();
  const [state, setState] = useState<'loading' | 'setup' | 'unlock'>('loading');
  useEffect(() => {
    void (async () => setState((await getHomeFamily()) && (await hasPin()) ? 'unlock' : 'setup'))();
  }, []);

  return (
    <div className="landing">
      <div className="landing-sky" aria-hidden />
      <div className="landing-card">
        <p className="eyebrow">A House of Quiet Rage project</p>
        <h1 className="display">Wonder Lab</h1>
        <p className="tagline">A place to wonder. A lifetime to remember.</p>
        {state === 'setup' && <Setup onDone={() => nav('/parent')} />}
        {state === 'unlock' && <PinGate title="Welcome back" subtitle="Enter your parent PIN to open the family space" onUnlock={() => nav('/parent')} />}
        <p className="fine"><Link to="/privacy">How Wonder Lab handles your family’s data</Link></p>
      </div>
    </div>
  );
}

function Setup({ onDone }: { onDone: () => void }) {
  const [familyName, setFamilyName] = useState('');
  const [nick, setNick] = useState('');
  const [age, setAge] = useState<AgeBand>('5-6');
  const [pin, setPinV] = useState('');
  const [pin2, setPin2] = useState('');
  const [seed, setSeed] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isPinValid(pin)) return setErr('Choose a PIN of 4 to 8 digits.');
    if (pin !== pin2) return setErr('The two PINs don’t match.');
    if (!nick.trim()) return setErr('Add a nickname for your explorer.');
    setBusy(true);
    try {
      const fam = (await getHomeFamily()) ?? (await createFamily(familyName));
      await setPin(pin);
      await addProfile(fam.id, nick, age);
      if (seed) await seedSyntheticFamilyThread(fam.id);
      await unlock(pin);
      onDone();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="setup" onSubmit={submit}>
      <h2>Set up your family space</h2>
      <p className="muted">Everything stays on this device. Nothing is uploaded, and live AI is switched off.</p>
      <label>Family name <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="The Rivera household" autoComplete="off" /></label>
      <div className="row">
        <label>Explorer’s nickname <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Nickname, not full name" autoComplete="off" required /></label>
        <label>Age band
          <select value={age} onChange={(e) => setAge(e.target.value as AgeBand)}>
            <option value="3-4">3–4</option><option value="5-6">5–6</option><option value="7-9">7–9</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label>Parent PIN <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPinV(e.target.value.replace(/\D/g, '').slice(0, 8))} autoComplete="new-password" aria-describedby="pin-help" /></label>
        <label>Repeat PIN <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 8))} autoComplete="new-password" /></label>
      </div>
      <p id="pin-help" className="fine">The PIN keeps the journal, settings and exports away from little hands. It protects this device only.</p>
      <label className="check"><input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} /> Add a synthetic demo conversation (tones, not real voices)</label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="primary-btn" disabled={busy}>Create family space</button>
    </form>
  );
}
