# Chrome Web Store — MeetMate v4 listing draft

Current public version 3.0.2 → local manifest is 4.0.0. This rewrite refreshes
the listing to sell v4's differentiator: a **reactive AI sidekick** that
behaves differently depending on whether you're listening, being addressed,
speaking, or asking. No bot joins your call, nothing leaves your browser.

## Competitive positioning

| Competitor (top "similar")        | Stars | Model                                 |
| --------------------------------- | ----- | ------------------------------------- |
| Tactiq — AI note taker            | 4.8 ★ | Sends a bot into the call, post-notes |
| himala — Meeting Assistant        | 5.0 ★ | Prep + post-call notes                |
| FuseBase PRO — AI note taker      | 4.3 ★ | Recorder + transcriber                |
| Sharpen AI — meeting summary      | —     | Post-call summary only                |
| **MeetMate (us)**                 | TBD   | **In-call live AI sidekick, no bot**  |

Our edge: we run inside YOUR Teams tab — no permission grant for a meeting bot,
no admin headache, no enterprise license. The AI watches captions and gives
you topic chips the moment someone says your name.

## Title (45 char max)
`MeetMate — Live AI Sidekick for MS Teams` (41 char) — punchier, "Sidekick"
distinguishes from note-taker bots.

(Alt safer: `MeetMate: MSTeams Live AI Meeting Assistant` (45) — keeps the
existing keyword "MSTeams" if SEO matters more than freshness.)

## Summary (132 char max, shown in search results)
> Live AI sidekick inside your Microsoft Teams meeting. Topic chips when
> you're mentioned, drafts when you speak. No bot. (124)

Alt (keyword-heavy):
> AI meeting assistant for Microsoft Teams. Live captions + topic chips +
> auto minutes. Runs in your browser. No bot in the call. (130)

## Detailed description (16k char max — keep it scannable)

```
MeetMate is the live AI sidekick that sits next to your Microsoft Teams
meeting — not a bot in the call, not a post-meeting summary email. It watches
your Live Captions and reacts the way a thoughtful chief-of-staff would:
quiet when others are talking, helpful the second your name is mentioned,
ready with topic branches when YOU start to speak.

────────────────────────────────────────
FOUR REACTIVE STATES — one extension that knows what you need next
────────────────────────────────────────

🟢 LISTENING — Others are talking
A clean side rail of facts (📌), open questions (❓) and chat suggestions (💬)
quietly accrues. No center-stage interruption. Glance, don't react.

🟡 MENTIONED — Someone says your name
MeetMate pops a center panel with three "Topic — body" branches you could
respond with. Tap one to expand; the others fade. The badge shows who's
addressing you. You answer with intent, not improv.

🔵 SPEAKING — You hold the floor
Three live topic branches keep refreshing every ~8 seconds so you always
have a clean follow-up direction. Two NEW branches replace the old ones if
the conversation drifts — never the same advice twice.

🎯 ATTENTION / ❓ QUICK HELP — You ask, MeetMate answers
Tap 🎯 to lock the AI on a specific moment, or hit ❓ for a one-shot answer
to "what should I say next?". The center panel becomes a single targeted
chip — no rail noise, no scrolling.

────────────────────────────────────────
WHAT MAKES MEETMATE DIFFERENT
────────────────────────────────────────

★ No bot in your call
MeetMate runs in your own Teams tab. No "External Bot" warning to your
counterparts. No admin approval. Works on personal Microsoft accounts where
M365 Copilot can't go.

★ Cross-meeting memory
Recurring 1:1s and standups remember last week's commitments automatically.
The 📌 chips in your first state cite the exact prior meeting and date.
Memory stays in chrome.storage.local — never on a server.

★ Live minutes that update in place
A collapsible panel keeps Summary, Decisions, Action Items and Open
Questions current as captions stream. No more "I'll send notes after"
emails — they're written by the time the call ends.

★ Built-in chat (📥 Ask anything)
Mid-meeting research: who is this person, draft a reply, summarize the last
5 minutes. Replies update live as the conversation evolves.

★ Pay-as-you-go via Stripe — no subscription
$1, $10 or $100 top-ups. Server-verified credits, no enterprise license.

Also bundled
• Translate / polish (🌐) — speak in any of 8 languages, read the floor in
  yours. Optional helper, not the main act.

────────────────────────────────────────
PRIVACY — Yours stays yours
────────────────────────────────────────

• Captions are processed for the active call and never stored on a server.
• Settings, memory and credit balance live in your browser's
  chrome.storage.local.
• No account required to install.
• Open privacy policy: https://ai.qili2.com/privacy

────────────────────────────────────────
GET GOING IN 60 SECONDS
────────────────────────────────────────

1. Install MeetMate from this page.
2. Open any meeting at teams.microsoft.com.
3. Turn on Live Captions in the meeting controls.
4. The MeetMate sidekick appears with a greeting bubble.
5. Tap a chip to start, or just keep talking — it reacts.

────────────────────────────────────────
WHO SHOULD USE MEETMATE
────────────────────────────────────────

• Sales / CS / partner-managers running customer calls on personal Teams.
• Engineers in cross-cultural standups who want translation + live notes.
• Consultants juggling 8 client meetings a day with no admin team.
• Anyone who finds note-taker bots awkward and post-call summaries too late.

────────────────────────────────────────
SUPPORT & FEEDBACK
────────────────────────────────────────

• Website: https://ai.qili2.com
• Issues: https://ai.qili2.com/support
• Changelog: see "What's new" on the listing.

What's new in v4
• 4 reactive states — Listening / Mentioned / Speaking / Attention.
• Center-panel topic branches replace the old chip-bar.
• 8-second SPEAKING refreshes never repeat prior suggestions.
• Cross-meeting memory now cites the exact prior meeting + date.
• 🎯 Attention button to lock the AI on a moment.
• ❓ Quick-help one-shot answers.
```

