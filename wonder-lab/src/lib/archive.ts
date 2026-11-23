/**
 * Portable family archive (blueprint §10).
 *   README.txt · manifest.json (SHA-256 of every file) · journal.json · index.html
 *   transcripts/<memory-id>.txt · media/<asset-id>.<ext> (ORIGINAL bytes)
 * Pure functions over plain data so the same code runs in the browser, in tests,
 * and in scripts/verify-export.ts under Node.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { sha256Hex } from './hash';

export const EXPORT_SCHEMA = 'tinkadoo-export';
/** Archives written before the rename are still readable. */
export const LEGACY_SCHEMAS: string[] = ['wonder-lab-export'];
export const EXPORT_SCHEMA_VERSION = 1;

export interface ExportTurn {
  id: string; turnIndex: number; speaker: 'child' | 'parent' | 'ai'; speakerLabel: string; kind: string;
  originalText: string | null; textSource: string; replyToTurnId?: string; highlighted: boolean; review?: string;
  meta?: Record<string, unknown>; createdAt: string;
  transcriptVersions: Array<{ version: number; content: string; source: string; createdAt: string }>;
  mediaIds: string[];
}
export interface ExportMemory {
  id: string; profileId: string; title: string; occurredAt: string; topics: string[]; synthetic?: boolean;
  turns: ExportTurn[]; reflections: Array<{ id: string; text: string; createdAt: string }>;
}
export interface ExportMedia {
  id: string; path: string; kind: string; mimeType: string; byteCount: number; sha256: string;
  durationMs: number; capturedAt: string; memoryId: string | null; turnId: string | null; synthetic?: boolean;
}
export interface ExportJournal {
  schema: string; schemaVersion: number; exportedAt: string; timezone: string;
  family: { id: string; name: string };
  profiles: Array<{ id: string; displayName: string; ageBand: string; subjectKind: string }>;
  memories: ExportMemory[]; media: ExportMedia[];
  links: Array<{ sourceMemoryId: string; targetMemoryId: string; relation: string }>;
}
export interface ManifestEntry { path: string; sha256: string; byteCount: number }
export interface Manifest { schema: string; schemaVersion: number; createdAt: string; generator: string; files: ManifestEntry[] }

export interface ExportInput { journal: Omit<ExportJournal, 'schema' | 'schemaVersion'>; mediaBytes: Map<string, Uint8Array> }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const SOURCE_LABEL: Record<string, string> = {
  demo_script: 'scripted practice line (synthetic, not speech recognition)',
  parent_typed: 'typed by a grown-up',
  explore_card: 'tapped an explore idea suggested by TT',
  mock_provider: 'pre-written practice reply (not live AI)',
  none: 'not transcribed — listen to the recording',
};

function transcriptText(j: ExportJournal, m: ExportMemory): string {
  const prof = j.profiles.find((p) => p.id === m.profileId);
  const lines = [`${m.title}`, `${new Date(m.occurredAt).toString()}`, `Explorer: ${prof?.displayName ?? 'unknown'}`, ''];
  for (const t of m.turns) {
    const latest = t.transcriptVersions.at(-1);
    lines.push(`[${t.turnIndex + 1}] ${t.speakerLabel} (${t.speaker}, ${t.kind})`);
    lines.push(`    original: ${t.originalText ?? '(no text)'}   [source: ${SOURCE_LABEL[t.textSource] ?? t.textSource}]`);
    if (latest) lines.push(`    corrected v${latest.version}: ${latest.content}`);
    for (const id of t.mediaIds) lines.push(`    audio: ${j.media.find((x) => x.id === id)?.path}`);
    lines.push('');
  }
  if (m.reflections.length) {
    lines.push('Grown-up notes:');
    m.reflections.forEach((r) => lines.push(`  - ${r.text} (${r.createdAt})`));
  }
  return lines.join('\n');
}

