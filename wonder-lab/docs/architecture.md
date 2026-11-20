# Architecture — slice 1

**Local-first SPA.** React 18 + TypeScript + Vite, HashRouter (works on any static host/PWA),
Dexie over IndexedDB, fflate for ZIP, vite-plugin-pwa (precaches the app shell only; no runtime caching).
Hand-written CSS with design tokens instead of Tailwind (deviation: faster to get a distinctive, restrained look;
no functional impact). Fonts are system fonts — no Google Fonts request (would leak IPs to a third party).
Production builds ship a CSP with `connect-src 'self'`: the page cannot talk to anyone.

## Data model (IndexedDB, mirrors blueprint §6 names)

families · profiles · consents · sessions · memories (draft|kept) · turns · media (ArrayBuffer bytes) ·
transcripts (append-only versions) · reflections · links · audit (no child text) · settings (PIN hash).

Guards enforced in the DB layer (`src/lib/db.ts` hooks): media bytes/hash/MIME immutable; turn original text,
speaker, order immutable. Repository (`src/lib/journal.ts`) enforces: consent required to start, profile must
belong to family, audio can't attach across families, memories can't link across families, turn index assigned
inside the transaction.

Audio is stored as `ArrayBuffer` (not `Blob`) — older WebKit versions had Blob-in-IndexedDB bugs.

## Capture pipeline

tap → `getUserMedia` (only after tap) → `MediaRecorder` with MIME negotiated via `isTypeSupported`
(mp4/AAC preferred, then webm/opus, ogg) → stop → **saved to IndexedDB as draft with SHA-256 before review** →
Send attaches it to a new turn (state final) → provider reply → spoken. Reload/crash mid-review recovers the draft.
Backgrounding while listening stops and saves. Tracks are stopped after each clip and on unmount. 90 s auto-stop.

## Parent gate (local, not server auth)

PBKDF2-SHA256 (150k iterations, 16-byte salt) PIN; 15-min unlock window; lockout after 5 misses.
Starting a session locks the parent area. `checkPin` (verify-only) resumes a session; `unlock` opens the parent area.
**This protects a shared device; it is not authentication.** Real parent auth arrives with Supabase.

## Next sprints (contracts already shaped for them)

- **Server + Supabase** (blueprint Sprint 3): the `familyId` on every row becomes RLS-enforced; `syncState`
  (`local_only → uploading → cloud_saved → backed_up`) already exists and is truthfully stuck at `local_only`;
  media IDs are UUIDs suitable as idempotency keys; storage paths `family/<id>/profile/<id>/<asset>.<ext>`.
- **Live AI**: implement `ConversationProvider` server-side behind `evaluateLiveGate`; client keeps the same contract.
- **Keepsake PDF, image attachments, backups**: not started.
