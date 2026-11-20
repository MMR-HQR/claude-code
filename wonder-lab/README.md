# Wonder Lab

*A House of Quiet Rage project — A place to wonder. A lifetime to remember.*

A parent-supervised, voice-first discovery room for children, and a private family
journal that keeps their actual questions and voices.

**This is vertical slice 1: local-first, practice-mode only.** Everything lives in the
browser's IndexedDB on one device. There is no server, no upload, no live AI, no
speech recognition. Replies come from a deterministic, clearly labelled practice
provider. See [What is not built yet](#what-is-not-built-yet).

## Run it

Requires Node 20+ (tested on 22).

```bash
cd wonder-lab
npm install
npm run dev            # http://localhost:5173  (microphone works on localhost)
```

First launch: create a family space (family name, child nickname + age band, a 4–8 digit
parent PIN). Leave "Add a synthetic demo conversation" ticked to get a pre-filled journal entry.

Then: **Start wondering** → pick the explorer → choose *Practice script: the cheek eye* →
tick the recording consent → **Start wondering**. Tap the glowing button, speak, tap
**Done**, then **Send**. Four turns walk through the north-star conversation. **End** →
**Grown-up** → PIN → **Keep in journal**.

### On the iPad (A16) — needs HTTPS

Microphones and WebCrypto only work in a secure context, so plain `http://<your-mac-ip>`
will **not** record on the iPad. Two options:

1. **LAN with a self-signed certificate** (quickest):
   ```bash
   npm run build
   WONDER_HTTPS=1 npx vite preview --host --port 4173
   ```
   On the iPad, open `https://<computer-LAN-IP>:4173` in Safari and accept the certificate
   warning (Show Details → visit this website). Same Wi-Fi network required.
   Use `npm run dev:lan` instead if you want hot reload.
2. **Any static HTTPS host**: `npm run build` and upload `dist/`. The app makes no network
   calls, so a static host only ever serves the app shell; recordings never leave the iPad.

Add to Home Screen from Safari's Share menu to test the installed (standalone) mode.

## Checks

```bash
npm run typecheck      # TypeScript, strict
npm run lint           # ESLint
npm run test           # Vitest: 86 unit + integration tests (Node + fake IndexedDB)
npm run build          # production build + service worker
npm run test:e2e       # Playwright: 7 browser tests, real MediaRecorder on Chromium's fake mic
npm run check          # typecheck + lint + test + build

npm run demo:cheek-eye            # scripted north-star conversation in the terminal
npm run verify-export -- file.zip # check an exported archive (exit 1 on any problem)
SCREENSHOTS=1 npm run test:e2e    # regenerate docs/screenshots at 2x
```

## Configuration

| Setting | Default | Where |
|---|---|---|
| Max recording size | 25 MB | `VITE_MAX_RECORDING_BYTES` |
| Max recording length (auto-stop) | 90 s | `MAX_RECORDING_MS` in `src/lib/media.ts` |
| Session idle expiry | 10 min | `SESSION_IDLE_MS` in `src/lib/journal.ts` |
| Parent unlock window | 15 min | `UNLOCK_MS` in `src/lib/auth.ts` |
| PIN lockout | 5 wrong → 30 s | `src/lib/auth.ts` |

`.env.example` documents future server variables. Live AI is default-deny
(`server/providers/liveGate.ts`); no provider is approved, so it refuses even with every flag set.

## Layout

```
src/lib/            db (Dexie schema + immutability guards), journal repo, auth (PIN),
                    recorder (MediaRecorder + state machine), archive (zip/verify), familyArchive (export/import)
src/features/wonder provider contracts, MockWonderProvider, guardrails, demo script, speech, chime
src/routes/         Landing, ParentHome, SessionSetup, WonderRoom (child), Journal, MemoryDetail, Archive, Privacy
server/providers/   liveGate.ts — server-only fail-closed gate for any future live provider
tests/unit, tests/integration, tests/e2e
docs/               architecture, experience principles, conversation evaluation, privacy readiness, device test plan, screenshots
```

## What is not built yet

Supabase auth/Postgres/RLS/storage, sync queue, server API, signed child-session tokens,
keepsake PDF, image attachments, backups, live AI/STT/TTS adapters. See
`docs/architecture.md` for how the slice is shaped to receive them and
`docs/privacy-readiness.md` for the gates that must pass first.
