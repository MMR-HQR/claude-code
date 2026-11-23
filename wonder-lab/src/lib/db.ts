import Dexie, { type Table } from 'dexie';

export type AgeBand = '3-4' | '5-6' | '7-9' | 'adult';
export type Speaker = 'child' | 'parent' | 'ai';
export type SessionStatus = 'active' | 'paused' | 'ended' | 'expired';
export type QuestionSource = 'demo_script' | 'parent_typed';
/** Where the turn's ORIGINAL text came from. There is no speech-to-text in this slice. */
export type TextSource = 'demo_script' | 'parent_typed' | 'explore_card' | 'mock_provider' | 'none';
/** Sync lifecycle. This slice never leaves local_only — there is no server yet. */
export type SyncState = 'local_only' | 'uploading' | 'cloud_saved' | 'backed_up';

export interface Family { id: string; name: string; createdAt: string; isolatedImport?: boolean; importedFrom?: string }
export interface Profile {
  id: string; familyId: string; displayName: string; ageBand: AgeBand;
  subjectKind: 'child' | 'adult'; theme: string; createdAt: string; archivedAt?: string;
}
export interface ConsentRecord {
  id: string; familyId: string; profileId: string;
  purpose: 'audio_preservation' | 'provider_processing' | 'photo_storage';
  consentMethod: 'parent_pin_checkbox'; policyVersion: string; grantedAt: string; revokedAt?: string;
}
export interface WonderSession {
  id: string; familyId: string; profileId: string; memoryId: string;
  status: SessionStatus; aiMode: 'mock' | 'parent' | 'live'; questionSource: QuestionSource;
  createdAt: string; lastActivityAt: string; expiresAt: string; endedAt?: string;
}
export interface Memory {
  id: string; familyId: string; profileId: string; sessionId: string | null;
  kind: 'wonder_thread'; title: string; occurredAt: string;
  status: 'draft' | 'kept'; topics: string[]; syncState: SyncState;
  createdAt: string; updatedAt: string; synthetic?: boolean;
}
export interface Turn {
  id: string; familyId: string; sessionId: string | null; memoryId: string;
  turnIndex: number; speaker: Speaker; speakerLabel: string;
  kind: 'intro' | 'question' | 'guess' | 'answer' | 'parent_answer';
  /** Exactly what was first captured. Never mutated; corrections live in transcriptVersions. */
  originalText: string | null; textSource: TextSource;
  replyToTurnId?: string; highlighted: boolean; review?: 'approved' | 'rejected';
  meta?: { provider?: 'mock'; uncertainty?: boolean; needsAdult?: boolean; suggestedExperiment?: string; guardrail?: string; scriptStep?: number };
  createdAt: string;
}
export interface MediaAsset {
  id: string; familyId: string; profileId: string; memoryId: string | null; turnId: string | null;
  kind: 'child_audio' | 'parent_audio' | 'reflection_audio';
  mimeType: string; ext: string; byteCount: number; sha256: string; durationMs: number;
  capturedAt: string; state: 'draft' | 'final'; synthetic?: boolean;
  /** Original bytes as captured. ArrayBuffer (not Blob) for robust IndexedDB storage on older WebKit. */
  bytes: ArrayBuffer;
}
export interface TranscriptVersion {
  id: string; familyId: string; turnId: string; content: string;
  source: 'human' | 'local_stt' | 'approved_vendor_stt'; version: number; createdAt: string;
}
export interface Reflection { id: string; familyId: string; memoryId: string; text: string; createdAt: string }
export interface MemoryLink { id: string; familyId: string; sourceMemoryId: string; targetMemoryId: string; relation: 'follow_up' | 'revisited' | 'related' }
/** Audit events never contain child text or audio. */
export interface AuditEvent { id: string; familyId: string; action: string; targetType: string; targetId: string; createdAt: string }
export interface Setting { key: string; value: unknown }

export class WonderDB extends Dexie {
  families!: Table<Family, string>;
  profiles!: Table<Profile, string>;
  consents!: Table<ConsentRecord, string>;
  sessions!: Table<WonderSession, string>;
  memories!: Table<Memory, string>;
  turns!: Table<Turn, string>;
  media!: Table<MediaAsset, string>;
  transcripts!: Table<TranscriptVersion, string>;
  reflections!: Table<Reflection, string>;
  links!: Table<MemoryLink, string>;
  audit!: Table<AuditEvent, string>;
  settings!: Table<Setting, string>;

  constructor(name = 'tinkadoo') {
    super(name);
    this.version(1).stores({
      families: 'id',
      profiles: 'id, familyId',
      consents: 'id, familyId, profileId',
      sessions: 'id, familyId, status',
      memories: 'id, familyId, profileId, sessionId, status, occurredAt',
      turns: 'id, familyId, memoryId, sessionId, [memoryId+turnIndex]',
      media: 'id, familyId, memoryId, turnId',
      transcripts: 'id, familyId, turnId',
      reflections: 'id, familyId, memoryId',
      links: 'id, familyId, sourceMemoryId, targetMemoryId',
      audit: 'id, familyId',
      settings: 'key',
    });

    // Original media is immutable: only explicitly allowed metadata may change.
    this.media.hook('updating', (mods, _key, obj) => {
      const allowed = new Set(['state', 'memoryId', 'turnId']);
      const bad = Object.keys(mods).filter((k) => !allowed.has(k) && !sameValue((mods as Record<string, unknown>)[k], (obj as unknown as Record<string, unknown>)[k]));
      if (bad.length) throw new Error(`Original media is immutable (attempted to change: ${bad.join(', ')})`);
    });
    // Turns: original text, speaker and order are the record. They cannot be rewritten.
    this.turns.hook('updating', (mods, _key, obj) => {
      const locked = ['originalText', 'speaker', 'turnIndex', 'memoryId', 'familyId', 'textSource'];
      const bad = Object.keys(mods).filter((k) => locked.includes(k) && !sameValue((mods as Record<string, unknown>)[k], (obj as unknown as Record<string, unknown>)[k]));
      if (bad.length) throw new Error(`Turn originals are immutable (attempted to change: ${bad.join(', ')})`);
    });
  }
}

/** Value equality for hook guards (Dexie reports binary fields as changed by reference). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const isBuf = (v: unknown): v is ArrayBuffer => Object.prototype.toString.call(v) === '[object ArrayBuffer]';
  if (isBuf(a) && isBuf(b)) {
    if (a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a);
    const y = new Uint8Array(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  return false;
}

export let db = new WonderDB();

/** Test helper: swap in a fresh database. */
export function setDatabase(next: WonderDB) {
  db = next;
}
