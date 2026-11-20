/**
 * Local repository. Every write that matters happens inside an IndexedDB
 * transaction so a recording and its metadata land together or not at all.
 */
import { db, type AgeBand, type Family, type MediaAsset, type Memory, type Profile, type QuestionSource, type Reflection, type Speaker, type TextSource, type TranscriptVersion, type Turn, type WonderSession } from './db';
import { uuid, nowIso } from './ids';
import { sha256Hex } from './hash';
import { extensionForMime, MAX_RECORDING_BYTES } from './media';

export const POLICY_VERSION = 'local-dev-0.1';
export const SESSION_IDLE_MS = 10 * 60 * 1000;

export async function audit(familyId: string, action: string, targetType: string, targetId: string) {
  await db.audit.add({ id: uuid(), familyId, action, targetType, targetId, createdAt: nowIso() });
}

/** The single home family on this device (imported test families are excluded). */
export async function getHomeFamily(): Promise<Family | undefined> {
  const all = await db.families.toArray();
  return all.find((f) => !f.isolatedImport);
}

export async function createFamily(name: string): Promise<Family> {
  const fam: Family = { id: uuid(), name: name.trim() || 'Our family', createdAt: nowIso() };
  await db.families.add(fam);
  await audit(fam.id, 'family.created', 'family', fam.id);
  return fam;
}

export async function addProfile(familyId: string, displayName: string, ageBand: AgeBand): Promise<Profile> {
  const nick = displayName.trim();
  if (!nick) throw new Error('A nickname is required');
  if (nick.length > 40) throw new Error('Keep the nickname under 40 characters');
  const p: Profile = { id: uuid(), familyId, displayName: nick, ageBand, subjectKind: ageBand === 'adult' ? 'adult' : 'child', theme: 'dusk', createdAt: nowIso() };
  await db.profiles.add(p);
  await audit(familyId, 'profile.created', 'profile', p.id);
  return p;
}

export async function listProfiles(familyId: string): Promise<Profile[]> {
  return (await db.profiles.where('familyId').equals(familyId).toArray()).filter((p) => !p.archivedAt);
}

// ---------------------------------------------------------------- sessions

export async function startSession(opts: { familyId: string; profileId: string; questionSource: QuestionSource; audioConsent: boolean }): Promise<WonderSession> {
  if (!opts.audioConsent) throw new Error('Recording consent is required to start a session');
  const profile = await db.profiles.get(opts.profileId);
  if (!profile || profile.familyId !== opts.familyId) throw new Error('Profile not in this family');
  const t = nowIso();
  const memoryId = uuid();
  const session: WonderSession = {
    id: uuid(), familyId: opts.familyId, profileId: opts.profileId, memoryId,
    status: 'active', aiMode: 'mock', questionSource: opts.questionSource,
    createdAt: t, lastActivityAt: t, expiresAt: new Date(Date.now() + SESSION_IDLE_MS).toISOString(),
  };
  const memory: Memory = {
    id: memoryId, familyId: opts.familyId, profileId: opts.profileId, sessionId: session.id, kind: 'wonder_thread',
    title: 'Untitled wonder', occurredAt: t, status: 'draft', topics: [], syncState: 'local_only', createdAt: t, updatedAt: t,
  };
  await db.transaction('rw', db.sessions, db.memories, db.consents, async () => {
    await db.consents.add({ id: uuid(), familyId: opts.familyId, profileId: opts.profileId, purpose: 'audio_preservation', consentMethod: 'parent_pin_checkbox', policyVersion: POLICY_VERSION, grantedAt: t });
    await db.memories.add(memory);
    await db.sessions.add(session);
  });
  await audit(opts.familyId, 'session.started', 'session', session.id);
  return session;
}

