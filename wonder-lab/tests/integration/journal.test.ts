import { db } from '../../src/lib/db';
import {
  appendTurn, correctTranscript, currentText, discardDraftRecording, discardMemory, getLiveSession, getThread, keepMemory,
  linkMemories, listMemories, saveDraftRecording, setSessionStatus, startSession, addReflection, SESSION_IDLE_MS,
} from '../../src/lib/journal';
import { sha256Hex } from '../../src/lib/hash';
import { MAX_RECORDING_BYTES } from '../../src/lib/media';
import { family, fakeAudio, freshDb } from './helpers';

beforeEach(() => { freshDb(); });

async function session() {
  const { family: f, profile: p } = await family();
  const s = await startSession({ familyId: f.id, profileId: p.id, questionSource: 'demo_script', audioConsent: true });
  return { f, p, s };
}

describe('sessions', () => {
  it('requires recording consent and records it', async () => {
    const { family: f, profile: p } = await family();
    await expect(startSession({ familyId: f.id, profileId: p.id, questionSource: 'demo_script', audioConsent: false })).rejects.toThrow(/consent/i);
    await startSession({ familyId: f.id, profileId: p.id, questionSource: 'demo_script', audioConsent: true });
    const c = await db.consents.toArray();
    expect(c).toHaveLength(1);
    expect(c[0].purpose).toBe('audio_preservation');
  });

  it('refuses a profile from another family', async () => {
    const a = await family('A');
    const b = await family('B');
    await expect(startSession({ familyId: a.family.id, profileId: b.profile.id, questionSource: 'demo_script', audioConsent: true })).rejects.toThrow(/not in this family/);
  });

  it('pauses, resumes, ends; an ended session cannot be resumed', async () => {
    const { s } = await session();
    await setSessionStatus(s.id, 'paused');
    expect((await db.sessions.get(s.id))!.status).toBe('paused');
    await setSessionStatus(s.id, 'active');
    await setSessionStatus(s.id, 'ended');
    expect((await db.sessions.get(s.id))!.endedAt).toBeTruthy();
    await expect(setSessionStatus(s.id, 'active')).rejects.toThrow(/over/);
  });

  it('expires after 10 idle minutes', async () => {
    const { s } = await session();
    expect((await getLiveSession(s.id, Date.now() + SESSION_IDLE_MS - 1000))!.status).toBe('active');
    expect((await getLiveSession(s.id, Date.now() + SESSION_IDLE_MS + 1000))!.status).toBe('expired');
    expect((await db.sessions.get(s.id))!.status).toBe('expired');
  });
});

