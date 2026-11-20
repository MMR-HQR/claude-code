import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, type Memory, type Turn } from '../lib/db';
import { addReflection, correctTranscript, currentText, deriveTitle, discardMemory, getThread, keepMemory, linkedMemories, linkMemories, listMemories, setHighlight, setTitle, setTopics, type Thread } from '../lib/journal';
import { exportFamily } from '../lib/familyArchive';
import { downloadBytes } from '../lib/storage';
import { SOURCE_LABEL } from '../lib/archive';
import { AudioClip } from '../components/AudioClip';
import { Icon } from '../components/Icon';

export function MemoryDetail() {
  const { memoryId = '' } = useParams();
  const nav = useNavigate();
  const [th, setTh] = useState<Thread>();
  const [missing, setMissing] = useState(false);
  const [title, setTitleV] = useState('');
  const [note, setNote] = useState('');
  const [topics, setTopicsV] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [related, setRelated] = useState<Memory[]>([]);
  const [others, setOthers] = useState<Memory[]>([]);
  const [linkTo, setLinkTo] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const load = useCallback(async () => {
    const t = await getThread(memoryId);
    if (!t) return setMissing(true);
    setTh(t);
    setTitleV(t.memory.status === 'draft' ? deriveTitle(t.turns) : t.memory.title);
    setTopicsV(t.memory.topics.join(', '));
    setRelated(await linkedMemories(memoryId));
    setOthers((await listMemories(t.memory.familyId, { status: 'kept' })).filter((m) => m.id !== memoryId));
  }, [memoryId]);
  useEffect(() => void load(), [load]);

  if (missing) return <div className="stack"><p className="empty">That memory isn’t here (it may have been discarded).</p><Link to="/parent/journal">Back to journal</Link></div>;
  if (!th) return null;
  const { memory, turns, media, transcripts, reflections, profile } = th;
  const isDraft = memory.status === 'draft';
  const conv = turns.filter((t) => t.kind !== 'intro');
  const own = turns.filter((t) => t.speaker === 'child');
  const mediaFor = (t: Turn) => media.filter((m) => m.turnId === t.id);
  const unsent = media.filter((m) => !m.turnId);

  return (
    <div className="stack thread">
      <Link to="/parent/journal" className="back">← Journal</Link>

      {isDraft && (
        <section className="decision" aria-label="Keep or let go">
          <h2>Keep this Wonder Thread?</h2>
          <p>It’s saved on this device only and isn’t in the journal yet. Nothing is uploaded either way.</p>
          <label>Title <input value={title} onChange={(e) => setTitleV(e.target.value)} /></label>
          <div className="btn-row">
            <button className="primary-btn" onClick={async () => { await keepMemory(memory.id, title); void load(); }}><Icon name="book" size={18} /> Keep in journal</button>
            {!confirmDiscard
              ? <button className="ghost-btn danger" onClick={() => setConfirmDiscard(true)}>Don’t keep</button>
              : <button className="ghost-btn danger" onClick={async () => { await discardMemory(memory.id); nav('/parent', { replace: true }); }}>Delete all {own.length} recordings for good</button>}
          </div>
        </section>
      )}

      <header className="thread-head">
        <p className="eyebrow">{new Date(memory.occurredAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })} · {profile?.displayName}{memory.synthetic ? ' · synthetic demo data' : ''}</p>
        {isDraft ? <h1>{title || 'A wonder'}</h1> : (
          <h1><input className="title-input" aria-label="Title" value={title} onChange={(e) => setTitleV(e.target.value)} onBlur={() => setTitle(memory.id, title)} /></h1>
        )}
        <p className="status-line warn"><span className="dot" aria-hidden /> On this device only · not backed up</p>
      </header>

      <section className="card own-words">
        <h2>In their own words</h2>
        <p className="muted">Only the child’s recordings, in order. These are the originals.</p>
        <ol>
          {own.map((t) => {
            const ct = currentText(t, transcripts);
            return (
              <li key={t.id}>
                <span className="who">{t.kind === 'guess' ? 'Their idea' : 'Their question'}</span>
                <p className="quote">{ct.text ? `“${ct.text}”` : <em>No words written down — listen to the recording.</em>}</p>
                {mediaFor(t).map((a) => <AudioClip key={a.id} asset={a} label={`${t.speakerLabel}, turn ${t.turnIndex + 1}`} />)}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card">
        <h2>What we explored</h2>
        <ol className="turns">
          {conv.map((t) => {
            const ct = currentText(t, transcripts);
            return (
              <li key={t.id} className={`turn turn-${t.speaker} ${t.highlighted ? 'hl' : ''}`} data-testid="turn">
                <div className="turn-head">
                  <span className="turn-n">{t.turnIndex}</span>
                  <strong>{t.speakerLabel}</strong>
                  <span className="badge">{SOURCE_LABEL[t.textSource]}</span>
                  {t.meta?.guardrail && <span className="badge warn">safety rule: {t.meta.guardrail}</span>}
                  {t.meta?.needsAdult && <span className="badge warn">asked for a grown-up</span>}
                  {t.review === 'rejected' && <span className="badge warn">you marked “not right”</span>}
                  <button className={`icon-btn star ${t.highlighted ? 'on' : ''}`} aria-pressed={t.highlighted} aria-label={t.highlighted ? 'Remove from kept moments' : 'Keep this moment'} title="Keep this moment" onClick={async () => { await setHighlight(t.id, !t.highlighted); void load(); }}>
                    <Icon name="star" size={20} />
                  </button>
                </div>
                <p className="turn-text">{t.originalText ?? <em>(no text)</em>}</p>
                {ct.corrected && <p className="corrected">Corrected (v{ct.version}): {ct.text}</p>}
                {mediaFor(t).map((a) => <AudioClip key={a.id} asset={a} label={`${t.speakerLabel}, turn ${t.turnIndex + 1}`} />)}
                {t.speaker !== 'ai' && (editing === t.id ? (
                  <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (editText.trim()) await correctTranscript(t.id, editText); setEditing(null); void load(); }}>
                    <input aria-label="Corrected words" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                    <button className="secondary-btn">Save correction</button>
                    <button type="button" className="ghost-btn" onClick={() => setEditing(null)}>Cancel</button>
                  </form>
                ) : (
                  <button className="link-btn" onClick={() => { setEditing(t.id); setEditText(ct.text ?? ''); }}>{t.originalText ? 'Correct the words' : 'Write down what they said'}</button>
                ))}
              </li>
            );
          })}
        </ol>
        <p className="fine">Corrections are saved as new versions. The original words and recordings never change.</p>
      </section>

      {unsent.length > 0 && (
        <section className="card">
          <h2>Recovered recordings</h2>
          <p className="muted">Captured but never sent (for example the app was closed mid-question). They are part of this session’s drafts.</p>
          {unsent.map((a) => <AudioClip key={a.id} asset={a} label="Recovered recording" />)}
        </section>
      )}

      <section className="card">
        <h2>Grown-up reflections</h2>
        <ul className="notes">
          {reflections.map((r) => <li key={r.id}><p>{r.text}</p><small>{new Date(r.createdAt).toLocaleString()}</small></li>)}
        </ul>
        <form className="stack-sm" onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await addReflection(memory.id, note); setNote(''); void load(); }}>
          <label htmlFor="note" className="sr-only">Add a note</label>
          <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you noticed, what happened next, where it came from…" />
          <button className="secondary-btn">Add note</button>
        </form>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Topics</h2>
          <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); await setTopics(memory.id, topics.split(',')); void load(); }}>
            <label htmlFor="topics" className="sr-only">Topics, comma separated</label>
            <input id="topics" value={topics} onChange={(e) => setTopicsV(e.target.value)} placeholder="eyes, pretend, animals" />
            <button className="secondary-btn">Save</button>
          </form>
        </section>
        <section className="card">
          <h2>Related wonders</h2>
          <ul className="list">{related.map((m) => <li key={m.id}><Link to={`/parent/journal/${m.id}`}>{m.title}</Link></li>)}</ul>
          {others.length > 0 && (
            <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (!linkTo) return; await linkMemories(memory.id, linkTo); setLinkTo(''); void load(); }}>
              <label htmlFor="link" className="sr-only">Link to another memory</label>
              <select id="link" value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
                <option value="">Link to…</option>
                {others.filter((o) => !related.some((r) => r.id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
              <button className="secondary-btn">Link</button>
            </form>
          )}
        </section>
      </div>

      {!isDraft && (
        <div className="btn-row">
          <button className="secondary-btn" onClick={async () => { const r = await exportFamily(memory.familyId, { memoryIds: [memory.id] }); downloadBytes(r.zip, r.filename.replace('Family-Export', 'Memory-Export'), 'application/zip'); }}>
            <Icon name="download" size={18} /> Export this memory (.zip)
          </button>
        </div>
      )}
      <MediaCount memoryId={memory.id} />
    </div>
  );
}

function MediaCount({ memoryId }: { memoryId: string }) {
  const [n, setN] = useState<number>();
  useEffect(() => void db.media.where('memoryId').equals(memoryId).count().then(setN), [memoryId]);
  return n === undefined ? null : <p className="fine">{n} original {n === 1 ? 'recording' : 'recordings'} stored for this thread.</p>;
}
