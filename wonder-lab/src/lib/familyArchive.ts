/** Bridges the local database and the portable archive format. */
import { db, type Turn } from './db';
import { uuid, nowIso } from './ids';
import { sha256Hex } from './hash';
import { buildExportZip, verifyExportZip, type ExportJournal, type ExportMemory, type ExportMedia } from './archive';
import { audit } from './journal';

export async function exportFamily(familyId: string, opts: { memoryIds?: string[] } = {}) {
  const family = await db.families.get(familyId);
  if (!family) throw new Error('No such family');
  let memories = (await db.memories.where('familyId').equals(familyId).toArray()).filter((m) => m.status === 'kept');
  if (opts.memoryIds) memories = memories.filter((m) => opts.memoryIds!.includes(m.id));
  memories.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const memIds = memories.map((m) => m.id);
  const [profiles, turns, media, reflections, links] = await Promise.all([
    db.profiles.where('familyId').equals(familyId).toArray(),
    db.turns.where('memoryId').anyOf(memIds).toArray(),
    db.media.where('memoryId').anyOf(memIds).toArray(),
    db.reflections.where('memoryId').anyOf(memIds).toArray(),
    db.links.where('familyId').equals(familyId).toArray(),
  ]);
  const finalMedia = media.filter((m) => m.state === 'final' && m.familyId === familyId);
  const transcripts = turns.length ? await db.transcripts.where('turnId').anyOf(turns.map((t) => t.id)).toArray() : [];
  const exMedia: ExportMedia[] = finalMedia.map((m) => ({
    id: m.id, path: `media/${m.id}.${m.ext}`, kind: m.kind, mimeType: m.mimeType, byteCount: m.byteCount, sha256: m.sha256,
    durationMs: m.durationMs, capturedAt: m.capturedAt, memoryId: m.memoryId, turnId: m.turnId, synthetic: m.synthetic,
  }));
  const exMemories: ExportMemory[] = memories.map((m) => ({
    id: m.id, profileId: m.profileId, title: m.title, occurredAt: m.occurredAt, topics: m.topics, synthetic: m.synthetic,
    turns: turns
      .filter((t) => t.memoryId === m.id)
      .sort((a, b) => a.turnIndex - b.turnIndex)
      .map((t: Turn) => ({
        id: t.id, turnIndex: t.turnIndex, speaker: t.speaker, speakerLabel: t.speakerLabel, kind: t.kind, originalText: t.originalText,
        textSource: t.textSource, replyToTurnId: t.replyToTurnId, highlighted: t.highlighted, review: t.review, meta: t.meta, createdAt: t.createdAt,
        transcriptVersions: transcripts.filter((v) => v.turnId === t.id).sort((a, b) => a.version - b.version).map((v) => ({ version: v.version, content: v.content, source: v.source, createdAt: v.createdAt })),
        mediaIds: finalMedia.filter((x) => x.turnId === t.id).map((x) => x.id),
      })),
    reflections: reflections.filter((r) => r.memoryId === m.id).map((r) => ({ id: r.id, text: r.text, createdAt: r.createdAt })),
  }));
  const usedProfiles = new Set(memories.map((m) => m.profileId));
  const journal: Omit<ExportJournal, 'schema' | 'schemaVersion'> = {
    exportedAt: nowIso(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    family: { id: family.id, name: family.name },
    profiles: profiles.filter((p) => usedProfiles.has(p.id)).map((p) => ({ id: p.id, displayName: p.displayName, ageBand: p.ageBand, subjectKind: p.subjectKind })),
    memories: exMemories,
    media: exMedia,
    links: links.filter((l) => memIds.includes(l.sourceMemoryId) && memIds.includes(l.targetMemoryId)).map((l) => ({ sourceMemoryId: l.sourceMemoryId, targetMemoryId: l.targetMemoryId, relation: l.relation })),
  };
  const mediaBytes = new Map(finalMedia.map((m) => [m.id, new Uint8Array(m.bytes)]));
  const { zip, manifest } = await buildExportZip({ journal, mediaBytes });
  // Verify the archive we just built before handing it over.
  const check = await verifyExportZip(zip);
  if (!check.ok) throw new Error(`Export failed self-verification: ${check.errors.join('; ')}`);
  await audit(familyId, 'export.created', 'family', familyId);
  const date = new Date().toISOString().slice(0, 10);
  return { zip, manifest, filename: `Tinkadoo-Family-Export-${date}.zip`, memoryCount: exMemories.length, mediaCount: exMedia.length };
}

/**
 * Restore an archive into a NEW, isolated family. Every ID is remapped (no collisions,
 * never overwrites existing data). Refuses archives that fail verification.
 */
export async function importIntoIsolatedFamily(zip: Uint8Array) {
  const v = await verifyExportZip(zip);
  if (!v.ok || !v.journal || !v.files) throw new Error(`Archive failed verification: ${v.errors.join('; ')}`);
  const j = v.journal;
  const files = v.files;
  const map = new Map<string, string>();
  const re = (id: string) => {
    if (!map.has(id)) map.set(id, uuid());
    return map.get(id)!;
  };
  const familyId = uuid();
  const t = nowIso();
  await db.transaction('rw', [db.families, db.profiles, db.memories, db.turns, db.media, db.transcripts, db.reflections, db.links], async () => {
    await db.families.add({ id: familyId, name: `${j.family.name} (imported test copy)`, createdAt: t, isolatedImport: true, importedFrom: j.family.id });
    for (const p of j.profiles) {
      await db.profiles.add({ id: re(p.id), familyId, displayName: p.displayName, ageBand: p.ageBand as never, subjectKind: p.subjectKind as never, theme: 'dusk', createdAt: t });
    }
    for (const m of j.memories) {
      await db.memories.add({ id: re(m.id), familyId, profileId: re(m.profileId), sessionId: null, kind: 'wonder_thread', title: m.title, occurredAt: m.occurredAt, status: 'kept', topics: m.topics, syncState: 'local_only', createdAt: t, updatedAt: t, synthetic: m.synthetic });
      for (const turn of m.turns) {
        await db.turns.add({
          id: re(turn.id), familyId, sessionId: null, memoryId: re(m.id), turnIndex: turn.turnIndex, speaker: turn.speaker, speakerLabel: turn.speakerLabel,
          kind: turn.kind as Turn['kind'], originalText: turn.originalText, textSource: turn.textSource as Turn['textSource'],
          replyToTurnId: turn.replyToTurnId ? re(turn.replyToTurnId) : undefined, highlighted: turn.highlighted, review: turn.review as Turn['review'], meta: turn.meta as Turn['meta'], createdAt: turn.createdAt,
        });
        for (const tv of turn.transcriptVersions) await db.transcripts.add({ id: uuid(), familyId, turnId: re(turn.id), content: tv.content, source: tv.source as never, version: tv.version, createdAt: tv.createdAt });
      }
      for (const r of m.reflections) await db.reflections.add({ id: re(r.id), familyId, memoryId: re(m.id), text: r.text, createdAt: r.createdAt });
    }
    for (const media of j.media) {
      const bytes = files[media.path];
      const copy = bytes.slice().buffer as ArrayBuffer;
      await db.media.add({
        id: re(media.id), familyId, profileId: re(j.memories.find((m) => m.id === media.memoryId)?.profileId ?? j.profiles[0].id),
        memoryId: media.memoryId ? re(media.memoryId) : null, turnId: media.turnId ? re(media.turnId) : null, kind: media.kind as never,
        mimeType: media.mimeType, ext: media.path.split('.').pop() ?? 'bin', byteCount: media.byteCount, sha256: media.sha256,
        durationMs: media.durationMs, capturedAt: media.capturedAt, state: 'final', synthetic: media.synthetic, bytes: copy,
      });
    }
    for (const l of j.links) await db.links.add({ id: uuid(), familyId, sourceMemoryId: re(l.sourceMemoryId), targetMemoryId: re(l.targetMemoryId), relation: l.relation as never });
  });
  // Re-hash what actually landed in the database.
  const stored = await db.media.where('familyId').equals(familyId).toArray();
  for (const m of stored) if ((await sha256Hex(m.bytes)) !== m.sha256) throw new Error(`Imported media ${m.id} failed checksum`);
  return { familyId, memories: j.memories.length, media: stored.length, idMap: map };
}
