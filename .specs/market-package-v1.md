# MeetMate Market Package — candidate 4.5.6

**Package status:** refreshed evidence-backed content package for release review. This package is grounded in PR #6 head `098054ee5ac8de9c6ef60b9066a1e4a381ef853f` and the files present in that exact checkout. It does not claim public availability, store approval, installs, users, revenue, or successful payment conversion.

**Product:** MeetMate Chrome extension for Microsoft Teams
**Audience:** Teams participants who need a concise, private answer while a meeting is still happening.
**Candidate version:** `4.5.6` (`package.json`, `extension/manifest.json`)
**Package owner:** Market Agent

## Positioning

### One-line value statement

MeetMate lets you ask a Microsoft Teams meeting what matters now and get a concise answer grounded in live captions and private reference material kept in your browser.

### Store title

`MeetMate — Ask Your Meeting Anything`

### Short description

`Ask your Teams meeting anything. Get concise answers grounded in live captions and your own docs. No bot; nothing sent until you ask.`

### Long description

MeetMate is an ask-first Q&A assistant for Microsoft Teams meetings. It runs in your Teams tab so you can ask while the discussion is still happening.

**ASK FIRST, STAY IN THE MEETING**

MeetMate captures Teams live captions into a local transcript. Caption arrival does not call an AI model or start an autonomous loop. The model runs when you type an Ask or tap a shortcut.

**GROUNDED ANSWERS**

Each Ask can use the current transcript and relevant material from your private Knowledge library. The assistant keeps meeting speech and reference material distinct, avoids unsupported facts, and can say when the available context is insufficient.

**PRIVATE KNOWLEDGE CHAT**

Knowledge Chat lets you ask questions across the supported documents you have imported. You can add multiple text/Markdown/JSON/CSV/HTML files and remove them. The current candidate stores the library in browser storage and enforces an approximately 5 MB total content cap. Importing files does not itself make a model request.

**A SMALL RAIL, WITH A LARGER VIEW**

Use configurable shortcuts or type a free-form question. When an answer needs more room, open the question in MeetMate’s expanded view. Free users can show up to three shortcuts; Premium removes that shown-shortcut limit.

**OPTIONAL PREMIUM**

Production builds expose two Stripe-hosted choices: US$1.99 for a one-time 7-day pass or US$1.99/week recurring. Premium provides answer provenance, Knowledge Chat, a structured end-of-meeting report, and unlimited shown shortcuts. Checkout activation stores a local entitlement; no Stripe secret is shipped in the extension. Payment and entitlement status remain release-time verification items.

**MEETING-READY DETAILS**

- Works with Teams live captions; no meeting bot or audio recording is claimed.
- Answers are designed to be short enough to read while someone else is talking.
- The transcript can be exported as a `.vtt` file when the meeting ends.
- Privacy and support destinations are the canonical repository pages listed below.

MeetMate does not claim automatic summaries, cross-meeting memory, or answers beyond the transcript and reference evidence available to the current Ask.

## Target users and use cases

1. **Preparing a response:** tap Reply to draft concise wording from the current discussion.
2. **Getting oriented:** ask about the current topic or expand an answer for easier reading.
3. **Checking a brief or spec:** import several local reference files and query them together.
4. **Managing local docs:** remove an imported document when it is no longer relevant.
5. **Keeping a record:** export the captured caption transcript as VTT when leaving.

## Release notes for users

MeetMate 4.5.6 adds a clearer Premium knowledge workflow and a more usable answer surface:

- Ask questions across a multi-file local Knowledge library.
- Add and remove supported text-based reference files within the current approximately 5 MB total cap.
- Open meeting answers in an expanded view when the in-meeting rail is too small.
- Keep the ask-first boundary: captions alone never trigger a model call.
- Use either the US$1.99 one-time 7-day pass or US$1.99/week recurring Premium path when configured.

## Screenshot and media plan

The existing `4.4.9` captures and fixture are historical evidence only and must not be submitted as 4.5.6 media. A fresh capture set is required after the candidate-integrity gate is cleared.

Required 1280×800 synthetic captures:

1. **Ask and expanded answer** — Teams-style meeting canvas with local-capture status, a concise answer in the rail, and the expanded-answer view open. Caption: “Ask in the meeting, then open the answer when you need more room.”
2. **Knowledge Chat and local library** — Setup showing multiple local documents, remove controls, the approximately 5 MB cap, Knowledge Chat, and Premium state. Caption: “Query the private library you manage in your browser.”
3. **Premium choices** — Setup showing the one-time 7-day and weekly recurring choices, with no secret, session ID, or claim of completed payment. Caption: “Choose the Premium path that fits this meeting workflow.”

These should use synthetic names and text only. They are listing media, not proof of a live Teams session, publication, or revenue. A runtime demo video remains pending because no controllable Teams meeting session is available; do not reuse the old video as 4.5.6 evidence.

## CTA and destinations

- **Primary CTA:** `Install MeetMate free for Chrome`.
- **Secondary CTA:** `Ask your first meeting question`.
- **Homepage/public product destination:** `https://github.com/lalalic/team-mate` (repository page; reachability observed, publication status not inferred).
- **Chrome Web Store destination:** `https://chromewebstore.google.com/detail/immkojolaicdjhkbbhkldmndhfjbehmf` (listing/version not verified in this task).
- **Privacy destination:** `https://github.com/lalalic/team-mate`.
- **Support destination:** `https://github.com/lalalic/team-mate`.
- **Payment destinations:** configured at release build time through `STRIPE_ONE_TIME_PAYMENT_LINK` and `STRIPE_WEEKLY_PAYMENT_LINK`; never publish placeholders or claim checkout is live without release verification.

