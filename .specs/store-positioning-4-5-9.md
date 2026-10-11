# MeetMate Market Package — 4.5.9 Store Positioning

**Package status:** approved content package; **not approved for listing application while 4.5.9 review is pending**.
**Canonical target:** Chrome Web Store item `immkojolaicdjhkbbhkldmndhfjbehmf`.
**Evidence base:** GitHub tag `v4.5.9` (`6ced62c21f7477bf18736fc7065ed4edb04bd874`), current `main` (`3a8b70a785183314f414eca55f15773dfd2c3e36`), the authenticated CWS facts recorded in durable task `meetmate-459-store-positioning-package`, fresh public-listing retrieval, and the published 4.5.9 release artifact.
**Root cause:** not applicable. The implemented solution is this completed, evidence-backed Market Package.
**Pricing and scope:** no pricing, payment implementation, release package, or pending-review change is proposed.

## Current live-surface audit

| Surface | Current evidence | Audit result |
|---|---|---|
| Public CWS listing | Fresh retrieval at 2026-10-02 21:40 UTC observed title **MeetMate — Live Facts, Knowledge, Speaking Coach & Memory for Teams**, summary **Live facts, your knowledge, a speaking coach, meeting memory — inside Teams. Event-driven AI, ~10× cheaper. No bot, no audio.**, version **4.2.0**, updated **May 19, 2026**, and **Offers in-app purchases**. | **Commercially unsafe.** It promotes removed speaking-coach/memory/suggestion behavior and an unsupported price comparison. Do not promote it. |
| Authenticated CWS dashboard | Durable task evidence recorded on 2026-10-02: item `immkojolaicdjhkbbhkldmndhfjbehmf`, 4.5.9 submitted, **Pending review**, auto-publish after approval; Distribution is Public with in-app purchases in all regions; `unlimitedStorage` justification completed; Test instructions blank. | Submission must not be canceled or restarted for marketing text. Listing fields remain unavailable for application until approved and independently verified. |
| GitHub release artifact | `v4.5.9` asset `team-mate.zip`, SHA-256 `f97c0d23b5c158f10d50126e644039681cbfe74c129116b4db538571d84902e8`; ZIP integrity passed; manifest version is 4.5.9; permissions include `unlimitedStorage`. | Product/release claims are grounded to this exact artifact. |
| Payment surfaces | The release bundle contains configured `buy.stripe.com` checkout links and the `stripe.qili2.com` entitlement host; direct retrieval reached Stripe Checkout for both links, and no Stripe secret or checkout token was found. Durable task evidence separately identifies the two live surfaces as the $1.99 one-time and $1.99/week recurring paths. | Payment wording may state both public paths. This package makes no purchase, conversion, entitlement, or revenue claim. |

## Positioning

**Store title (36 characters):**

`MeetMate — Ask Your Meeting Anything`

**Summary (127 characters):**

`Ask your Teams meeting anything. Answers grounded in live captions and your files. No bot or audio; nothing sent until you ask.`

**One-line value statement:**

MeetMate turns live Teams captions and your private reference files into grounded, on-demand answers—without a meeting bot or audio recording.

**Target users and jobs:**

- Team members who need a precise answer while a meeting is happening.
- People who bring plans, specs, policies, or notes to meetings and do not want those files copied elsewhere.
- Users who want a narrowly scoped assistant, not an always-on meeting recorder or autonomous agent.

**Recommended package-owned English `appName`:**

`MeetMate — Ask Your Meeting Anything`

The submitted package-owned name is 57 characters and exceeds the 45-character store limit. The recommended 36-character value is ready for a later package release, after the current review completes and its post-approval gates pass. Preserve the exact `key`, item ID, and release workflow; do not repackage or resubmit 4.5.9 solely for this copy.

**Recommended package-owned English `appDesc`:**

`Ask your Teams meeting anything. Grounded answers from live captions and your files. No bot or audio; nothing sent until you ask.`

This stays within the Chrome extension short-description limit and can be updated in the next package release under the same post-approval gate.

## User release notes

**Use only after the post-approval application gate passes.**

- Ask questions from live Teams captions, with grounded answers and clear limits when context is missing.
- Organize local reference files into a two-level Knowledge Tree, open each leaf, and run Test Q&A.
- Export the captured transcript as `.vtt` when you leave.
- Premium removes the Free 5,000-character organized-knowledge limit and three-shortcut display limit, and adds answer provenance plus the optional structured report.
- Still no meeting bot, audio recording, or caption-triggered autonomous calls.

