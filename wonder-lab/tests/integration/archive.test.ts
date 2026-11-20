import { strFromU8, unzipSync, zipSync } from 'fflate';
import { db } from '../../src/lib/db';
import { exportFamily, importIntoIsolatedFamily } from '../../src/lib/familyArchive';
import { verifyExportZip } from '../../src/lib/archive';
import { correctTranscript, getThread, listMemories, startSession } from '../../src/lib/journal';
import { seedSyntheticFamilyThread } from '../../src/lib/synthetic';
import { sha256Hex } from '../../src/lib/hash';
import { family, freshDb } from './helpers';

beforeEach(() => { freshDb(); });

async function seeded() {
  const { family: f, profile } = await family('Rivera household');
  const memoryId = await seedSyntheticFamilyThread(f.id);
  return { f, profile, memoryId };
}

describe('export → verify → import (restore) integrity', () => {
  it('exports the README, manifest, journal, readable index, transcripts and ORIGINAL media', async () => {
    const { f, memoryId } = await seeded();
    const { zip, memoryCount, mediaCount } = await exportFamily(f.id);
    expect(memoryCount).toBe(1);
    expect(mediaCount).toBe(4);
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['README.txt', 'manifest.json', 'journal.json', 'index.html', `transcripts/${memoryId}.txt`]));
    const originals = await db.media.where('memoryId').equals(memoryId).toArray();
    for (const m of originals) expect(files[`media/${m.id}.${m.ext}`]).toEqual(new Uint8Array(m.bytes));
    const html = strFromU8(files['index.html']);
    expect(html).toContain('<audio controls');
    expect(html).toContain('pre-written practice reply (not live AI)');
    expect(html).toContain('scripted practice line');
  });

  it('records provenance, turn order, timezone and checksums in journal.json', async () => {
    const { f } = await seeded();
    const files = unzipSync((await exportFamily(f.id)).zip);
    const j = JSON.parse(strFromU8(files['journal.json']));
    expect(j.timezone).toBeTruthy();
    const turns = j.memories[0].turns;
    expect(turns.map((t: { turnIndex: number }) => t.turnIndex)).toEqual([...turns.keys()]);
    expect(turns.filter((t: { speaker: string }) => t.speaker === 'ai').every((t: { textSource: string }) => t.textSource === 'mock_provider')).toBe(true);
    for (const m of j.media) expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('contains no credentials, tokens, signed URLs or blob: links', async () => {
    const { f } = await seeded();
    const files = unzipSync((await exportFamily(f.id)).zip);
    for (const [p, b] of Object.entries(files)) {
      if (p.startsWith('media/')) continue;
      const s = strFromU8(b);
      expect(s, p).not.toMatch(/blob:|https?:\/\/|eyJ[A-Za-z0-9_-]{10,}|\bsk-[A-Za-z0-9]{10,}|access_token|api_?key\s*[=:]|secret_key|service_role|X-Amz-Signature/i);
    }
  });

  it('verifies clean, then restores into an isolated family with identical media and ordering', async () => {
    const { f, memoryId } = await seeded();
    const original = (await getThread(memoryId))!;
    const tv = await correctTranscript(original.turns.find((t) => t.speaker === 'child')!.id, 'corrected words');
    expect(tv.version).toBe(1);
    const { zip } = await exportFamily(f.id);
    const v = await verifyExportZip(zip);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);

    const r = await importIntoIsolatedFamily(zip);
    expect(r.familyId).not.toBe(f.id);
    expect((await db.families.get(r.familyId))!.isolatedImport).toBe(true);
    // Home family is untouched; restored IDs are all new (no collisions / overwrite).
    expect(await listMemories(f.id)).toHaveLength(1);
    const restoredMems = await listMemories(r.familyId);
    expect(restoredMems).toHaveLength(1);
    expect(restoredMems[0].id).not.toBe(memoryId);
    const restored = (await getThread(restoredMems[0].id))!;
    expect(restored.turns.map((t) => [t.turnIndex, t.speaker, t.originalText, t.textSource])).toEqual(original.turns.map((t) => [t.turnIndex, t.speaker, t.originalText, t.textSource]));
    expect(restored.turns.every((t) => !original.turns.some((o) => o.id === t.id))).toBe(true);
    const origHashes = original.media.map((m) => m.sha256).sort();
    const restHashes = await Promise.all(restored.media.map((m) => sha256Hex(m.bytes)));
    expect(restHashes.sort()).toEqual(origHashes);
    expect(restored.transcripts.map((t) => t.content)).toEqual(['corrected words']);
    expect(restored.reflections).toHaveLength(1);
    // Reply links survive remapping.
    for (const t of restored.turns.filter((x) => x.replyToTurnId)) expect(restored.turns.some((x) => x.id === t.replyToTurnId)).toBe(true);
  });

  it('importing twice never collides or overwrites', async () => {
    const { f } = await seeded();
    const { zip } = await exportFamily(f.id);
    const a = await importIntoIsolatedFamily(zip);
    const b = await importIntoIsolatedFamily(zip);
    expect(a.familyId).not.toBe(b.familyId);
    expect(await db.memories.count()).toBe(3);
  });

  it('detects a corrupted recording', async () => {
    const { f } = await seeded();
    const files = unzipSync((await exportFamily(f.id)).zip);
    const mediaPath = Object.keys(files).find((p) => p.startsWith('media/'))!;
    files[mediaPath] = files[mediaPath].slice();
    files[mediaPath][100] ^= 0xff;
    const v = await verifyExportZip(zipSync(files));
    expect(v.ok).toBe(false);
    expect(v.errors.join('\n')).toContain(`Checksum mismatch (corrupted): ${mediaPath}`);
    await expect(importIntoIsolatedFamily(zipSync(files))).rejects.toThrow(/failed verification/);
  });

  it('detects a missing referenced recording', async () => {
    const { f } = await seeded();
    const files = unzipSync((await exportFamily(f.id)).zip);
    const mediaPath = Object.keys(files).find((p) => p.startsWith('media/'))!;
    delete files[mediaPath];
    const v = await verifyExportZip(zipSync(files));
    expect(v.ok).toBe(false);
    expect(v.errors.join('\n')).toContain(`Missing file: ${mediaPath}`);
  });

  it('detects tampered journal data and garbage input', async () => {
    const { f } = await seeded();
    const files = unzipSync((await exportFamily(f.id)).zip);
    files['journal.json'] = new TextEncoder().encode(strFromU8(files['journal.json']).replace('Pip (synthetic)', 'Someone else'));
    expect((await verifyExportZip(zipSync(files))).errors.join()).toMatch(/journal\.json/);
    expect((await verifyExportZip(new Uint8Array([1, 2, 3]))).ok).toBe(false);
  });

  it('exports only kept memories — undecided drafts never leave', async () => {
    const { f, profile } = await seeded();
    await startSession({ familyId: f.id, profileId: profile.id, questionSource: 'demo_script', audioConsent: true });
    expect((await exportFamily(f.id)).memoryCount).toBe(1);
  });
});
