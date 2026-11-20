import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AgeBand, Family, Memory, Profile } from '../lib/db';
import { addProfile, getHomeFamily, listMemories, listProfiles } from '../lib/journal';
import { seedSyntheticFamilyThread } from '../lib/synthetic';
import { formatBytes, requestPersistence, storageStatus } from '../lib/storage';
import { Icon } from '../components/Icon';

export function ParentHome() {
  const [family, setFamily] = useState<Family>();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drafts, setDrafts] = useState<Memory[]>([]);
  const [kept, setKept] = useState(0);
  const [store, setStore] = useState<Awaited<ReturnType<typeof storageStatus>>>();
  const [nick, setNick] = useState('');
  const [age, setAge] = useState<AgeBand>('5-6');

  const load = useCallback(async () => {
    const f = await getHomeFamily();
    if (!f) return;
    setFamily(f);
    setProfiles(await listProfiles(f.id));
    setDrafts(await listMemories(f.id, { status: 'draft' }));
    setKept((await listMemories(f.id, { status: 'kept' })).length);
    setStore(await storageStatus());
  }, []);
  useEffect(() => void load(), [load]);

  if (!family) return null;
  const name = (id: string) => profiles.find((p) => p.id === id)?.displayName ?? 'Explorer';

  return (
    <div className="stack">
      <section className="hero-card">
        <div>
          <p className="eyebrow">{family.name}</p>
          <h1>Ready when they are.</h1>
          <p className="muted">Start a supervised session, hand over the iPad, and stay close. You can pause, answer yourself, or end at any time.</p>
        </div>
        <Link to="/parent/session" className="primary-btn big"><Icon name="mic" /> Start wondering</Link>
      </section>

      <div className="practice-banner" role="note">
        <strong>Practice mode.</strong> Replies are pre-written examples, not a live AI. No recording or words leave this device.
      </div>

      {drafts.length > 0 && (
        <section className="card">
          <h2>Waiting for your decision</h2>
          <p className="muted">These sessions are saved on this device but not in the journal. Keep them or let them go.</p>
          <ul className="list">
            {drafts.map((m) => (
              <li key={m.id}><Link to={`/parent/journal/${m.id}`}>{name(m.profileId)} · {new Date(m.occurredAt).toLocaleString()}</Link></li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid-2">
        <section className="card">
          <h2>Explorers</h2>
          <ul className="list">
            {profiles.map((p) => <li key={p.id}><strong>{p.displayName}</strong> <span className="muted">age {p.ageBand}</span></li>)}
          </ul>
          <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (!nick.trim()) return; await addProfile(family.id, nick, age); setNick(''); void load(); }}>
            <label className="sr-only" htmlFor="new-nick">Nickname</label>
            <input id="new-nick" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Add an explorer (nickname)" />
            <label className="sr-only" htmlFor="new-age">Age band</label>
            <select id="new-age" value={age} onChange={(e) => setAge(e.target.value as AgeBand)}>
              <option value="3-4">3–4</option><option value="5-6">5–6</option><option value="7-9">7–9</option>
            </select>
            <button className="secondary-btn">Add</button>
          </form>
        </section>

        <section className="card">
          <h2>Where things are kept</h2>
          <p><strong>{kept}</strong> kept {kept === 1 ? 'memory' : 'memories'} · {formatBytes(store?.usage)} used</p>
          <p className="status-line warn"><span className="dot" aria-hidden /> Saved on this device only · not uploaded · not backed up</p>
          <p className="muted">Browsers can clear stored data. Export an archive regularly, especially before a flight or an iPad update.</p>
          <p className="muted">Storage protection: {store?.persisted === true ? 'granted by the browser' : store?.persisted === false ? 'not granted' : 'unknown on this browser'}</p>
          <div className="btn-row">
            <Link className="secondary-btn" to="/parent/archive">Export archive</Link>
            {store?.persisted === false && <button className="ghost-btn" onClick={async () => { await requestPersistence(); void load(); }}>Ask browser to protect storage</button>}
          </div>
        </section>
      </div>

      <section className="card subtle">
        <h2>Development data</h2>
        <p className="muted">Add another synthetic cheek-eye conversation for testing the journal and export. Synthetic items are labelled everywhere.</p>
        <button className="ghost-btn" onClick={async () => { await seedSyntheticFamilyThread(family.id); void load(); }}>Add synthetic demo thread</button>
      </section>
    </div>
  );
}
