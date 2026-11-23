# Brand implementation — Tinkadoo Brand Guide

Source: *Tinkadoo Brand Guide* (12 slides). Decisions taken with the product owner on 2026-11-23:
the app is **Tinkadoo**, voice rules are a **blend** of the guide and the Wonder Lab blueprint, and
TT appears as the **supplied lockup art now, with state poses later**.

## Applied exactly
| Guide rule | Where |
|---|---|
| Cream `#FBEFDE` background, Midnight Navy `#1B2A6B` text, Periwinkle `#6E7BD9` primary, Explorer Teal `#2FA8A0`, Wonder Gold `#F5B82E`, Soft Coral `#F2836B` for errors (never red) | `src/styles/app.css` tokens |
| Baloo 2 headings (700/800), Nunito body (400–800); body 18px, captions ≥15px, kids' answers 20px+, line height 1.4, sentence case | fonts self-hosted via `@fontsource` (SIL OFL), so no request to Google Fonts |
| Hero mic button: Periwinkle with a Wonder Gold glow ring that pulses while listening | `.wonder-button`, `.orb-ring` |
| Radius 20–28px, fully round buttons, tap targets ≥56px, soft shadows, springy 200–350ms motion, nothing flashing | CSS; E2E asserts 56px on the phone layout |
| Wave lockup on welcome/splash; Peek lockup for headers and banners; full lockup never under 120px tall | Landing, locked screen (Wave); child room, parent home (Peek, 120px) |
| Parent area: same palette, calmer, text-led, Navy headers | Parent layout |
| Crescent moons only on TT | removed the old moon illustration and the moon state icon |

## How the art was prepared
The deck supplies TT only inside flattened lockups on a peach background (`#F7E1D3`), which would show as a box on Cream.
The background was removed by color unmixing (soft edges and the translucent wings preserved); TT and the wordmark are
otherwise untouched: no recoloring, redrawing, stretching or shadows. Files: `public/brand/tinkadoo-wave.webp`,
`tinkadoo-peek.webp`. The line icons from the "states" slide (mic, question, chat, star, shrug) mark each state next to
the state words.

## Deliberate deviations (please review)
1. **Text on Teal is Navy, not white.** White on Teal is 2.90:1 and fails the guide's own AA requirement; Navy is 4.55:1.
2. **White on Periwinkle is 3.82:1**, so it passes AA only as large text. All white-on-Periwinkle labels are ≥19px bold.
3. **Parent header uses a gold four-point star plus the word "Grown-ups"**, not the logo: the full lockup must be ≥120px
   tall, and there is no standalone wordmark file. *Needed: a wordmark-only file (SVG/PNG), plus a cream/white version for Navy.*
4. **Voice blend** (owner decision), replacing the guide's "kind older friend / always end with 2–3 ideas / celebrate the question":
   - TT says it is a computer program, not a person; the word "friend" is never used about TT.
   - A brief "Ooh, eyes!" topic interest on the first answer of a session only; never praise of the child ("great question" is screened out).
   - Up to **two** optional, tappable *explore next* cards after real answers; they are never spoken as a push to continue, and none appear after "I don't know".
   - **Celebrating** is a short gold star burst when a real answer lands; never a reward, and never after safety or "not sure" replies.
5. **TT state poses** (idle, listening, thinking, answering, celebrating, not sure) are not in the deck. *Needed: transparent PNG/SVG or Lottie per state.*
   The belly-stars "I wonder…" animation needs separate art layers.
6. The **app icon** is a gold four-point star on Periwinkle, because TT is unreadable at icon sizes. The Home Screen icon uses the Peek lockup.
