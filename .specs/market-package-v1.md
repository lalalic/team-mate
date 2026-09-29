# MeetMate Market Package v1

**Package status:** approved for release review, with the evidence and external-verification gaps listed below.

**Product:** MeetMate Chrome extension for Microsoft Teams
**Reviewed product identity:** extension manifest version `4.4.9`. The exact PR head is release/review evidence resolved from Git/GitHub at review time; it is intentionally not embedded in this mutable package.
**Package owner:** Market Agent
**Audience:** people who need a concise, private answer while a Teams meeting is still happening.

## Positioning

### One-line value statement

MeetMate lets you ask a Microsoft Teams meeting what matters now and get a concise answer grounded in the live captions and reference material you chose to keep in your browser.

### JTBD framing

- **Who:** Individual meeting participants using Teams in Chrome who need to follow a fast discussion, respond clearly, or check a private brief without inviting a meeting bot.
- **Why:** They need useful context in the moment, but do not want automatic AI interruptions, post-meeting-only notes, or a second person/bot in the call.
- **Before:** They rely on memory, manual note-taking, a separate chat window, or a generic meeting recorder/summarizer; each adds context switching or answers after the moment has passed.
- **How:** MeetMate captures Teams captions locally, lets the participant type an Ask or tap a configurable shortcut, and sends context only for that explicit request. Uploaded text/Markdown/JSON/CSV/HTML knowledge remains local until it is needed for an Ask.
- **After:** The participant can get a short, meeting-readable answer, a suggested reply or question, and (when enabled) source/provenance context without changing the meeting flow.
- **Alternatives:** Teams/Copilot or other tenant tools, meeting bots and note-takers, a second AI tab, or manual notes. MeetMate’s evidence-backed distinction is in-tab, ask-first Q&A with no bot joining the meeting; do not claim it replaces those products or has broader transcription coverage.

### Positioning statement

For Teams participants who need to think and respond in real time, MeetMate is an ask-first meeting copilot that turns the current caption stream and selected private reference material into concise, grounded answers. Unlike meeting bots and post-call summarizers, it runs in the participant’s Teams tab and does not call the model merely because a caption arrived.

## Chrome Web Store copy

### Title

`MeetMate — Ask Your Meeting Anything`

### Short description

`Ask your Teams meeting anything. Get concise answers grounded in live captions and your own docs. No bot; nothing sent until you ask.`

### Long description

MeetMate is a grounded Q&A assistant for Microsoft Teams meetings. It runs in your Teams tab and helps you ask a question while the discussion is still happening.

**ASK FIRST, STAY IN THE MEETING**

MeetMate captures Teams live captions into a local transcript. Caption arrival does not call an AI model, generate suggestions, or start an autonomous loop. The model runs when you type an Ask or tap a shortcut.

**ANSWERS GROUNDED IN THE CONTEXT YOU CHOOSE**

Each Ask can use the current meeting transcript and relevant material from your local Knowledge library. MeetMate keeps meeting speech and reference material distinct, is instructed not to invent unsupported facts, and can say when the available context does not support an answer.

**A SMALL RAIL FOR LIVE QUESTIONS**

The default visible shortcuts are Reply, Current topic, and Question. Facts, Challenge, Decisions, Actions, My commitments, and Minutes are available in the shortcut library and can be shown or rewritten in Setup. Free users can show up to three shortcuts; Premium removes that shown-shortcut limit.

**BRING YOUR OWN KNOWLEDGE**

Upload `.txt`, `.md`, `.json`, `.csv`, or `.html` reference files in Setup. Uploading stores the text locally and does not make a model request. When a question needs it, MeetMate can search the local library and use relevant passages.

**OPTIONAL PREMIUM**

Premium is activated through the configured Stripe Payment Link. The implemented Premium boundary provides answer provenance, a structured end-of-meeting report, and unlimited shown shortcuts. MeetMate stores a successful Stripe Checkout session as a local entitlement; no Stripe secret is shipped in the extension. Pricing is intentionally omitted here until an owner-approved price is supplied.

