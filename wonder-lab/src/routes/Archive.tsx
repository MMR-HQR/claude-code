import { useEffect, useState } from 'react';
import { db, type Family } from '../lib/db';
import { getHomeFamily, listMemories } from '../lib/journal';
import { exportFamily, importIntoIsolatedFamily } from '../lib/familyArchive';
import { verifyExportZip } from '../lib/archive';
import { verifyPin, lockParent } from '../lib/auth';
import { downloadBytes, formatBytes, requestPersistence, storageStatus } from '../lib/storage';
import { Icon } from '../components/Icon';

export function Archive() {
  const [family, setFamily] = useState<Family>();
  const [kept, setKept] = useState(0);
  const [drafts, setDrafts] = useState(0);
  const [store, setStore] = useState<Awaited<ReturnType<typeof storageStatus>>>();
  const [msg, setMsg] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [imports, setImports] = useState<Family[]>([]);
  const [busy, setBusy] = useState(false);
  const [wipePin, setWipePin] = useState('');
  const [wipeOpen, setWipeOpen] = useState(false);

  async function load() {
    const f = await getHomeFamily();
    if (!f) return;
    setFamily(f);
    setKept((await listMemories(f.id, { status: 'kept' })).length);
    setDrafts((await listMemories(f.id, { status: 'draft' })).length);
    setStore(await storageStatus());
    setImports((await db.families.toArray()).filter((x) => x.isolatedImport));
  }
  useEffect(() => void load(), []);

  async function doExport() {
    if (!family) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await exportFamily(family.id);
      downloadBytes(r.zip, r.filename, 'application/zip');
      setMsg(`Exported ${r.memoryCount} memories and ${r.mediaCount} original recordings. Every file was checksummed and re-verified before download.`);
    } catch (e) {
      setMsg(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyFile(file?: File) {
    if (!file) return;
    const r = await verifyExportZip(new Uint8Array(await file.arrayBuffer()));
    setVerify({ ok: r.ok, lines: r.ok ? [`${r.fileCount} files, ${r.memoryCount} memories, ${r.mediaCount} recordings — all checksums match.`] : r.errors });
  }

  async function onImportFile(file?: File) {
    if (!file) return;
    try {
      const r = await importIntoIsolatedFamily(new Uint8Array(await file.arrayBuffer()));
      setVerify({ ok: true, lines: [`Restored ${r.memories} memories and ${r.media} recordings into a separate test family. Your journal was not touched.`] });
      void load();
    } catch (e) {
      setVerify({ ok: false, lines: [(e as Error).message] });
    }
  }

  async function wipe() {
    if (!(await verifyPin(wipePin))) return setMsg('PIN didn’t match. Nothing was deleted.');
    lockParent();
    await db.delete();
    window.location.replace(window.location.pathname);
  }

  return (
    <div className="stack narrow">
      <h1>Archive & safekeeping</h1>

      <section className="card">
        <h2>Where your family’s data is</h2>
        <ul className="status-list">
          <li><span className="dot ok" aria-hidden /> <strong>Saved on this device:</strong> {kept} kept, {drafts} awaiting decision · {formatBytes(store?.usage)}</li>
          <li><span className="dot off" aria-hidden /> <strong>Cloud copy:</strong> none — sync isn’t built yet, nothing is uploaded</li>
          <li><span className="dot off" aria-hidden /> <strong>Backed up:</strong> no — only your exported archives are a backup</li>
          <li><span className="dot" aria-hidden /> <strong>Browser storage protection:</strong> {store?.persisted === true ? 'granted' : store?.persisted === false ? 'not granted (the browser may clear data under storage pressure)' : 'unknown'}</li>
        </ul>
        {store?.persisted === false && <button className="ghost-btn" onClick={async () => { await requestPersistence(); void load(); }}>Ask the browser to protect storage</button>}
      </section>

      <section className="card">
        <h2>Export a family archive</h2>
        <p>A .zip you can open anywhere, forever: a readable <code>index.html</code>, the original recordings, plain-text transcripts, <code>journal.json</code>, and a SHA-256 checksum for every file.</p>
        <button className="primary-btn" onClick={doExport} disabled={busy || kept === 0}><Icon name="download" size={18} /> {busy ? 'Building…' : 'Export everything kept'}</button>
        {kept === 0 && <p className="fine">Keep at least one memory first.</p>}
        {msg && <p role="status" className="note">{msg}</p>}
      </section>

      <section className="card">
        <h2>Check an archive</h2>
        <label className="file-label">Verify a .zip <input type="file" accept=".zip,application/zip" onChange={(e) => void onVerifyFile(e.target.files?.[0])} /></label>
        <label className="file-label">Restore test: import into a separate test family <input type="file" accept=".zip,application/zip" onChange={(e) => void onImportFile(e.target.files?.[0])} /></label>
        {verify && (
          <div className={`verify ${verify.ok ? 'ok' : 'bad'}`} role="status">
            <strong>{verify.ok ? 'Archive is intact' : 'Problems found'}</strong>
            <ul>{verify.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        )}
        {imports.length > 0 && (
          <>
            <p className="muted">Restored test families (kept apart from your journal):</p>
            <ul className="list">
              {imports.map((f) => (
                <li key={f.id}>{f.name} <button className="link-btn" onClick={async () => {
                  await db.transaction('rw', [db.families, db.profiles, db.memories, db.turns, db.media, db.transcripts, db.reflections, db.links], async () => {
                    for (const t of [db.profiles, db.memories, db.turns, db.media, db.transcripts, db.reflections, db.links]) await t.where('familyId').equals(f.id).delete();
                    await db.families.delete(f.id);
                  });
                  void load();
                }}>Remove</button></li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card danger-zone">
        <h2>Delete everything on this device</h2>
        <p>Removes every profile, recording, note and setting stored by Tinkadoo in this browser. Exported archives you saved elsewhere are not affected. This cannot be undone.</p>
        {!wipeOpen ? <button className="ghost-btn danger" onClick={() => setWipeOpen(true)}>Delete all data…</button> : (
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void wipe(); }}>
            <label htmlFor="wipe-pin" className="sr-only">Parent PIN</label>
            <input id="wipe-pin" type="password" inputMode="numeric" placeholder="Parent PIN" value={wipePin} onChange={(e) => setWipePin(e.target.value.replace(/\D/g, ''))} />
            <button className="ghost-btn danger">Delete permanently</button>
            <button type="button" className="ghost-btn" onClick={() => setWipeOpen(false)}>Cancel</button>
          </form>
        )}
      </section>
    </div>
  );
}
