# Experience principles — as implemented

Each principle is tied to where it lives in code and how it is tested.

| Principle | Implementation | Evidence |
|---|---|---|
| One obvious control. | Child room has a single 220–340px Wonder Button whose label/icon change with state (Ask! → Done → Keep wondering). Secondary controls appear only in context (Hear it / Do over / Don't save / Send after recording; Hear again / My guess after a reply). | `WonderRoom.tsx`; E2E "phone width" checks ≥96px button and ≥44px targets. |
| Voice-first, not a chatbot. | No text input in the child flow. One caption shows only the current reply (text alternative to speech); earlier replies are never stacked. | E2E north star asserts zero inputs and exactly one caption; earlier text absent. |
| Answer first, at most one invitation. | Mock replies = 1–3 sentence answer + optional `suggestedExperiment`. | Unit: ≤1 question mark per spoken reply. |
| The child leads. | Provider classifies the *current* question with prior turns as context; pretend can follow science or start cold. | Unit: "child leads" and turn-3/turn-4 tests. |
| Pretend is honoured, labelled, not corrected. | "That's a pretend idea"; real science is marked "In real life…". | Unit turn 3/4. |
| Honest AI. | Intro says it is a computer program, not a person, can be wrong. Unknown questions get "This is a practice conversation…". Every AI turn carries provenance `mock`; journal and export label replies "pre-written practice reply (not live AI)". | Unit + E2E badges. |
| Grown-ups stay central. | Adult strip: I'll answer, Pause, End, "Not right". Resume and leaving need the PIN; resume does **not** open the parent area. | E2E pause/takeover test (caught and fixed a real privilege leak). |
| Recording is visible and optional. | Coral state + "Recording your voice" + timer; Don't save deletes; consent tick required to start; End → keep-or-delete decision. | E2E Don't save / Don't keep. |
| No hooks. | No streaks, points, rewards, "come back" prompts; locked screen is neutral ("Wondering time is finished."). Animation limited to state indication; `prefers-reduced-motion` disables it. | `FORBIDDEN_OUTPUT` screen in unit tests. |
| Memory, not summary. | Journal shows "In their own words" (child recordings only), "What we explored" (every turn, ordered, with provenance), "Grown-up reflections". No generated summaries exist. | E2E thread assertions. |
| Originals are sacred. | Media bytes/hash/MIME immutable at the DB layer; turn original text immutable; corrections are numbered versions. | Integration tests. |
