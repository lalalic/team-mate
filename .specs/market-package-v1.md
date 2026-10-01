# MeetMate Market Package — candidate 4.5.6

**Package status:** approved content package for release review, with a mandatory candidate-integrity gate. This package is grounded in PR #6 head `813b0a44562f197b4619956044d179be9c0e8790` and the current durable `main` feature evidence. It does not claim public availability, store approval, installs, users, revenue, or successful payment conversion.

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

Premium Knowledge Chat lets you ask questions across the documents you have imported. You can add multiple supported text/Markdown/JSON/CSV/HTML files, remove them, and replace a document by uploading a newer file with the same name. The library stays in browser storage and its capacity follows the browser instead of an artificial 5 MB product cap. Importing files does not itself make a model request.

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
3. **Checking a brief or spec:** import several local reference files and use Premium Knowledge Chat to query them together.
4. **Managing changing docs:** replace or remove a local document without reconfiguring the meeting.
5. **Keeping a record:** export the captured caption transcript as VTT when leaving.

## Release notes for users

MeetMate 4.5.6 adds a clearer Premium knowledge workflow and a more usable answer surface:

- Ask questions across a mutable, multi-file local Knowledge library.
- Add, replace, and remove supported text-based reference files; storage follows browser capacity.
- Open meeting answers in an expanded view when the in-meeting rail is too small.
- Keep the ask-first boundary: captions alone never trigger a model call.
- Use either the US$1.99 one-time 7-day pass or US$1.99/week recurring Premium path when configured.

## Screenshot and media plan

The existing `4.4.9` captures and fixture are historical evidence only and must not be submitted as 4.5.6 media. A fresh capture set is required after the candidate-integrity gate is cleared.

Required 1280×800 synthetic captures:

1. **Ask and expanded answer** — Teams-style meeting canvas with local-capture status, a concise answer in the rail, and the expanded-answer view open. Caption: “Ask in the meeting, then open the answer when you need more room.”
2. **Knowledge Chat and mutable library** — Setup showing multiple local documents, replace/remove controls, the browser-capacity wording, Knowledge Chat, and Premium state. Caption: “Query the private library you manage in your browser.”
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
| Premium Knowledge Chat supports multiple mutable local files | Current durable `main` feature commits `0033334`/`e4b8d71`; `src/setup.js` on `origin/main` lines 410-514; candidate-integrity gate below. |
| The artificial 5 MB cap is removed and storage follows browser capacity | Current durable `main` commits `dd233a8`/`a8a0317`; `src/setup.js` on `origin/main` lines 388-489; candidate-integrity gate below. |
| Answers can open in a larger view | Current durable `main` commits `b7b415e`/`3cbfa95`; `src/ui-controller.js` on `origin/main` lines 132-205; candidate-integrity gate below. |
| Two Premium purchase paths and product-bound entitlement exist | PR #6 commits `9142fe7`, `57db8e5`, `c65af6e`; `README.md:56-61,134-142,232-234`; `src/background.js`; `src/premium-state.js`. No secret is claimed or included. |
| Transcript export is VTT on Leave | `README.md:54-55,118-122`; `src/background.js`; `src/meeting-files.js` in the feature history. |
| Homepage, privacy, and support destinations | `www/index.html`; `www/privacy.html`; `www/support.html`; current repository URL above. |
| Candidate version | `package.json:3`; `extension/manifest.json:2`; PR #6 head `813b0a44562f197b4619956044d179be9c0e8790`. |

Rejected or deliberately omitted claims: public availability, store review/approval, install/user/revenue numbers, successful payment conversion, testimonials, meeting audio recording, bot participation, automatic summaries, server-side payment verification, and any exact feature claim that fails the candidate-integrity gate.

## Completeness and handoff checklist

- [x] Title, short/long description, positioning, users, use cases, CTA, and release notes.
- [x] Current candidate version and dual Stripe pricing language reconciled without exposing secrets.
- [x] Premium Knowledge Chat, mutable multi-file library, browser-capacity storage, and expanded-view messaging included with evidence boundaries.
- [x] Homepage, privacy, and support destinations recorded as canonical repository destinations.
- [x] Stale 4.4.9 media explicitly rejected for 4.5.6.
- [ ] Candidate-integrity gate: merge or otherwise verify feature commits `0033334`, `dd233a8`, and `b7b415e` are present in the exact release candidate before using those claims in store copy.
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

Use the copy and claim map above only after the candidate-integrity gate is resolved. First verify that the feature commits represented in the package are included in the exact 4.5.6 release candidate; if not, remove those claims or update the candidate. Then validate the configured dual-Link build, verify the no-secret bundle, use fresh 4.5.6 media, and independently verify the store listing and public version. The package does not establish public availability, revenue, or payment conversion.
