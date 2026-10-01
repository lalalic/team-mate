# MeetMate Market Package — candidate 4.5.6

**Package status:** refreshed evidence-backed content package for release review. This package is aligned to PR #6 head `295d52bd8221660a1c139f173b759f6b4ada1e39` and the current mainline product behavior. The feature evidence includes the merged Knowledge Chat, browser-capacity local knowledge storage, and larger chat-bubble view changes (`0033334`, `dd233a8`, `b7b415e`). It does not claim public availability, store approval, installs, users, revenue, or successful payment conversion.

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

Knowledge Chat lets Premium users ask questions across the supported documents they have imported. They can add multiple text/Markdown/JSON/CSV/HTML files, replace a file with the same name, and remove files. The library is stored in browser storage; there is no artificial 5 MB application cap, and browser storage errors are surfaced if the available extension capacity is exhausted. Importing files does not itself make a model request.

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
- Add, replace, and remove supported text-based reference files without an artificial 5 MB application cap; actual browser storage capacity still applies.
- Open meeting answers in an expanded view when the in-meeting rail is too small.
- Keep the ask-first boundary: captions alone never trigger a model call.
- Use either the US$1.99 one-time 7-day pass or US$1.99/week recurring Premium path when configured.

## Screenshot and media plan

The existing `4.4.9` captures and fixture are historical evidence only and must not be submitted as 4.5.6 media. A fresh capture set is required after the candidate-integrity gate is cleared.

Required 1280×800 synthetic captures for the current product behavior:

1. **Ask and expanded answer** — Teams-style meeting canvas with local-capture status, a concise answer in the rail, and the expanded-answer view open. Caption: “Ask in the meeting, then open the answer when you need more room.”
2. **Knowledge Chat and local library** — Setup showing multiple local documents, same-name replacement/removal controls, browser-capacity storage wording, Knowledge Chat, and Premium state. Caption: “Query the private library you manage in your browser.”
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
| Premium Knowledge Chat searches multiple local files, supports mutation, and upload does not call the model | Mainline feature commits `0033334` and `dd233a8`; `src/setup.js`; `src/util.js`; `src/focused.js`; `extension/setup.html`. |
| Knowledge storage has no artificial 5 MB application cap | Mainline commit `dd233a8`; `src/setup.js` saves through `chrome.runtime.lastError` and `extension/setup.html` describes browser-available capacity. This is not a claim of unlimited browser storage. |
| A chat bubble opens in a larger view | Mainline commit `b7b415e`; `src/ui-controller.js` adds the accessible larger-view interaction and overlay. |
| Two Premium purchase paths and product-bound entitlement exist | PR #6 commits `9142fe7`, `57db8e5`, `c65af6e`; `README.md:56-61,134-142,232-234`; `src/background.js`; `src/premium-state.js`. No secret is claimed or included. |
| Transcript export is VTT on Leave | `README.md:54-55,118-122`; `src/background.js`; `src/meeting-files.js` in the feature history. |
| Homepage, privacy, and support destinations | `www/index.html`; `www/privacy.html`; `www/support.html`; current repository URL above. |
| Candidate version and package identity | `package.json:3`; `extension/manifest.json:2`; PR #6 head `295d52bd8221660a1c139f173b759f6b4ada1e39`. |

Rejected or deliberately omitted claims: public availability, store review/approval, install/user/revenue numbers, successful payment conversion, testimonials, meeting audio recording, bot participation, automatic summaries, server-side payment verification, and any exact feature claim that fails the candidate-integrity gate.

## Completeness and handoff checklist

- [x] Title, short/long description, positioning, users, use cases, CTA, and release notes.
- [x] Current candidate version and dual Stripe pricing language reconciled without exposing secrets.
- [x] Premium multi-file Knowledge Chat, mutable local library, browser-capacity storage wording, and expanded-view messaging included with evidence boundaries.
- [x] Homepage, privacy, and support destinations recorded as canonical repository destinations.
- [x] Stale 4.4.9 media explicitly rejected for 4.5.6.
- [x] Candidate-integrity gate: claims are tied to PR #6 head `295d52b…` plus the explicitly identified mainline feature commits; no public availability or unlimited-storage claim is made.
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

Use the copy and claim map above for PR #6 head `295d52b…`, after confirming the listed mainline feature commits are included in the release base. Before submission, validate the configured dual-Link build, verify the no-secret bundle, use fresh 4.5.6 media, and independently verify the store listing and public version. The package does not establish public availability, revenue, or payment conversion.

## Current verification record

- PR checkout verified at `295d52bd8221660a1c139f173b759f6b4ada1e39`; package and extension manifest both report `4.5.6`. The feature claims above were cross-checked against mainline commits `0033334`, `dd233a8`, and `b7b415e`.
- `npm test` passed: 32 focused-helper checks, 4 configuration checks, feedback-entry checks, Premium-state checks, and meeting-file checks.
- The mainline storage-cap change removes the hard-coded `KNOWLEDGE_MAX_BYTES` rejection and reports browser storage errors through `chrome.runtime.lastError`; this package does not promise storage beyond the browser's available extension quota.
- Stripe paths are represented by the two build-time variables `STRIPE_ONE_TIME_PAYMENT_LINK` and `STRIPE_WEEKLY_PAYMENT_LINK`; this checkout contains no payment secrets. Link configuration and successful checkout/entitlement redirects remain Release Agent verification items.
