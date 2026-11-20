/**
 * SYNTHETIC development data only. "Recordings" are generated tones, not voices.
 * Everything created here is flagged synthetic=true and labelled in the UI and export.
 */
import { db } from './db';
import { sha256Hex } from './hash';
import { uuid, nowIso } from './ids';
import { addProfile, appendTurn, audit, keepMemory } from './journal';
import { MockWonderProvider, spokenText } from '../features/wonder/mockProvider';
import { CHEEK_EYE_SCRIPT } from '../features/wonder/demoScript';
import type { WonderTurn } from '../features/wonder/provider';

/** 16-bit mono PCM WAV of a gentle rising chirp. */
export function synthWav(seconds = 1.2, baseHz = 440, sampleRate = 16000): ArrayBuffer {
  const n = Math.floor(seconds * sampleRate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 20) * Math.min(1, (seconds - t) * 8);
    const f = baseHz * (1 + 0.25 * (t / seconds));
    v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * f * t) * 0.25 * env * 32767), true);
  }
  return buf;
}

export async function seedSyntheticFamilyThread(familyId: string): Promise<string> {
  let profile = (await db.profiles.where('familyId').equals(familyId).toArray()).find((p) => p.displayName === 'Pip (synthetic)');
  if (!profile) profile = await addProfile(familyId, 'Pip (synthetic)', '5-6');
  const t = nowIso();
  const memoryId = uuid();
  await db.memories.add({ id: memoryId, familyId, profileId: profile.id, sessionId: null, kind: 'wonder_thread', title: 'Untitled', occurredAt: t, status: 'draft', topics: ['eyes', 'pretend'], syncState: 'local_only', createdAt: t, updatedAt: t, synthetic: true });
  const provider = new MockWonderProvider();
  const prior: WonderTurn[] = [];
  for (let i = 0; i < CHEEK_EYE_SCRIPT.length; i++) {
    const q = CHEEK_EYE_SCRIPT[i];
    const bytes = synthWav(1 + i * 0.3, 380 + i * 60);
    const assetId = uuid();
    await db.media.add({ id: assetId, familyId, profileId: profile.id, memoryId, turnId: null, kind: 'child_audio', mimeType: 'audio/wav', ext: 'wav', byteCount: bytes.byteLength, sha256: await sha256Hex(bytes), durationMs: 1000 + i * 300, capturedAt: nowIso(), state: 'draft', synthetic: true, bytes });
    const child = await appendTurn({ memoryId, speaker: 'child', speakerLabel: profile.displayName, kind: 'question', originalText: q, textSource: 'demo_script', audioAssetId: assetId, meta: { scriptStep: i + 1 } });
    prior.push({ id: child.id, speaker: 'child', text: q, createdAt: child.createdAt });
    const r = await provider.respond({ questionText: q, context: { sessionId: 'synthetic', ageBand: profile.ageBand, priorTurns: prior } });
    const ai = await appendTurn({ memoryId, speaker: 'ai', speakerLabel: 'Wonder Lab (practice)', kind: 'answer', originalText: spokenText(r), textSource: 'mock_provider', replyToTurnId: child.id, meta: { provider: 'mock', uncertainty: r.uncertainty, needsAdult: r.needsAdult, suggestedExperiment: r.suggestedExperiment } });
    prior.push({ id: ai.id, speaker: 'ai', text: r.text, createdAt: ai.createdAt });
  }
  await keepMemory(memoryId, 'The cheek eye (synthetic demo)');
  await db.reflections.add({ id: uuid(), familyId, memoryId, text: 'Synthetic note: she spent ten minutes blinking one eye at a time afterwards.', createdAt: nowIso() });
  await audit(familyId, 'synthetic.seeded', 'memory', memoryId);
  return memoryId;
}
