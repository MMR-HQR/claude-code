import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, type Memory, type Profile } from '../lib/db';
import { getHomeFamily, listMemories, listProfiles } from '../lib/journal';

export function Journal() {
  const [familyId, setFamilyId] = useState<string>();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [items, setItems] = useState<Array<Memory & { turnCount: number; childCount: number }>>([]);
  const [q, setQ] = useState('');
  const [pid, setPid] = useState('');

  useEffect(() => {
    void (async () => {
      const f = await getHomeFamily();
      if (!f) return;
      setFamilyId(f.id);
      setProfiles(await listProfiles(f.id));
    })();
  }, []);

  useEffect(() => {
    if (!familyId) return;
    let live = true;
    void (async () => {
      const mems = await listMemories(familyId, { status: 'kept', profileId: pid || undefined, query: q });
      const withCounts = await Promise.all(mems.map(async (m) => {
        const t = await db.turns.where('memoryId').equals(m.id).toArray();
        return { ...m, turnCount: t.filter((x) => x.kind !== 'intro').length, childCount: t.filter((x) => x.speaker === 'child').length };
      }));
      if (live) setItems(withCounts);
    })();
    return () => { live = false; };
  }, [familyId, q, pid]);

  const name = (id: string) => profiles.find((p) => p.id === id)?.displayName ?? 'Explorer';
  return (
    <div className="stack">
      <h1>Family journal</h1>
      <div className="filters">
        <label className="grow"><span className="sr-only">Search</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions, notes, topics…" />
        </label>
        <label><span className="sr-only">Explorer</span>
          <select value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Filter by explorer">
            <option value="">Everyone</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
        </label>
      </div>
      {items.length === 0 && <p className="empty">{q || pid ? 'Nothing matches yet.' : 'No kept memories yet. Start a wondering session, then choose “Keep” at the end.'}</p>}
      <ul className="memory-grid">
        {items.map((m) => (
          <li key={m.id}>
            <Link to={`/parent/journal/${m.id}`} className="memory-card">
              <span className="date">{new Date(m.occurredAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <strong>{m.title}</strong>
              <span className="muted">{name(m.profileId)} · {m.childCount} of their own {m.childCount === 1 ? 'recording' : 'recordings'} · {m.turnCount} turns</span>
              <span className="tags">{m.synthetic && <em className="tag synth">synthetic</em>}{m.topics.map((t) => <em key={t} className="tag">{t}</em>)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