/** Returns the session with idle expiry applied (and persisted). */
export async function getLiveSession(id: string, now = Date.now()): Promise<WonderSession | undefined> {
  const s = await db.sessions.get(id);
  if (!s) return undefined;
  if ((s.status === 'active' || s.status === 'paused') && Date.parse(s.expiresAt) <= now) {
    await db.sessions.update(id, { status: 'expired', endedAt: new Date(now).toISOString() });
    await audit(s.familyId, 'session.expired', 'session', id);
    return { ...s, status: 'expired' };
  }
  return s;
}

export async function touchSession(id: string, now = Date.now()) {
  const s = await getLiveSession(id, now);
  if (!s || s.status !== 'active') return;
  await db.sessions.update(id, { lastActivityAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_IDLE_MS).toISOString() });
}

export async function setSessionStatus(id: string, status: 'active' | 'paused' | 'ended') {
  const s = await getLiveSession(id);
  if (!s) throw new Error('No such session');
  if (s.status === 'ended' || s.status === 'expired') throw new Error('Session is over');
  const now = Date.now();
  await db.sessions.update(id, {
    status,
    ...(status === 'ended' ? { endedAt: new Date(now).toISOString() } : {}),
    ...(status === 'active' ? { lastActivityAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_IDLE_MS).toISOString() } : {}),
  });
  await audit(s.familyId, `session.${status === 'active' ? 'resumed' : status}`, 'session', id);
}

// ---------------------------------------------------------------- turns & media

async function nextTurnIndex(memoryId: string): Promise<number> {
  const last = await db.turns.where('[memoryId+turnIndex]').between([memoryId, -Infinity], [memoryId, Infinity]).last();
  return last ? last.turnIndex + 1 : 0;
}

export interface RecordingInput { bytes: ArrayBuffer; mimeType: string; durationMs: number }

/**
 * Commit raw audio to IndexedDB the moment recording stops — before review,
 * before any "AI" step. State is 'draft' until the child (or parent) sends it.
 */
export async function saveDraftRecording(ctx: { familyId: string; profileId: string; memoryId: string }, rec: RecordingInput, kind: MediaAsset['kind'] = 'child_audio'): Promise<MediaAsset> {
  if (rec.bytes.byteLength === 0) throw new Error('The recording was empty');
  if (rec.bytes.byteLength > MAX_RECORDING_BYTES) throw new Error(`Recording is larger than the ${Math.round(MAX_RECORDING_BYTES / 1048576)} MB limit`);
  const asset: MediaAsset = {
    id: uuid(), familyId: ctx.familyId, profileId: ctx.profileId, memoryId: ctx.memoryId, turnId: null, kind,
    mimeType: rec.mimeType, ext: extensionForMime(rec.mimeType), byteCount: rec.bytes.byteLength,
    sha256: await sha256Hex(rec.bytes), durationMs: Math.round(rec.durationMs), capturedAt: nowIso(), state: 'draft', bytes: rec.bytes,
  };
  await db.media.add(asset);
  return asset;
}

export async function discardDraftRecording(assetId: string) {
  const a = await db.media.get(assetId);
  if (!a) return;
  if (a.state !== 'draft' || a.turnId) throw new Error('Only unsent drafts can be discarded here');
  await db.media.delete(assetId);
}

export interface AppendTurnInput {
  memoryId: string; speaker: Speaker; speakerLabel: string; kind: Turn['kind'];
  originalText: string | null; textSource: TextSource; replyToTurnId?: string; meta?: Turn['meta']; audioAssetId?: string;
}

