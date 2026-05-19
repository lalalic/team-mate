# Tonight's Task List

Source: user-steer 2026-05-15.

## 1. team-mate (this repo)

- [x] **HP-01..03**: 3 in-meeting happy paths → `.specs/scenarios/`
- [x] **Offline smoke harness**: 3/3 green (`node ./tests/test-loop-session.js`)
- [x] **Update specs**: `.specs/spec.md` written (12 must-haves)
- [x] **.demo-runtime.md**: existing manifest verified current for v4 (21 scenarios @ content.js:443)
- [x] **Marketing stuff**: research-brief, hooks, research, 5 scenes + compiled 16x9 mp4 already in `.market/`
- [x] **Live e2e** — welcome bubble verified via `scripts/live-welcome.py` pipeline (reload ext → reload Teams → Join → Join now → poll #aichat)
  - Fixed 3 blockers: BOOTSTRAP_TOKEN mismatch, default model gpt-4.1 → deepseek-chat (relay has no OpenAI), npm install was missing
- [ ] **Bubble `\n` rendering** — send_suggestion text shows literal `\n` instead of line breaks (renderer escape bug)
- [ ] **Demo video re-render for v4** — manifest current; render is interactive
- [ ] **Chrome Web Store review + auto-publish** — needs user's logged-in devconsole

## 2. copilot-infinite

- [x] **Merge neverstop into orchestrator** — `spec-driven-dev.agent.md` now has `## Run protocol — neverstop` section
- [x] **Make orchestrator concise** — 252 → 148 lines

## Statuses
- ✅ done · 🟡 in progress · ⏸️ blocked · ⬜ not started
