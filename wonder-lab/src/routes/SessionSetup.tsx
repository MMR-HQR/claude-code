import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Family, Profile, QuestionSource } from '../lib/db';
import { getHomeFamily, listProfiles, startSession } from '../lib/journal';
import { lockParent } from '../lib/auth';
import { speech } from '../features/wonder/speech';
import { Icon } from '../components/Icon';

export function SessionSetup() {
  const nav = useNavigate();
  const [family, setFamily] = useState<Family>();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState('');
  const [mode, setMode] = useState<QuestionSource>('demo_script');
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const f = await getHomeFamily();
      if (!f) return;
      setFamily(f);
      const ps = await listProfiles(f.id);
      setProfiles(ps);
      setProfileId(ps.find((p) => !p.displayName.includes('(synthetic)'))?.id ?? ps[0]?.id ?? '');
    })();
  }, []);

  async function start() {
    if (!family || !profileId) return;
    if (!consent) return setErr('Please confirm the recording choice first.');
    speech.prime(); // must happen inside this tap for iPad speech to work later
    try {
      const s = await startSession({ familyId: family.id, profileId, questionSource: mode, audioConsent: consent });
      lockParent(); // the child room never carries parent privileges
      nav(`/wonder/${s.id}`, { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="stack narrow">
      <h1>Start a wondering session</h1>
      <section className="card">
        <h2>Who’s exploring?</h2>
        <div className="choice-row" role="radiogroup" aria-label="Explorer">
          {profiles.map((p) => (
            <label key={p.id} className={`choice ${profileId === p.id ? 'on' : ''}`}>
              <input type="radio" name="profile" value={p.id} checked={profileId === p.id} onChange={() => setProfileId(p.id)} />
              <strong>{p.displayName}</strong><span>age {p.ageBand}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>How should Tinkadoo know what they asked?</h2>
        <p className="muted">This build has no speech recognition: sending a child’s voice to a transcription service is switched off until provider and privacy checks are done.</p>
        <div className="choice-col" role="radiogroup" aria-label="Question source">
          <label className={`choice wide ${mode === 'demo_script' ? 'on' : ''}`}>
            <input type="radio" name="mode" checked={mode === 'demo_script'} onChange={() => setMode('demo_script')} />
            <strong>Practice script: the cheek eye</strong>
            <span>Each recording is paired with the next scripted line (eyes moving → two eyes → a third eye on the cheek → it blinks by itself with no eyelashes). Labelled as scripted everywhere.</span>
          </label>
          <label className={`choice wide ${mode === 'parent_typed' ? 'on' : ''}`}>
            <input type="radio" name="mode" checked={mode === 'parent_typed'} onChange={() => setMode('parent_typed')} />
            <strong>I’ll type what they asked</strong>
            <span>After each recording, a small grown-up box asks you to type their question. Practice replies only cover eyes; anything else gets an honest “let’s explore that together.”</span>
          </label>
        </div>
      </section>
      <section className="card">
        <label className="check big">
          <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErr(null); }} />
          <span>Record my child’s voice on this device during this session. At the end I’ll choose whether to keep it in the journal or delete it.</span>
        </label>
        <p className="fine">Policy version local-dev-0.1 · recorded as a consent entry on this device.</p>
      </section>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="btn-row">
        <button className="primary-btn big" onClick={start} disabled={!profileId}><Icon name="mic" /> Start wondering</button>
        <button className="ghost-btn" onClick={() => nav('/parent')}>Back</button>
      </div>
      <p className="fine">Starting locks the parent area. You’ll need your PIN to resume after a pause or to leave the session. On iPad, Guided Access adds an extra lock.</p>
    </div>
  );
}
