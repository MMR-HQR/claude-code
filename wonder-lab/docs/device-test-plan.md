# Physical device test plan — iPad (A16)

**None of this has been run.** Automated tests used desktop Chromium with a synthetic microphone.
Record results in the table; attach screen recordings where possible.

Device: iPad (A16) · iPadOS version: ______ · Safari version: ______ · Tester: ______ · Date: ______

| # | Test | Safari tab | Home Screen app | Notes |
|---|---|---|---|---|
| 1 | Open over HTTPS (see README); first mic prompt appears only after tapping Ask! | | | |
| 2 | Recording works; timer runs; level ring moves with voice | | | |
| 3 | Recorded MIME is `audio/mp4` and plays back in "Hear it" and in the journal | | | |
| 4 | Mic prompt on 2nd launch / after force-close (WebKit may re-prompt per session in standalone mode) | | | |
| 5 | Spoken replies audible through speaker; first reply speaks after the Start tap; "Hear again" works | | | |
| 6 | With silent switch / Focus mode: does speech still play? | | | |
| 7 | Deny mic → gentle error + Grown-up help text accurate for this iPadOS version (Settings path!) | | | |
| 8 | Revoke mic mid-session in Settings → next tap recovers gracefully | | | |
| 9 | Lock screen / Home while Listening → recording saved, comes back in review | | | |
| 10 | Force-quit during review → reopen → recording recovered | | | |
| 11 | Airplane mode → reload / relaunch → app opens, session works, recordings persist | | | |
| 12 | Safari restart and iPad reboot → journal intact | | | |
| 13 | Guided Access on → child cannot leave; parent routes still need PIN | | | |
| 14 | Pause → resume with PIN; after resume, typing `#/parent` in URL still demands PIN | | | |
| 15 | Portrait ↔ landscape mid-recording and mid-reply | | | |
| 16 | Long session (20+ turns) → no slowdown; storage use reasonable | | | |
| 17 | Low storage (<1 GB free) → recording save error is clear, nothing silently lost | | | |
| 18 | Export ZIP → saves to Files; open index.html in Files/Safari; recordings play; `npm run verify-export` passes on a computer | | | |
| 19 | Storage persistence: Home Screen app vs tab (WebKit may evict tab data after 7 days without use) | | | |
| 20 | Low Power Mode → animations and recording behave | | | |
| 21 | VoiceOver: Wonder Button and review buttons announced sensibly | | | |
| 22 | Confirm speechSynthesis voices are on-device (privacy gate A) | | | |