describe('recordings and turns', () => {
  it('commits audio with its checksum before any turn exists', async () => {
    const { f, p, s } = await session();
    const bytes = fakeAudio();
    const a = await saveDraftRecording({ familyId: f.id, profileId: p.id, memoryId: s.memoryId }, { bytes, mimeType: 'audio/mp4', durationMs: 1234 });
    const stored = await db.media.get(a.id);
    expect(stored!.state).toBe('draft');
    expect(stored!.ext).toBe('m4a');
    expect(stored!.sha256).toBe(await sha256Hex(bytes));
    expect(new Uint8Array(stored!.bytes)).toEqual(new Uint8Array(bytes));
  });

  it('rejects empty and oversized recordings without storing anything', async () => {
    const { f, p, s } = await session();
    const ctx = { familyId: f.id, profileId: p.id, memoryId: s.memoryId };
    await expect(saveDraftRecording(ctx, { bytes: new ArrayBuffer(0), mimeType: 'audio/mp4', durationMs: 0 })).rejects.toThrow(/empty/);
    await expect(saveDraftRecording(ctx, { bytes: new ArrayBuffer(MAX_RECORDING_BYTES + 1), mimeType: 'audio/mp4', durationMs: 0 })).rejects.toThrow(/limit/);
    expect(await db.media.count()).toBe(0);
  });

  it('“Don’t save” deletes the draft; sent recordings cannot be discarded that way', async () => {
    const { f, p, s } = await session();
    const ctx = { familyId: f.id, profileId: p.id, memoryId: s.memoryId };
    const a = await saveDraftRecording(ctx, { bytes: fakeAudio(), mimeType: 'audio/webm', durationMs: 900 });
    await discardDraftRecording(a.id);
    expect(await db.media.get(a.id)).toBeUndefined();
    const b = await saveDraftRecording(ctx, { bytes: fakeAudio(), mimeType: 'audio/webm', durationMs: 900 });
    await appendTurn({ memoryId: s.memoryId, speaker: 'child', speakerLabel: 'Pip', kind: 'question', originalText: 'q', textSource: 'demo_script', audioAssetId: b.id });
    await expect(discardDraftRecording(b.id)).rejects.toThrow();
  });

  it('assigns strictly increasing turn order and links audio to its turn', async () => {
    const { f, p, s } = await session();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = await saveDraftRecording({ familyId: f.id, profileId: p.id, memoryId: s.memoryId }, { bytes: fakeAudio(512, i + 1), mimeType: 'audio/mp4', durationMs: 500 });
      const t = await appendTurn({ memoryId: s.memoryId, speaker: i % 2 ? 'ai' : 'child', speakerLabel: 'x', kind: i % 2 ? 'answer' : 'question', originalText: `t${i}`, textSource: 'demo_script', audioAssetId: i % 2 ? undefined : a.id });
      ids.push(t.id);
    }
    const th = await getThread(s.memoryId);
    expect(th!.turns.map((t) => t.turnIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(th!.turns.map((t) => t.id)).toEqual(ids);
    expect(th!.media.filter((m) => m.state === 'final').every((m) => ids.includes(m.turnId!))).toBe(true);
  });

  it('original media bytes and checksums are immutable', async () => {
    const { f, p, s } = await session();
    const a = await saveDraftRecording({ familyId: f.id, profileId: p.id, memoryId: s.memoryId }, { bytes: fakeAudio(), mimeType: 'audio/mp4', durationMs: 500 });
    await expect(db.media.update(a.id, { bytes: new ArrayBuffer(4) })).rejects.toThrow(/immutable/);
    await expect(db.media.update(a.id, { sha256: 'x' })).rejects.toThrow(/immutable/);
    await expect(db.media.update(a.id, { mimeType: 'audio/webm' })).rejects.toThrow(/immutable/);
  });

  it('transcript corrections are versioned and never touch the original words or audio', async () => {
    const { f, p, s } = await session();
    const bytes = fakeAudio();
    const a = await saveDraftRecording({ familyId: f.id, profileId: p.id, memoryId: s.memoryId }, { bytes, mimeType: 'audio/mp4', durationMs: 500 });
    const t = await appendTurn({ memoryId: s.memoryId, speaker: 'child', speakerLabel: 'Pip', kind: 'question', originalText: 'how do eyes moove', textSource: 'parent_typed', audioAssetId: a.id });
    await correctTranscript(t.id, 'How do eyes move?');
    await correctTranscript(t.id, 'How do my eyes move?');
    const th = (await getThread(s.memoryId))!;
    const turn = th.turns.find((x) => x.id === t.id)!;
    expect(turn.originalText).toBe('how do eyes moove');
    expect(currentText(turn, th.transcripts)).toEqual({ text: 'How do my eyes move?', corrected: true, version: 2 });
    expect((await db.media.get(a.id))!.sha256).toBe(await sha256Hex(bytes));
    await expect(db.turns.update(t.id, { originalText: 'rewritten' })).rejects.toThrow(/immutable/);
  });
});

describe('keep or let go', () => {
  it('drafts are not in the journal until kept', async () => {
    const { f, s } = await session();
    await appendTurn({ memoryId: s.memoryId, speaker: 'child', speakerLabel: 'Pip', kind: 'question', originalText: 'How do my eyes move?', textSource: 'demo_script' });
    expect(await listMemories(f.id, { status: 'kept' })).toHaveLength(0);
    await keepMemory(s.memoryId);
    const kept = await listMemories(f.id, { status: 'kept' });
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe('How do my eyes move?');
  });

  it('“Don’t keep” removes every trace of the session data', async () => {
    const { f, p, s } = await session();
    const a = await saveDraftRecording({ familyId: f.id, profileId: p.id, memoryId: s.memoryId }, { bytes: fakeAudio(), mimeType: 'audio/mp4', durationMs: 500 });
    const t = await appendTurn({ memoryId: s.memoryId, speaker: 'child', speakerLabel: 'Pip', kind: 'question', originalText: 'q', textSource: 'demo_script', audioAssetId: a.id });
    await correctTranscript(t.id, 'Q');
    await addReflection(s.memoryId, 'note');
    await discardMemory(s.memoryId);
    expect(await db.memories.get(s.memoryId)).toBeUndefined();
    expect(await db.media.count()).toBe(0);
    expect(await db.turns.count()).toBe(0);
    expect(await db.transcripts.count()).toBe(0);
    expect(await db.reflections.count()).toBe(0);
  });

  it('audit log never contains child words', async () => {
    const { s } = await session();
    await appendTurn({ memoryId: s.memoryId, speaker: 'child', speakerLabel: 'Pip', kind: 'question', originalText: 'SECRET-CHILD-WORDS', textSource: 'parent_typed' });
    await keepMemory(s.memoryId);
    expect(JSON.stringify(await db.audit.toArray())).not.toContain('SECRET-CHILD-WORDS');
  });
});

describe('journal search and family boundaries', () => {
  it('searches titles, original words, corrections, notes and topics', async () => {
    const { f, s } = await session();
    const t = await appendTurn({ memoryId: s.memoryId, speaker: 'child', speakerLabel: 'Pip', kind: 'question', originalText: 'Why do cats purr?', textSource: 'parent_typed' });
    await keepMemory(s.memoryId);
    expect(await listMemories(f.id, { query: 'purr' })).toHaveLength(1);
    expect(await listMemories(f.id, { query: 'giraffe' })).toHaveLength(0);
    await correctTranscript(t.id, 'Why do kittens purr?');
    expect(await listMemories(f.id, { query: 'kittens' })).toHaveLength(1);
    await addReflection(s.memoryId, 'asked at the vet');
    expect(await listMemories(f.id, { query: 'vet' })).toHaveLength(1);
  });

  it('cannot link memories across families', async () => {
    const a = await family('A');
    const b = await family('B');
    const sa = await startSession({ familyId: a.family.id, profileId: a.profile.id, questionSource: 'demo_script', audioConsent: true });
    const sb = await startSession({ familyId: b.family.id, profileId: b.profile.id, questionSource: 'demo_script', audioConsent: true });
    await expect(linkMemories(sa.memoryId, sb.memoryId)).rejects.toThrow(/across families/);
  });

  it('a family only lists its own memories', async () => {
    const a = await family('A');
    const b = await family('B');
    const sb = await startSession({ familyId: b.family.id, profileId: b.profile.id, questionSource: 'demo_script', audioConsent: true });
    await keepMemory(sb.memoryId);
    expect(await listMemories(a.family.id)).toHaveLength(0);
  });

  it('refuses to attach another family’s audio to a turn', async () => {
    const a = await family('A');
    const b = await family('B');
    const sa = await startSession({ familyId: a.family.id, profileId: a.profile.id, questionSource: 'demo_script', audioConsent: true });
    const sb = await startSession({ familyId: b.family.id, profileId: b.profile.id, questionSource: 'demo_script', audioConsent: true });
    const bAudio = await saveDraftRecording({ familyId: b.family.id, profileId: b.profile.id, memoryId: sb.memoryId }, { bytes: fakeAudio(), mimeType: 'audio/mp4', durationMs: 1 });
    await expect(appendTurn({ memoryId: sa.memoryId, speaker: 'child', speakerLabel: 'x', kind: 'question', originalText: null, textSource: 'none', audioAssetId: bAudio.id })).rejects.toThrow(/this family/);
  });
});