/** Append a turn (and attach its audio) atomically. Turn order is assigned inside the transaction. */
export async function appendTurn(input: AppendTurnInput): Promise<Turn> {
  return db.transaction('rw', db.turns, db.media, db.memories, async () => {
    const mem = await db.memories.get(input.memoryId);
    if (!mem) throw new Error('No such memory');
    const turn: Turn = {
      id: uuid(), familyId: mem.familyId, sessionId: mem.sessionId, memoryId: mem.id, turnIndex: await nextTurnIndex(mem.id),
      speaker: input.speaker, speakerLabel: input.speakerLabel, kind: input.kind, originalText: input.originalText,
      textSource: input.textSource, replyToTurnId: input.replyToTurnId, highlighted: false, meta: input.meta, createdAt: nowIso(),
    };
    await db.turns.add(turn);
    if (input.audioAssetId) {
      const a = await db.media.get(input.audioAssetId);
      if (!a || a.familyId !== mem.familyId) throw new Error('Audio not found in this family');
      await db.media.update(a.id, { turnId: turn.id, memoryId: mem.id, state: 'final' });
    }
    await db.memories.update(mem.id, { updatedAt: nowIso() });
    return turn;
  });
}

// ---------------------------------------------------------------- journal

export interface Thread {
  memory: Memory; profile?: Profile; turns: Turn[]; media: MediaAsset[];
  transcripts: TranscriptVersion[]; reflections: Reflection[];
}

export async function getThread(memoryId: string): Promise<Thread | undefined> {
  const memory = await db.memories.get(memoryId);
  if (!memory) return undefined;
  const [profile, turns, media, reflections] = await Promise.all([
    db.profiles.get(memory.profileId),
    db.turns.where('memoryId').equals(memoryId).sortBy('turnIndex'),
    db.media.where('memoryId').equals(memoryId).toArray(),
    db.reflections.where('memoryId').equals(memoryId).sortBy('createdAt'),
  ]);
  const transcripts = turns.length ? await db.transcripts.where('turnId').anyOf(turns.map((t) => t.id)).toArray() : [];
  return { memory, profile, turns, media, transcripts, reflections };
}

export function currentText(turn: Turn, transcripts: TranscriptVersion[]): { text: string | null; corrected: boolean; version: number } {
  const versions = transcripts.filter((v) => v.turnId === turn.id).sort((a, b) => b.version - a.version);
  if (versions.length) return { text: versions[0].content, corrected: true, version: versions[0].version };
  return { text: turn.originalText, corrected: false, version: 0 };
}

