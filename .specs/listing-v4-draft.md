# Chrome Web Store — MeetMate 4.5.9+ market package

This package is grounded in the 4.5.9 production build, work-node E2E, live Stripe checkout verification, and fresh 1280×800 demo assets captured on 2026-10-02.

## Positioning

**Primary promise:** Ask your meeting anything.

**Proof:** MeetMate answers from the current Microsoft Teams live captions plus the private knowledge you organized in your browser.

**Trust boundary:** No meeting bot. No audio recording. Captions alone never trigger a model call.

## Store title

`MeetMate — Ask Your Meeting Anything`

36 characters.

## Store summary

`Ask your Teams meeting anything. Ground answers in live captions + your organized private knowledge. No bot. No audio recording.`

128 characters.

## Long description

MeetMate is the in-meeting Q&A copilot for Microsoft Teams. Ask while the conversation is still happening and get a concise answer grounded in two things you control: the live captions in the current meeting and the private knowledge you organized in your browser.

**ASK WHILE THE MEETING IS HAPPENING**

Turn on Teams Live Captions, open MeetMate, then type a question or tap one of your shortcuts. MeetMate keeps recent caption context locally and calls your configured model only when you explicitly ask for an answer.

Use it to answer questions like:
- What are we actually deciding?
- What blocks us from committing to Friday?
- What should I say next?
- Which fact from my brief matters here?
- What question should I ask before we move on?

**GROUND ANSWERS IN YOUR PRIVATE KNOWLEDGE**

Upload private reference files in Settings, then click **Organize now**. MeetMate uses structured tools to build a two-level Knowledge Tree. Open a leaf to inspect its organized content or use **Test Q&A** before your meeting.

During a meeting, MeetMate searches the organized leaf content only when private reference material can materially improve the answer. Meeting speech and private reference material stay distinct so the assistant can tell you when the evidence is missing or conflicting.

The Knowledge workflow accepts arbitrary uploaded files; what a model can read depends on the configured provider. PDF and DOCX are supported by the current tested workflow.

**YOUR SHORTCUTS, YOUR MODEL**

Create, rename, rewrite, show, or hide meeting shortcuts. Free users can show up to 3 shortcuts in the meeting rail. Premium removes that shown-shortcut limit.

MeetMate is BYOK: configure a compatible model endpoint and API key, including OpenRouter. The necessary meeting context and selected knowledge are sent to that provider only for explicit AI operations such as Ask, Test Q&A, or Organize now.

**MEETING-READY OUTPUTS**

- Concise answers designed to be read while someone else is still speaking
- Larger answer view when the meeting rail is too small
- Local VTT transcript export
- Optional structured end-of-meeting report with Premium

**FREE CORE, OPTIONAL PREMIUM**

Free remains useful: ask live Teams captions, use private knowledge, and show up to 3 shortcuts.

Premium expands the workflow:
- no artificial character limit on the final organized knowledge
- more than 3 shown shortcuts
- structured end-of-meeting report

Two production Stripe-hosted choices are available:
- **US$1.99 one-time** — Premium for 7 days, then it expires automatically
- **US$1.99/week** — recurring Premium until canceled

Premium activation and renewal are verified server-side against Stripe. No Stripe secret is shipped in the extension.

**PRIVATE BY DESIGN**

MeetMate runs in your Chrome browser. It does not join the call as a bot and does not record meeting audio. Captions, settings, uploaded knowledge, organized knowledge, and local Premium entitlement state are stored locally in Chrome unless you explicitly invoke an AI operation that needs to send context to your configured model provider.

## Reviewer test instructions (≤500 chars)

`No MeetMate account is required. In Settings, configure a compatible model endpoint/API key (OpenRouter is supported). In a Microsoft Teams meeting in Chrome, enable Live Captions, open MeetMate, then ask a question or use a shortcut. Knowledge: Settings > Knowledge > upload a file > Organize now > open a tree leaf or use Test Q&A. Premium buttons open live Stripe checkout; purchase is not required to review the free/core workflow.`

## Chrome Web Store field audit

- Distribution: **Public** — correct.
- Payments: **Contains in-app purchases** — correct.
- Regions: **All regions** — current configuration.
- Privacy policy URL: present.
- `storage`: stores settings, transcript buffer, local knowledge, organized tree, and entitlement state.
- `activeTab`: allows explicit user-initiated interaction with the current Teams tab.
- `tabs`: locates/focuses Teams tabs and opens user-requested setup/payment pages.
- `downloads`: exports the captured transcript as VTT.
- `unlimitedStorage`: supports user-selected local knowledge files and organized knowledge that can exceed the default extension storage quota; it does not imply unlimited physical browser storage.
- Host permissions: Teams pages plus user-configured provider endpoints are needed for caption capture and explicit AI/provider calls.
- Remote code: none.
- Test instructions: currently blank in the Web Store and locked while 4.5.9 is Pending review. Apply the text above after the review completes; do not cancel/restart the current review just to change it.

## Fresh screenshot set

All three assets are 1280×800 and use synthetic meeting/customer content while depicting only already-validated 4.5.9 behavior.

1. `www/screenshots/4.5.9/01-ask-your-meeting.png`
   - Caption: **Ask while the meeting is happening — grounded in live captions + your private knowledge.**
   - Shows Teams-style live-caption context, concise Ask response, knowledge grounding, and no-bot/no-audio boundary.
2. `www/screenshots/4.5.9/02-knowledge-tree.png`
   - Caption: **Turn private files into a two-level Knowledge Tree, then test Q&A before the meeting.**
   - Shows PDF/DOCX files, manual Organize now, two-level tree, leaf content, Test Q&A, and the Free 5,000-character boundary.
3. `www/screenshots/4.5.9/03-premium-options.png`
   - Caption: **Choose a 7-day pass or weekly Premium — the useful core stays free.**
   - Shows the US$1.99 one-time 7-day and US$1.99/week choices plus server-verified entitlement behavior.

## Demo video

`www/media/meetmate-demo-4.5.9.mp4`

- 1280×800 H.264
- 16 seconds
- Three-part story:
  1. Ask your Teams meeting anything.
  2. Organize private files into a Knowledge Tree.
  3. Upgrade only when you need more.
- Uses the same synthetic content and visual claims as the screenshot set.

## Acquisition message hierarchy

1. **Hook:** Ask your meeting anything.
2. **Differentiator:** Live captions + your organized private knowledge.
3. **Trust:** No bot. No audio recording. No model call just because captions arrive.
4. **Depth:** Knowledge Tree, Test Q&A, shortcuts, larger answers, VTT export, structured report, BYOK.
5. **Monetization:** Free core; US$1.99 7-day or US$1.99/week Premium when the user needs more.

## Current store-state boundary

Chrome Web Store item `immkojolaicdjhkbbhkldmndhfjbehmf` has 4.5.9 submitted and is **Pending review** with automatic publication enabled after approval. Do not cancel/restart that review solely to change marketing metadata. After approval, verify the exact public version, then apply the approved metadata/test instructions and re-check the rendered public listing before acquisition work.