**MEETING-READY DETAILS**

- Works with Teams live captions; no meeting bot or audio recording is claimed.
- Answers are designed to be short enough to read while someone else is talking.
- The transcript can be exported as a `.vtt` file when the meeting ends.
- Support and privacy links are supplied in the package manifest below.

MeetMate does not claim to summarize every meeting automatically, remember past meetings, or answer beyond the transcript and reference evidence available to the current Ask.

## Target users and use cases

1. **Participant preparing a response:** tap Reply to draft concise wording from the current discussion.
2. **Participant orienting themselves:** ask what the current topic is or use Current topic to catch up.
3. **Participant deciding what to ask next:** use Question to formulate a focused follow-up.
4. **Participant checking a brief or spec:** upload local reference material and ask about it when relevant.
5. **Participant needing a durable record:** export the captured caption transcript as VTT at Leave.

## Release notes for users

MeetMate 4.4.9 focuses the product on ask-first, grounded Q&A:

- Capture Teams captions locally without triggering model calls on caption arrival.
- Ask from the meeting rail or use configurable shortcuts.
- Ground answers in the current transcript and optional local Knowledge.
- Export the meeting transcript as VTT when you leave.
- Use the Stripe-only Premium flow for provenance, structured reports, and unlimited shown shortcuts when configured.

## Screenshot and media plan

No screenshot is approved in this package. The repository contains `www/team-mate-demo.mp4` and `www/screenshots/logo-128.png`, but the video has not been visually reviewed in this task and the logo is not a product-workflow screenshot. Do not submit either as a feature screenshot without visual QA.

Create and approve these screenshots from the reviewed 4.4.9 build:

1. **Ask in context:** Teams meeting with the MeetMate rail, captions, one typed question, and a concise answer. Caption: “Ask while the meeting is happening; the answer stays in the rail.”
2. **Ask-first privacy boundary:** live captions arriving with no answer/request activity, plus the rail’s “nothing is sent until you ask” state. Caption: “Captions are captured locally; model requests begin with your Ask.”
3. **Knowledge:** Setup → Knowledge showing a safe synthetic `.md` document and the search/answer provenance state. Caption: “Use your own reference material without uploading it on import.”
4. **Shortcuts:** Setup → Shortcuts showing editable labels/prompts and the three-shortcut free limit. Caption: “Shape the one-tap questions for your meetings.”
5. **Premium:** Premium status plus provenance and structured-report controls, using test/synthetic data only. Caption: “Optional Premium adds provenance, structured reports, and unlimited shown shortcuts.”

The release agent should use synthetic meeting text and redact provider/account details. No screenshot may contain real meeting content, API keys, Checkout session IDs, or confidential documents.

### Demo brief

Use the existing `www/team-mate-demo.mp4` only after a visual/product QA pass confirms it shows the current ask-first flow and does not imply removed autonomous suggestions, automatic minutes, or unsupported Premium behavior. If it is stale, replace it with a short walkthrough: install/setup → turn on Teams captions → show no request on caption arrival → type Ask → show grounded answer → open Knowledge/Shortcuts → optionally show Premium controls. Asset approval is **pending**.

## CTA and destinations

- **Primary CTA:** `Install MeetMate free for Chrome`.
- **Secondary CTA:** `Ask your first meeting question`.
- **Homepage / public product destination:** `https://github.com/lalalic/team-mate`.
- **Chrome Web Store destination configured in source:** `https://chromewebstore.google.com/detail/immkojolaicdjhkbbhkldmndhfjbehmf` (listing/version not verified here).
- **Privacy destination:** `https://github.com/lalalic/team-mate` (repository page is the canonical public destination for this release).
- **Support destination:** `https://github.com/lalalic/team-mate` (repository page is the canonical public destination for this release).
- **Payment destination:** configured at build time through `STRIPE_PAYMENT_LINK`; do not publish a placeholder or claim that checkout is live until the release agent verifies the configured production build.