## Claim-to-evidence map

| Material claim | Evidence and boundary |
| --- | --- |
| Captions are captured locally and do not trigger model calls | `README.md:11-21,35-53`; `src/content.js`; `src/util.js`; focused tests. |
| Ask and shortcut actions produce grounded answers | `README.md:23-47`; `src/focused.js`; `src/util.js`. |
| Knowledge Chat searches multiple local files and upload does not call the model | `src/setup.js:387-481`; `src/util.js:103-203,242-280`; `src/focused.js:283-353,385-447`; `extension/setup.html:264-285`. The candidate enforces an approximately 5 MB total cap. |
| The current candidate enforces an approximately 5 MB local knowledge cap | `src/setup.js:387-481`; `extension/setup.html:264-285`. Storage-cap removal is not present in this exact release candidate. |
| The current answer surface can open a larger view | `src/ui-controller.js:166-205` and the corresponding `extension/content.css` overlay styles. |
| Two Premium purchase paths and product-bound entitlement exist | PR #6 commits `9142fe7`, `57db8e5`, `c65af6e`; `README.md:56-61,134-142,232-234`; `src/background.js`; `src/premium-state.js`. No secret is claimed or included. |
| Transcript export is VTT on Leave | `README.md:54-55,118-122`; `src/background.js`; `src/meeting-files.js` in the feature history. |
| Homepage, privacy, and support destinations | `www/index.html`; `www/privacy.html`; `www/support.html`; current repository URL above. |
| Candidate version and package identity | `package.json:3`; `extension/manifest.json:2`; PR #6 head `098054ee5ac8de9c6ef60b9066a1e4a381ef853f`. |

Rejected or deliberately omitted claims: public availability, store review/approval, install/user/revenue numbers, successful payment conversion, testimonials, meeting audio recording, bot participation, automatic summaries, server-side payment verification, and any exact feature claim that fails the candidate-integrity gate.

## Completeness and handoff checklist

- [x] Title, short/long description, positioning, users, use cases, CTA, and release notes.
- [x] Current candidate version and dual Stripe pricing language reconciled without exposing secrets.
- [x] Multi-file Knowledge Chat, approximately 5 MB storage cap, and expanded-view messaging included with evidence boundaries.
- [x] Homepage, privacy, and support destinations recorded as canonical repository destinations.
- [x] Stale 4.4.9 media explicitly rejected for 4.5.6.
- [x] Candidate-integrity gate: claims are limited to behavior observed in the exact `098054e…` checkout; unmerged storage-cap-removal and same-name-replacement changes are not claimed.
- [ ] Fresh 4.5.6 screenshots produced and visually approved.
- [ ] Fresh 4.5.6 demo video produced and approved.
- [ ] Configured dual-Link production build and successful checkout redirects verified by Release Agent.
- [ ] Exact public extension version and listing state verified after publication.

## Package manifest

| Artifact | Status | Downstream use |
| --- | --- | --- |
| `.specs/market-package-v1.md` | **Updated content package** | Release listing copy, claim review, and handoff gates |
| `package.json`, `package-lock.json`, `extension/manifest.json` | **Candidate version 4.5.6; source fact** | Release version identity |
| `www/index.html`, `www/privacy.html`, `www/support.html` | **Existing; public publication not verified** | Homepage/privacy/support destinations |
| `www/screenshots/meetmate-4.4.9-ask-in-context.png` | **Historical; not approved for 4.5.6** | Do not submit |
| `www/screenshots/meetmate-4.4.9-knowledge-shortcuts.png` | **Historical; not approved for 4.5.6** | Do not submit |
| `scripts/store-media-fixture.html` | **Historical 4.4.9 fixture; refresh required** | Source for fresh synthetic captures only |
| `www/team-mate-demo.mp4` | **Pending; not approved as 4.5.6 evidence** | Optional demo asset only |

## Exact handoff to Release Agent

Use the copy and claim map above for the exact `098054e…` release candidate. Before submission, validate the configured dual-Link build, verify the no-secret bundle, use fresh 4.5.6 media, and independently verify the store listing and public version. The package does not establish public availability, revenue, or payment conversion. If the intended product includes browser-capacity storage or same-name replacement, those changes must land and be re-reviewed before publishing those claims.

## Current verification record

- Repository checkout verified at `098054ee5ac8de9c6ef60b9066a1e4a381ef853f`; package and extension manifest both report `4.5.6`.
- `npm test` passed: 32 focused-helper checks, 4 configuration checks, feedback-entry checks, Premium-state checks, and meeting-file checks.
- The source still contains `KNOWLEDGE_MAX_BYTES = 5 * 1024 * 1024` and rejects uploads over the total cap (`src/setup.js:389,459-460`). The requested removal of that artificial cap is therefore a release blocker/evidence gap, not an approved 4.5.6 claim.
- Stripe paths are represented by the two build-time variables `STRIPE_ONE_TIME_PAYMENT_LINK` and `STRIPE_WEEKLY_PAYMENT_LINK`; this checkout contains no payment secrets. Link configuration and successful checkout/entitlement redirects remain Release Agent verification items.