export function deriveTitle(turns: Turn[]): string {
  const first = turns.find((t) => t.speaker === 'child' && t.kind === 'question' && t.originalText);
  if (!first?.originalText) return 'A wonder';
  const t = first.originalText.trim().replace(/\s+/g, ' ');
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

export async function keepMemory(memoryId: string, title?: string) {
  const th = await getThread(memoryId);
  if (!th) throw new Error('No such memory');
  await db.memories.update(memoryId, { status: 'kept', title: (title ?? '').trim() || deriveTitle(th.turns), updatedAt: nowIso() });
  await audit(th.memory.familyId, 'memory.kept', 'memory', memoryId);
}

/** Parent declined to keep: nothing enters the journal, and the drafts are deleted. */
export async function discardMemory(memoryId: string) {
  const mem = await db.memories.get(memoryId);
  if (!mem) return;
  await db.transaction('rw', [db.memories, db.turns, db.media, db.transcripts, db.reflections, db.links], async () => {
    const turnIds = (await db.turns.where('memoryId').equals(memoryId).primaryKeys()) as string[];
    await db.transcripts.where('turnId').anyOf(turnIds).delete();
    await db.turns.where('memoryId').equals(memoryId).delete();
    await db.media.where('memoryId').equals(memoryId).delete();
    await db.reflections.where('memoryId').equals(memoryId).delete();
    await db.links.where('sourceMemoryId').equals(memoryId).delete();
    await db.links.where('targetMemoryId').equals(memoryId).delete();
    await db.memories.delete(memoryId);
  });
  await audit(mem.familyId, 'memory.discarded', 'memory', memoryId);
}

export async function listMemories(familyId: string, opts: { status?: Memory['status']; profileId?: string; query?: string } = {}) {
  let mems = await db.memories.where('familyId').equals(familyId).toArray();
  if (opts.status) mems = mems.filter((m) => m.status === opts.status);
  if (opts.profileId) mems = mems.filter((m) => m.profileId === opts.profileId);
  const q = opts.query?.trim().toLowerCase();
  if (q) {
    const hits = new Set<string>();
    for (const m of mems) {
      if (m.title.toLowerCase().includes(q) || m.topics.some((t) => t.toLowerCase().includes(q))) hits.add(m.id);
    }
    const ids = mems.map((m) => m.id);
    const [turns, refl] = await Promise.all([db.turns.where('memoryId').anyOf(ids).toArray(), db.reflections.where('memoryId').anyOf(ids).toArray()]);
    const tv = turns.length ? await db.transcripts.where('turnId').anyOf(turns.map((t) => t.id)).toArray() : [];
    const turnMem = new Map(turns.map((t) => [t.id, t.memoryId]));
    turns.forEach((t) => t.originalText?.toLowerCase().includes(q) && hits.add(t.memoryId));
    tv.forEach((v) => v.content.toLowerCase().includes(q) && hits.add(turnMem.get(v.turnId)!));
    refl.forEach((r) => r.text.toLowerCase().includes(q) && hits.add(r.memoryId));
    mems = mems.filter((m) => hits.has(m.id));
  }
  return mems.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function addReflection(memoryId: string, text: string): Promise<Reflection> {
  const mem = await db.memories.get(memoryId);
  if (!mem) throw new Error('No such memory');
  const r: Reflection = { id: uuid(), familyId: mem.familyId, memoryId, text: text.trim(), createdAt: nowIso() };
  if (!r.text) throw new Error('Note is empty');
  await db.reflections.add(r);
  return r;
}

export async function setHighlight(turnId: string, highlighted: boolean) {
  await db.turns.update(turnId, { highlighted });
}

export async function reviewTurn(turnId: string, review: 'approved' | 'rejected') {
  await db.turns.update(turnId, { review });
}

/** Corrections are append-only versions. The original text and audio are never touched. */
export async function correctTranscript(turnId: string, content: string): Promise<TranscriptVersion> {
  const turn = await db.turns.get(turnId);
  if (!turn) throw new Error('No such turn');
  const prior = await db.transcripts.where('turnId').equals(turnId).toArray();
  const v: TranscriptVersion = { id: uuid(), familyId: turn.familyId, turnId, content: content.trim(), source: 'human', version: prior.length + 1, createdAt: nowIso() };
  await db.transcripts.add(v);
  return v;
}

export async function setTopics(memoryId: string, topics: string[]) {
  const clean = [...new Set(topics.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  await db.memories.update(memoryId, { topics: clean, updatedAt: nowIso() });
}

export async function setTitle(memoryId: string, title: string) {
  await db.memories.update(memoryId, { title: title.trim() || 'A wonder', updatedAt: nowIso() });
}

export async function linkMemories(sourceMemoryId: string, targetMemoryId: string, relation: 'follow_up' | 'revisited' | 'related' = 'related') {
  const [a, b] = await Promise.all([db.memories.get(sourceMemoryId), db.memories.get(targetMemoryId)]);
  if (!a || !b) throw new Error('No such memory');
  if (a.familyId !== b.familyId) throw new Error('Cannot link memories across families');
  if (a.id === b.id) throw new Error('Cannot link a memory to itself');
  await db.links.add({ id: uuid(), familyId: a.familyId, sourceMemoryId: a.id, targetMemoryId: b.id, relation });
}

export async function linkedMemories(memoryId: string): Promise<Memory[]> {
  const [out, inc] = await Promise.all([db.links.where('sourceMemoryId').equals(memoryId).toArray(), db.links.where('targetMemoryId').equals(memoryId).toArray()]);
  const ids = [...new Set([...out.map((l) => l.targetMemoryId), ...inc.map((l) => l.sourceMemoryId)])];
  return (await db.memories.bulkGet(ids)).filter((m): m is Memory => !!m);
}