## Long description

```text
ASK YOUR MEETING, NOT A CHATBOT

MeetMate is a grounded Q&A assistant inside your Microsoft Teams tab. It reads
the live captions that Teams already provides and answers only when you ask.
There is no meeting bot and no audio recording.

CAPTIONS STAY LOCAL UNTIL YOU ASK

Caption text is appended to a local transcript. Caption arrival never calls an
AI model, never creates suggestions, and never starts an autonomous loop.
MeetMate sends a model request only for a typed Ask or shortcut Ask.

ANSWERS FROM WHAT WAS ACTUALLY SAID

Each request carries a bounded, recent meeting transcript. MeetMate instructs
the model to keep meeting speech and reference material separate, avoid
unsupported facts, and say plainly when the available context does not answer.

ORGANIZE YOUR PRIVATE KNOWLEDGE

Upload reference files to your browser's local extension storage. Nothing is
published by MeetMate. Click Organize now when you are ready: MeetMate builds a
strict two-level Knowledge Tree, opens each leaf for review and Test Q&A, and
uses that organized content for in-meeting knowledge search.

Free users can organize up to 5,000 final characters. Premium removes that
artificial organized-knowledge limit. Uploaded files remain local in Chrome
extension storage; available browser/device capacity still applies.

MAKE YOUR OWN SHORTCUTS

Ask instantly with editable, reusable prompts. Free shows up to three
shortcuts; Premium removes the three-shortcut display limit.

WORK THE WAY THE MEETING WORKS

• Open a concise answer in a larger view without leaving the discussion.
• Export the captured transcript as .vtt when you leave.
• Generate an optional structured end-of-meeting report.
• Use your own OpenAI-compatible provider: MeetMate is BYOK/provider-ready,
  keeps the provider key in local extension storage, and sends it only to the
  provider you configure.

PREMIUM, YOUR CHOICE

Upgrade through Stripe for US$1.99 for a 7-day pass or US$1.99 per week as a
recurring subscription. Checkout is hosted by Stripe. No card is stored by
MeetMate, and pricing is shown before you confirm payment.

DELIBERATELY NOT INCLUDED

No meeting bot, no audio recording, no always-on suggestion engine, no
cross-meeting memory, and no autonomous caption-triggered model calls.
```

## Reviewer test instructions

```text
Install built 4.5.9. Setup: connect BYOK/provider; upload .md; click Organize now; open a tree leaf and run Test Q&A. Join Teams with live captions: confirm caption count grows with no model call. Ask covered and uncovered questions; check grounded/insufficient answers and source labels. Try a custom shortcut, larger answer, organized-knowledge search, and Leave VTT export. Inspect buy surfaces; do not purchase.
```

Length: 415 characters, including spaces.

## Permission justifications

- `storage` — stores local settings, provider configuration, the current meeting transcript buffer, Knowledge Tree state, and local Premium entitlement in `chrome.storage.local`.
- `unlimitedStorage` — raises Chrome's normal extension-storage quota so users can retain larger private reference files locally. It does not grant arbitrary disk access, upload files by itself, or promise storage beyond the browser/device's actual capacity.
- `activeTab` / `tabs` — lets the action open or focus the Teams tab and support the in-meeting rail/popup flow. It does not read or archive meeting audio.
- `downloads` — saves the user-initiated `.vtt` transcript export when leaving a meeting.
- Teams host permissions — inject the rail and caption observer only on the declared Microsoft Teams web surfaces.
- `https://*/*` and local-loopback permissions — support user-configured OpenAI-compatible/BYOK provider endpoints, including local endpoints. Network requests are for explicit asks, model discovery, explicit Knowledge organization, or entitlement refresh; provider keys stay local and go only to the configured provider.

## Premium and payment wording

Use exactly these boundaries:

- **One-time Premium:** US$1.99 for a 7-day pass, paid through Stripe Checkout.
- **Weekly Premium:** US$1.99 per week, recurring, with Stripe-hosted authorization and checkout.
- Free organized knowledge is capped at 5,000 final characters; Premium removes that limit.
- Free shows up to 3 shortcuts; Premium removes the three-shortcut display limit.
- Premium enables answer provenance/sources and the optional structured end-of-meeting report.
- One-time access lasts seven days. Weekly entitlement is refreshed server-side and expires when the subscription becomes inactive.
- Never describe activation as a completed purchase, a completed entitlement, revenue, conversion, or an achieved retention outcome. Checkout and authorization are user actions; successful activation must be observed separately.

