# MeetMate — 4-State UX Design (v4.1)

## Role
A quiet, context-aware second brain that activates only when useful.
Sits next to you and:
- Whispers a polish when you've just finished speaking
- Hands you a card when you're suddenly addressed
- Pulls knowledge/facts when you ask
- Otherwise stays silent

## The 4 States (urgency-driven)

| # | State | Trigger | Urgency | UI shape | Content |
|---|---|---|---|---|---|
| 1 | **I'm talking** | Last 1-2 captions `author == me`, ongoing | 🔴 immediate, sub-second | Top-center overlay, updates LIVE | • Mid-sentence: knowledge cards (facts/figures from profile + memory)<br>• On 2s pause: polished version of last 1-2 sentences |
| 2 | **I'm mentioned** | Caption contains `me.name` + `?` or action verb (own/take/decide/review) | 🟡 alert, 1-3s | Top-center overlay, less aggressive entrance, requires action | Suggested reply (quoted) + 1-3 chips: *Send to chat / Be specific / Hold* |
| 3 | **Attention toggled** | User clicks `?` button OR focuses/submits Ask bar | 🟡 alert | Top-center overlay (sticky until dismissed) | Whatever user asked for: memory lookup, draft email, translate, fact-check, help-me-reply |
| 4 | **Idle** | None of 1/2/3 active for 10s | 🟢 easy | Thin right-rail strip, collapsed by default | 3-5 context-aware chips: *Knowledge: X / Fact: Y / Topic: Z / Translate floor* |

## Always-on continuous services

### 🌐 Live translation toggle
- Button toggles persistent state (`conf.continuousTranslate`).
- ON: docked right-side panel shows rolling translated transcript (opposite-language captions only → preferred language).
- ON suppresses ad-hoc translation inside states 1/2/3.
- OFF: model decides per-context.

###  Ask bar (always visible at bottom of right-rail)
- Thin input + quick-? button.
- Type query → submit → State 3 sticky overlay.
- Quick-? button: one-shot help based on last 3-5 captions (no typing).
- Examples: *"What did we say about retention last meeting?"* / *"Translate that"* / *"Draft a follow-up email"*

## State machine

```
                ┌─────────────────────────────┐
                │  caption.author == me?      │
                │  AND speaking ongoing?      │
                └─────────┬───────────────────┘
                          │ yes → State 1
                          ▼ no
                ┌─────────────────────────────┐
                │  caption.text matches       │
                │  me.name + ?/action_verb?   │
                └─────────┬───────────────────┘
                          │ yes → State 2
                          ▼ no
                ┌─────────────────────────────┐
                │  User just clicked ? or     │
                │  submitted Ask bar?         │
                └─────────┬───────────────────┘
                          │ yes → State 3 (sticky)
                          ▼ no
                       State 4 (idle)
```

Hysteresis & cooldowns:
- Don't re-fire State 1 polish until I've spoken at least 1 more turn since the last polish.
- State 2/3 overlay dismisses on next non-me caption OR after 30s OR user clicks dismiss.
- State 4 idle-rail chips refresh every 30s with new context.

## Component map

```
┌──── #meetmate-center (top-center overlay) ──────┐  states 1/2/3
│  speaker name + text                            │
│  [chip] [chip] [chip]                           │
└──────────────────────────────────────────────────┘

┌── #meetmate-rail (thin right strip, ~60px) ──┐  state 4 (always present, collapsed default)
│  📚 Knowledge: Phoenix runbook                │
│  💡 Fact: Q3 retention 38%                    │
│  🌐 Translate floor                           │
│  ─────────────────────                        │
│  [Ask anything...]                ?           │  Ask bar always at bottom
└────────────────────────────────────────────────┘

┌── #meetmate-translation (right side, when toggle ON) ──┐
│  🌐 Live translation — English          ×             │
│  ───────────────────────                              │
│  客户 (Acme) · 中文 → English                          │
│  We're worried about latency post-migration…          │
│  ───────────────────────                              │
└────────────────────────────────────────────────────────┘
```

## Removed from current build
- ❌ Phase badge (not useful per user feedback)
- ❌ Welcome bubble (replaced by State 4 "👋 Tap to set your goal" idle chip on first meeting)
- ❌ Big right-rail bubble list (replaced by thin rail + on-demand overlay)
- ❌ Per-caption auto-translate inside suggestions (folded into translation toggle)
- ❌ 21 TEST_SCENARIOS (replaced by 4 state-detector unit tests)
- ❌ Polish-while-mid-sentence (only on pause, per user feedback)

## Build order (smallest viable)

1. **src/state-machine.js** — pure function `classifyState(transcripts, me, now, askBarState)` → returns `{state: 1|2|3|4, payload}`. Testable in isolation.
2. **CSS scaffolding** — `#meetmate-center`, `#meetmate-rail`, `#meetmate-translation` containers + transitions.
3. **Wire `showSuggestion()` → `routeByState()`** — states 1/2/3 → center overlay, state 4 → rail chips.
4. **Ask bar** — DOM element + handler that pushes user input via `pushUserMsg(input)` and transitions to State 3.
5. **🌐 Translation toggle** — `conf.continuousTranslate` persistence + caption hook + side panel rendering.
6. **Cleanup** — remove `#aichat` sidebar and phase badge code paths behind a feature flag (default OFF), keep behind `conf.useLegacyUI`.
7. **Goal-binding chip** — first-meeting idle-rail chip "👋 Set your goal" → opens chip submenu.

## Tests
- `tests/state-machine.spec.js` — 4 unit tests, one per state, plus hysteresis + cooldown.
- `scripts/live-states.py` — drive Chrome through each state via caption injection, screenshot + assert correct UI surface appears.