function indexHtml(j: ExportJournal): string {
  const prof = (id: string) => j.profiles.find((p) => p.id === id)?.displayName ?? 'Explorer';
  const memories = j.memories
    .map((m) => {
      const turns = m.turns
        .map((t) => {
          const audio = t.mediaIds
            .map((id) => j.media.find((x) => x.id === id))
            .filter(Boolean)
            .map((a) => `<audio controls preload="none" src="${esc(a!.path)}"></audio> <a href="${esc(a!.path)}">${esc(a!.path)}</a>`)
            .join('<br>');
          const corrected = t.transcriptVersions.at(-1);
          return `<li class="${t.speaker}"><b>${esc(t.speakerLabel)}</b> <small>${esc(SOURCE_LABEL[t.textSource] ?? t.textSource)}${t.highlighted ? ' · ★ kept moment' : ''}${t.review === 'rejected' ? ' · grown-up marked “not right”' : ''}</small>
<p>${esc(t.originalText ?? '(no text — listen to the recording)')}</p>${corrected ? `<p><small>Corrected (v${corrected.version}): ${esc(corrected.content)}</small></p>` : ''}${audio ? `<p>${audio}</p>` : ''}</li>`;
        })
        .join('\n');
      const notes = m.reflections.map((r) => `<li>${esc(r.text)} <small>${esc(new Date(r.createdAt).toLocaleString())}</small></li>`).join('');
      return `<section><h2>${esc(m.title)}</h2><p><small>${esc(new Date(m.occurredAt).toLocaleString())} · ${esc(prof(m.profileId))}${m.topics.length ? ' · ' + esc(m.topics.join(', ')) : ''}${m.synthetic ? ' · synthetic demo data' : ''}</small></p><ol>${turns}</ol>${notes ? `<h3>Grown-up notes</h3><ul>${notes}</ul>` : ''}<p><a href="transcripts/${esc(m.id)}.txt">Plain-text transcript</a></p></section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tinkadoo — ${esc(j.family.name)}</title>
<style>body{font:16px/1.5 Georgia,serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#1d1b3a;background:#fbf6ec}h1{font-weight:normal}section{border-top:1px solid #d9cdb4;padding-top:1rem;margin-top:2rem}li{margin:.8rem 0}li.child b{color:#b4462b}li.ai b{color:#3c5a99}li.parent b{color:#2f6f4f}small{color:#6b6478}audio{max-width:100%}</style></head>
<body><h1>Tinkadoo family archive</h1><p>${esc(j.family.name)} · exported ${esc(new Date(j.exportedAt).toLocaleString())} (${esc(j.timezone)})</p>
<p><small>Child and grown-up recordings are the original files. Replies marked “pre-written practice reply” came from Tinkadoo’s practice mode, not a live AI. This page works offline; keep it in the same folder as the media/ and transcripts/ folders.</small></p>
${memories || '<p>No kept memories in this export.</p>'}
<footer><p><small>Tinkadoo · A House of Quiet Rage project</small></p></footer></body></html>`;
}

const README = (j: ExportJournal) => `WONDER LAB FAMILY ARCHIVE
Family: ${j.family.name}
Exported: ${j.exportedAt} (${j.timezone})
Format: ${EXPORT_SCHEMA} v${EXPORT_SCHEMA_VERSION}

Open index.html in any web browser to read and listen. No account or internet needed.

  index.html               readable journal with playable recordings
  journal.json             complete structured data (profiles, memories, ordered turns, notes, links)
  transcripts/<id>.txt     plain-text transcript of each conversation
  media/<id>.<ext>         ORIGINAL recordings exactly as captured (m4a/webm/ogg/wav)
  manifest.json            SHA-256 checksum of every file above

Text provenance: every turn records where its words came from ("textSource").
This build has no speech recognition. Child words are either a scripted practice
line (synthetic demo) or typed by a grown-up. AI replies are pre-written practice
replies, not a live AI model. Corrections are stored as numbered versions; the
original text and audio are never changed.

To check integrity:  npm run verify-export -- <this-file.zip>
This archive contains no passwords, tokens, or links to online services.
`;

export async function buildExportZip(input: ExportInput): Promise<{ zip: Uint8Array; manifest: Manifest }> {
  const journal: ExportJournal = { schema: EXPORT_SCHEMA, schemaVersion: EXPORT_SCHEMA_VERSION, ...input.journal };
  const files: Record<string, Uint8Array> = {};
  files['README.txt'] = strToU8(README(journal));
  files['journal.json'] = strToU8(JSON.stringify(journal, null, 2));
  files['index.html'] = strToU8(indexHtml(journal));
  for (const m of journal.memories) files[`transcripts/${m.id}.txt`] = strToU8(transcriptText(journal, m));
  for (const media of journal.media) {
    const bytes = input.mediaBytes.get(media.id);
    if (!bytes) throw new Error(`Missing bytes for media ${media.id}`);
    const actual = await sha256Hex(bytes);
    if (actual !== media.sha256) throw new Error(`Media ${media.id} failed its checksum before export — the local copy may be damaged`);
    files[media.path] = bytes;
  }
  const entries: ManifestEntry[] = [];
  for (const [path, bytes] of Object.entries(files)) entries.push({ path, sha256: await sha256Hex(bytes), byteCount: bytes.byteLength });
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const manifest: Manifest = { schema: EXPORT_SCHEMA, schemaVersion: EXPORT_SCHEMA_VERSION, createdAt: journal.exportedAt, generator: 'Tinkadoo 0.1 (local)', files: entries };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const zippable: Zippable = {};
  for (const [p, b] of Object.entries(files)) zippable[p] = [b, { level: p.startsWith('media/') ? 0 : 6 }];
  return { zip: zipSync(zippable), manifest };
}

export interface VerifyResult { ok: boolean; errors: string[]; fileCount: number; mediaCount: number; memoryCount: number; journal?: ExportJournal; files?: Record<string, Uint8Array> }

export async function verifyExportZip(zip: Uint8Array): Promise<VerifyResult> {
  const errors: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch (e) {
    return { ok: false, errors: [`Not a readable ZIP: ${(e as Error).message}`], fileCount: 0, mediaCount: 0, memoryCount: 0 };
  }
  const mf = files['manifest.json'];
  if (!mf) return { ok: false, errors: ['manifest.json is missing'], fileCount: 0, mediaCount: 0, memoryCount: 0 };
  let manifest: Manifest;
  let journal: ExportJournal | undefined;
  try {
    manifest = JSON.parse(strFromU8(mf));
  } catch {
    return { ok: false, errors: ['manifest.json is not valid JSON'], fileCount: 0, mediaCount: 0, memoryCount: 0 };
  }
  if (manifest.schema !== EXPORT_SCHEMA && !LEGACY_SCHEMAS.includes(manifest.schema)) errors.push(`Unknown schema "${manifest.schema}"`);
  if (manifest.schemaVersion > EXPORT_SCHEMA_VERSION) errors.push(`Archive schema v${manifest.schemaVersion} is newer than this tool (v${EXPORT_SCHEMA_VERSION})`);
  const listed = new Set<string>();
  for (const e of manifest.files ?? []) {
    listed.add(e.path);
    const b = files[e.path];
    if (!b) { errors.push(`Missing file: ${e.path}`); continue; }
    if (b.byteLength !== e.byteCount) errors.push(`Size mismatch: ${e.path}`);
    if ((await sha256Hex(b)) !== e.sha256) errors.push(`Checksum mismatch (corrupted): ${e.path}`);
  }
  for (const p of Object.keys(files)) if (p !== 'manifest.json' && !p.endsWith('/') && !listed.has(p)) errors.push(`Unlisted file: ${p}`);
  try {
    journal = JSON.parse(strFromU8(files['journal.json'] ?? new Uint8Array()));
  } catch {
    errors.push('journal.json is missing or not valid JSON');
  }
  if (journal) {
    const mediaIds = new Set(journal.media.map((m) => m.id));
    for (const m of journal.media) {
      const entry = manifest.files.find((f) => f.path === m.path);
      if (!entry) errors.push(`Referenced recording not in manifest: ${m.path}`);
      else if (entry.sha256 !== m.sha256) errors.push(`Recording checksum differs from journal record: ${m.path}`);
    }
    for (const mem of journal.memories) for (const t of mem.turns) for (const id of t.mediaIds) if (!mediaIds.has(id)) errors.push(`Turn ${t.id} references missing media ${id}`);
    for (const mem of journal.memories) {
      const idx = mem.turns.map((t) => t.turnIndex);
      if (idx.some((v, i) => i > 0 && v <= idx[i - 1])) errors.push(`Turn order broken in memory ${mem.id}`);
    }
  }
  return { ok: errors.length === 0, errors, fileCount: Object.keys(files).length, mediaCount: journal?.media.length ?? 0, memoryCount: journal?.memories.length ?? 0, journal, files };
}