## Claim-to-evidence map

| Material claim | Evidence in reviewed checkout |
| --- | --- |
| Teams captions are captured locally and caption arrival does not call the model | `README.md:11-21,35-53`; `src/util.js:1-4`; focused tests cover zero-call caption behavior in `README.md:204-210` |
| Ask and shortcut actions produce grounded answers from meeting context | `README.md:23-33,40-47`; `src/focused.js:191-242,389-447`; `src/util.js:233-283` |
| Knowledge imports are local and supported file types are bounded | `README.md:50-53`; `extension/setup.html:263-285`; `src/setup.js:382-471` |
| Default visible shortcuts and free/Premium limit | `src/focused.js:16-65`; `extension/setup.html:252-258`; `docs/premium-publishing-plan.md:63-79` |
| Transcript export is VTT on Leave | `README.md:54-55,118-122`; `src/background.js:96-117` |
| Premium is Stripe-only, with local soft entitlement and no Stripe secret in the bundle | `README.md:56-61`; `src/background.js:1-47`; `src/premium-state.js:1-36`; `docs/premium-publishing-plan.md:43-60` |
| Privacy/support wording and configured destinations | `www/index.html:105-110,211-218`; `www/privacy.html:35-45`; `www/support.html:24-39` |
| Reviewed release identity | `extension/manifest.json:1-5`; exact PR head must be resolved externally from Git/GitHub at review time |

Rejected or deliberately omitted claims: public availability, install/user/revenue numbers, review state, a specific price, subscription/lifetime terms, customer testimonials, automatic meeting summaries/minutes, audio recording, bot participation, server-side payment verification, and any feature not backed by the map above.

## Completeness and handoff checklist

- [x] Product title, subtitle/short description, long description, positioning, users, use cases, CTA, release notes.
- [x] Current shortcut defaults and Premium boundary reconciled against implementation.
- [x] Claim-to-evidence map and rejected-claim list included.
- [x] Homepage, privacy, and support use the canonical GitHub repository page.
- [x] Screenshot narrative and safe capture instructions prepared.
- [ ] Product screenshots captured and visually approved.
- [ ] Demo walkthrough verified against current behavior.
- [x] Canonical GitHub repository page reachability verified; Chrome Web Store listing exact-version verification remains required.
- [ ] Configured Stripe production build and successful checkout redirect verified.
- [ ] Exact public extension version 4.4.9 verified after publication.
- [x] `package.json`, `package-lock.json`, and the extension manifest all report release version 4.4.9.

## Package manifest

| Artifact | Status | Downstream use |
| --- | --- | --- |
| `.specs/market-package-v1.md` | **Approved content package** | Release listing copy, claim review, launch preparation |
| `package.json`, `package-lock.json`, and `extension/manifest.json` version 4.4.9 | **Reviewed source fact** | Release version identity; verify exact published version |
| `www/index.html`, `www/privacy.html`, `www/support.html` | **Existing, not publication-verified** | Homepage/privacy/support destinations |
| `www/team-mate-demo.mp4` | **Pending visual QA** | Optional demo asset only |
| `www/screenshots/logo-128.png` | **Existing logo, not feature screenshot** | Site poster/icon only; not a store screenshot |
| Chrome Web Store screenshots | **Manual/pending** | Required before a truthful store submission |

## Exact handoff to Release Agent

Use this package as the source of listing copy and claims. Before submission, capture the five synthetic screenshots, verify the demo or mark it unused, validate the configured Stripe build without exposing secrets, reconcile the package/manifest version decision, use the canonical repository page for public homepage/privacy/support, and publish only after exact version `4.4.9` and actual store availability can be observed. Do not infer public availability, revenue, or payment conversion from this package.