## Screenshot captions and shot list

**Media status:** none of these screenshots is produced or approved yet. Do **not** reuse the historical 4.4.9 captures. Produce fresh captures from 4.5.9/current surfaces with synthetic, non-confidential content and no real personal data.

1. **Ask grounded in the live meeting** — Teams rail shows recent caption context, an explicit user question, and a concise grounded answer that distinguishes transcript from document evidence. Caption: “Ask while the meeting is still happening.”
2. **No autonomous model calls** — caption count increases while the request log/relay remains unchanged until an Ask. Caption: “Captions stay local until you ask.”
3. **Two-level Knowledge Tree** — local files, Organize now, strict two-level tree, one open leaf, and Test Q&A. Caption: “Organize your files, then test each leaf.”
4. **Organized-knowledge search and sources** — a meeting answer includes document/source provenance. Caption: “Answers can show where support came from.”
5. **Shortcuts and Free/Premium boundary** — Setup shows editable shortcuts and the Free three-shown versus Premium unlimited display state. Caption: “Make reusable asks; Premium removes the display cap.”
6. **Larger answer, report, and VTT** — larger answer view plus optional structured report and Leave-to-`.vtt` flow. Caption: “Read more, report optionally, export the transcript.”

Store production constraints: use Chrome Web Store-approved dimensions, keep text crop-safe, match the actual light/dark UI state, avoid invented UI, and remove names, emails, customer content, meeting titles, keys, and URLs that are not public product destinations. Produce a 440×280 tile only after the six screenshots are approved; do not invent a product graphic before visual QA.

## Demo / walkthrough brief

**Status:** optional and pending. A 45–60 second walkthrough should show, in order: captions accruing with no model call → explicit Ask → grounded answer → local upload and Organize now → leaf Test Q&A → larger answer/report → Leave VTT export. It must not show a real meeting, claim a bot is present, or imply automatic suggestions. Approved video is not required to update store text, but it must not be published before the exact public version/copy gate passes.

## Destination links

- Install/listing: `https://chromewebstore.google.com/detail/immkojolaicdjhkbbhkldmndhfjbehmf`
- Privacy Policy: `https://lalalic.github.io/team-mate-pages/privacy.html`
- Support: `https://lalalic.github.io/team-mate-pages/support.html`
- Homepage/developer website: **none is verified as a current market-owned destination.** Treat the CWS detail page as the only install destination until Release Agent verifies an owner-provided website.

Release Agent must verify each listed URL resolves from the actual public destination after approval. This package does not authorize creating, publishing, or selecting an unverified homepage.

## Claim-to-evidence map

| Material claim | Evidence and boundary |
|---|---|
| Live Teams captions append locally; captions alone never call the model | `src/content.js`, explicit ask path in `src/util.js`, README architecture, and focused tests at `v4.5.9`. |
| Typed or shortcut Ask is grounded in bounded transcript and knowledge | `src/focused.js` context/message builders and helper tests; no autonomous caption-triggered request. |
| Configurable shortcuts; Free 3 shown / Premium unlimited shown | Current Setup/Premium UI and shortcut normalization/status tests. |
| Private reference files stay in local Chrome extension storage | `chrome.storage.local` implementation, Setup Knowledge copy, and meeting-file/storage tests. Browser/device capacity remains the real boundary. |
| Organize now creates a strict two-level Knowledge Tree; leaves support Test Q&A | Manual `Organize now` path, `set_knowledge_tree` and `set_knowledge_node_content`, leaf/Test Q&A UI/tests. |
| In-meeting search uses organized leaf content | `search_knowledge` implementation, Knowledge Tree retrieval, and focused helper tests. |
| Free 5,000-character organized limit; Premium removes it | `reorganizeKnowledge({ maxChars: paid ? 0 : 5000 })` and `capOrganizedKnowledge` at `v4.5.9`. |
| Leave exports `.vtt` transcript | `src/background.js`, `src/meeting-files.js`, and lifecycle tests/manual flow. |
| Larger answer view | UI controller larger-answer/overlay implementation and manual flow. |
| Optional structured end-of-meeting report | Premium report UI/implementation at `v4.5.9`; optional, not automatic. |
| BYOK/OpenAI-compatible provider configuration | Setup provider UI, direct service-worker provider HTTP, local key wording, and loopback/custom endpoint permissions. |
| No meeting bot or audio recording and no cross-meeting memory | Manifest/content-script scope, deliberate product non-features, and absence of recording/bot/cross-meeting memory implementation. |
| $1.99 one-time 7-day and $1.99/week recurring Premium | Configured 4.5.9 bundle payment references plus authenticated live checkout/authorization evidence recorded in the durable release task. No conversion or entitlement result is claimed. |