## Categories
- Primary: **Productivity** (more commercial than "Communication" — note-taker
  bots all live here)
- Or keep **Communication** if we want to compete on the same shelf as Tactiq

## Screenshots (5 slots, 1280×800)
Each captures the side-by-side: Teams meeting on the left, MeetMate panel on
the right with a clear caption.

1. **Hero — Boot greeting state** : "Acme integration kickoff" rail shows
   3 FACTs + 2 RESEARCH questions. Caption: *"MeetMate joins the call quietly
   — remembers what mattered last time."*
2. **Mentioned state** : center panel `🟡 Bob (Acme PM) → you` with 3 topic
   branches (Throughput readiness / SLA terms / Rollout timeline). Caption:
   *"Your name was said — pick a direction in one tap."*
3. **Speaking state** : center panel `🔵 Asked` with live topic refresh.
   Caption: *"You hold the floor — branches refresh every 8 seconds."*
4. **Attention / Quick Help** : 🎯 attention focus on one moment. Caption:
   *"Lock the AI on a moment — or hit ❓ for a one-shot answer."*
5. **Auto minutes** : the collapsible minutes panel mid-call. Caption:
   *"Decisions, Action Items, Open Questions — done by the time you leave."*

(Optional 6th — Translate / 🌐 polish — only if a slot is open. Not a hero shot.)

## Promotional tile
**Small tile (440×280)**: split screen — left = Teams call screenshot,
right = MeetMate center panel with the yellow "🟡 → you" badge. Headline:
`Your turn. Pick a topic.`

## Video (already exists — needs update)
Current promo is "One Click. Your Language." — that's the translate demo and
**does not match HP-01** (the 4-state happy path). Plan to replace with a
30-second walkthrough of S-1 → S-2 → S-3 → S-4. Keep current video only if
the replacement is going to slip past launch.

## Privacy practices form (CWS requires this)
- Single purpose: "Live AI assistance during Microsoft Teams meetings."
- Data handled: meeting captions + user profile name (in browser only).
- NOT sold to third parties.
- NOT used for unrelated purposes.
- NOT used for creditworthiness.

## Open questions for the user
1. Title: punchy ("Live AI Sidekick") vs SEO-safe ("MSTeams Live AI Meeting
   Assistant")? — see two options above.
2. Category: switch to Productivity, or stay in Communication?
3. Screenshots — produce fresh ones from a scripted Teams session, or reuse
   existing?
4. Promo video — keep "One Click. Your Language." or shoot a v4 walkthrough?
5. Bump version 4.0.0 → 4.1.0 (since 4.0.0 is local-dev only, we want the
   first store version of v4 to read cleanly)?
