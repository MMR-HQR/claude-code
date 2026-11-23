# Privacy & release readiness — default deny

Nothing below is signed off. Until it is, Tinkadoo is **demo/mock only**. Evidence must be a link to a
document, config screenshot or test run; "reviewer" must be a named human.

| Gate | Check | Status | Evidence | Reviewer | Date |
|---|---|---|---|---|---|
| A | Synthetic/mock data only in development | PASS (engineering) | `synthetic.ts`, mock provider; no network code in `src/` (unit test) | — | 2026-11-20 |
| A | No child data to any AI/STT/TTS/analytics | PASS (engineering) | CSP `connect-src 'self'`; bundle-hygiene test bans fetch/XHR/WebSocket/SpeechRecognition | — | 2026-11-20 |
| A | Browser `speechSynthesis` stays on-device | **OPEN** | Must confirm on iPadOS: voices used are on-device; text is AI reply text, not child data | | |
| B | Parent consent flow (separate purposes) | OPEN — only local audio-preservation tick exists | | | |
| B | Data-flow map | OPEN | | | |
| B | Storage encryption at rest (remote) | OPEN — no remote storage | | | |
| B | RLS policies + cross-family tests | OPEN — not built | | | |
| B | Backups + restore drill | OPEN — export/import only | | | |
| B | Incident contact & process | OPEN | | | |
| B | Legal review of privacy notice | OPEN — `/privacy` is a starter | | | |
| C | Provider written suitability for under-13 supervised use | OPEN | | | |
| C | Zero Data Retention (or equivalent) verified for every endpoint used | OPEN | | | |
| C | Processing geography / subprocessors | OPEN | | | |
| C | Moderation & abuse handling config | OPEN | | | |
| C | Verifiable parental consent for provider processing | OPEN | | | |
| C | Add provider id to `APPROVED_PROVIDERS` (code review required) | OPEN | | | |
| D | External children's privacy/legal review (COPPA as applicable) | OPEN | | | |
| D | Multi-tenant penetration review | OPEN | | | |
| D | Data rights, retention, support plan | OPEN | | | |

Local deletion today: Archive › Delete all data (PIN re-verified) deletes the IndexedDB database. Session
"Don't keep" deletes all turns, media, transcripts and notes for that session.