## Rejected claims

- “10× cheaper”, “speaking coach”, “meeting memory”, “live minutes”, and autonomous suggestions: unsupported or describe removed behavior.
- Unlimited storage/device capacity, automatic backups, private-file cloud sync, or security guarantees beyond local extension storage.
- Any meeting summary, minutes, or memory claim beyond the explicitly requested/optional report path.
- Public approval, public 4.5.9 availability, installs, users, revenue, conversions, testimonials, ratings, or retention.
- Any audio-recording, meeting-bot, or always-listening capability.

## Current lock and post-approval application gate

**Locked while 4.5.9 review is pending:** title, summary, detailed description, screenshots/media, category, Test instructions, and any listing metadata that would alter the submitted review state. Distribution, in-app-purchase declaration, region selection, Privacy Policy, and support links are also not to be changed while the review is pending. The blank Test instructions can be applied only through the post-approval gate below; do not edit the item now.

Apply metadata only when all fresh post-approval evidence is true:

1. Authenticated dashboard for `immkojolaicdjhkbbhkldmndhfjbehmf` reports **Published — public** for the exact submitted **4.5.9** artifact, with automatic publication status observed (not inferred from submission).
2. The public detail page resolves to item `immkojolaicdjhkbbhkldmndhfjbehmf`, reports version **4.5.9**, and no longer exposes the stale title/summary or removed-feature copy.
3. A timestamped authenticated-dashboard capture/hash or console-readable state records the exact current Test instructions and each field to be replaced.
4. After field updates, a fresh public-page retrieval records the exact approved title, summary, description, permission copy, links, and every approved screenshot; visual QA passes with no personal data or invented UI.
5. Privacy and support URLs resolve publicly; Distribution remains Public with in-app purchases and all regions unless the owner explicitly changes it.
6. If package-owned `appName`/`appDesc` changes are included, they are built and validated as a new version—never injected into an already-published 4.5.9 artifact—and exact public availability is verified for that new version.

## Acquisition readiness

Do not spend money or launch promotion while the public listing is stale or review is pending. The first zero-cost readiness sequence is:

1. Pass the post-approval gate and independently verify the exact public 4.5.9 fields/media.
2. Refresh homepage/privacy/support copy only where it already exists and is authorized; remove stale claims and align payment wording.
3. Prepare organic launch content around one proof: ask-first Q&A with live captions and private files. Reuse only approved screenshots/copy and clearly state Teams live captions are required.
4. Start measurement with existing CWS dashboard and Stripe dashboards only: listing views, new installs, one-time versus weekly checkout starts, completed purchases, activation/support failures, and ratings/review themes.
5. Do not scale promotion until exact public availability/copy is verified and at least one completed payment plus observed activation exists. Below either signal, revise positioning before code or spend work.

## Package manifest

| Artifact | Status | Downstream use |
|---|---|---|
| `.specs/store-positioning-4-5-9.md` | **Approved content package; application locked** | Release Agent copy and media checklist after review approval |
| `v4.5.9` / `team-mate.zip` | **Published GitHub release artifact; CWS review pending** | Product/release identity and claim boundary |
| `www/screenshots/meetmate-4.4.9-*.png` | **Rejected historical media** | Do not submit |
| Fresh screenshot set and tile | **Not produced** | Required after visual QA and before listing media application |
| Demo walkthrough | **Not produced; optional** | Only after public version/copy verification |
| Existing homepage/privacy/support pages | **Destinations only; publication not re-verified in this package** | Release Agent link verification |

## Deviations and unresolved evidence

This package updates only repository-owned market content. It does not edit package metadata now, even though it recommends later `appName`/`appDesc` changes, because 4.5.9 review must remain undisturbed and the current managed checkout is not the 4.5.9 release head. The live public consumer page still showed 4.2.0/stale copy while the durable authenticated dashboard evidence described 4.5.9 pending; both observations are retained. Fresh authenticated screenshots, a post-approval published 4.5.9 dashboard/public state, fresh visual media, completed purchase/activation, and current CDN/publication verification remain unresolved and must not be inferred.
