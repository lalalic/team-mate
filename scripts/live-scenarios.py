#!/usr/bin/env python3
"""
Live replay-scenarios pipeline.

Assumes a MeetMate meeting is ALREADY active (use live-welcome.py first).
Iterates every scenario in src/content.js TEST_SCENARIOS, dispatches the
`meetmate:replay` custom event, waits for new bubbles to appear, captures
text + chip labels + screenshot, and prints a pass/fail summary.

Usage:
    python3 team-mate/scripts/live-scenarios.py
    python3 team-mate/scripts/live-scenarios.py --only direct_question,fact_correction
    python3 team-mate/scripts/live-scenarios.py --skip phase_transitions_full_arc
"""

import argparse
import json
import os
import subprocess
import sys
import time

TEAMS_URL_FRAG = "teams.microsoft.com"
BUBBLE_SEL = "#aichat .meetmate-msg-body"
CHIP_SEL = "#aichat button.meetmate-chip"
SHOT_DIR = "/tmp/meetmate-shots"

# (name, max_delayMs_in_scenario, expected_keywords_or_None)
# Keywords are optional sanity hints — case-insensitive, ANY-match.
SCENARIOS = [
    ("silence_chitchat",                4500,  ["quiet", "minutes", "skip", "small talk"]),
    ("silence_others_focus",            5000,  ["quiet", "let", "listen", "minutes"]),
    ("direct_question",                 0,     ["bandwidth", "integration", "team"]),
    ("project_grounded",                2500,  ["phoenix", "migration", "rollout"]),
    ("language_barrier",                2500,  ["phoenix", "迁移", "translate", "中文", "english"]),
    ("unfamiliar_jargon",               0,     ["mev", "atomic", "settlement"]),
    ("user_commitment",                 2500,  ["friday", "design", "doc", "commit"]),
    ("fact_correction",                 0,     ["retention", "q3", "actually", "correct"]),
    ("request_for_advice",              0,     ["oom", "memory", "logs", "deploy"]),
    ("end_meeting_wrap",                3000,  ["wrap", "action", "thanks", "next"]),
    # Special / smaller — may produce no bubble; treat keywords=None as "best effort".
    ("bootstrap_greeting_no_memory",    0,     None),
    ("goal_recall_recurring",           0,     None),
    ("goal_binding_persists",           3000,  ["rollback", "plan"]),
    ("multi_bubble_jargon_question",    0,     ["mev", "atomic", "validator"]),
    ("user_mentioned_passive",          2500,  ["loop", "raymond", "migration"]),
    ("speech_polish_language_match",    0,     ["migration", "slip", "dual-write"]),
    ("speech_polish_language_mismatch", 0,     ["phoenix", "下周", "搞定"]),
    ("translate_button_current_intent", 7000,  ["回滚", "rollback", "performance"]),
    ("live_minutes_decision_action",    8000,  ["decision", "nov 15", "rollback", "runbook"]),
    ("phase_transitions_full_arc",      16000, ["cutover", "nov 15", "decision", "wrap"]),
    ("chip_click_lifecycle",            4000,  ["phoenix", "status", "formal"]),
]


def harness(script: str, timeout: int = 60) -> str:
    p = subprocess.run(
        ["browser-harness", "-c", script],
        capture_output=True, text=True, timeout=timeout,
    )
    if p.returncode != 0:
        sys.stderr.write(p.stderr)
        raise RuntimeError(f"browser-harness exit {p.returncode}")
    return p.stdout.strip()


def find_teams_target() -> str:
    script = f'''
for t in list_tabs():
    if "{TEAMS_URL_FRAG}" in t.get("url",""):
        print(t["targetId"]); break
'''
    return harness(script).strip()


def get_state(teams_target: str) -> dict:
    """Current bubble count + last text + chip labels."""
    script = f'''
import json
switch_tab("{teams_target}")
n = int(js("return document.querySelectorAll(\\"{BUBBLE_SEL}\\").length") or 0)
last = js("var el=document.querySelector(\\"{BUBBLE_SEL}:last-child\\"); return el ? (el.innerText||\\"\\") : \\"\\"") or ""
chips_raw = js("return JSON.stringify(Array.from(document.querySelectorAll(\\"{CHIP_SEL}\\")).map(function(b){{return (b.dataset.label||b.textContent||\\"\\").trim()}}))") or "[]"
print(json.dumps({{"n": n, "last": last, "chips": json.loads(chips_raw)}}))
'''
    return json.loads(harness(script).splitlines()[-1])


def run_scenario(teams_target: str, name: str, max_delay_ms: int, expected, idx: int) -> dict:
    """Dispatch scenario, wait for new bubble (or chip change), capture state + screenshot."""
    pre = get_state(teams_target)
    settle_s = max(8, max_delay_ms // 1000 + 8)
    shot_path = os.path.join(SHOT_DIR, f"{idx:02d}_{name}.png")

    script = f'''
import time, json
switch_tab("{teams_target}")
# Dispatch the replay event.
js("window.dispatchEvent(new CustomEvent('meetmate:replay', {{detail: '{name}'}})); return 'dispatched: {name}'")
# Wait for new bubble OR up to settle_s seconds.
target_n = {pre["n"]}
deadline = time.time() + {settle_s}
while time.time() < deadline:
    cur = int(js("return document.querySelectorAll(\\"{BUBBLE_SEL}\\").length") or 0)
    if cur > target_n:
        break
    time.sleep(1)
# Small extra wait for chip rendering / streaming completion.
time.sleep(2)
n = int(js("return document.querySelectorAll(\\"{BUBBLE_SEL}\\").length") or 0)
texts = js("return JSON.stringify(Array.from(document.querySelectorAll(\\"{BUBBLE_SEL}\\")).slice(-3).map(function(el){{return el.innerText||\\"\\"}}))") or "[]"
chips = js("return JSON.stringify(Array.from(document.querySelectorAll(\\"{CHIP_SEL}\\")).map(function(b){{return (b.dataset.label||b.textContent||\\"\\").trim()}}))") or "[]"
shot = capture_screenshot(path="{shot_path}")
print(json.dumps({{"n": n, "texts": json.loads(texts), "chips": json.loads(chips), "shot": shot}}))
'''
    raw = harness(script, timeout=settle_s + 30)
    post = json.loads(raw.splitlines()[-1])

    new_bubbles = max(0, post["n"] - pre["n"])
    new_text_blob = "\n".join(post["texts"])
    new_chips = post["chips"]

    if expected is None:
        status = "PASS" if new_bubbles > 0 else "EMPTY"
        hits = []
    else:
        haystack = (new_text_blob + " " + " ".join(new_chips)).lower()
        hits = [kw for kw in expected if kw.lower() in haystack]
        status = "PASS" if (new_bubbles > 0 and hits) else ("PARTIAL" if new_bubbles > 0 else "FAIL")

    return {
        "name": name,
        "status": status,
        "new_bubbles": new_bubbles,
        "hits": hits,
        "expected": expected or [],
        "last_text": post["texts"][-1] if post["texts"] else "",
        "chips": new_chips,
        "shot": post["shot"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated scenario names to run")
    ap.add_argument("--skip", help="comma-separated scenario names to skip", default="")
    ap.add_argument("--cooldown", type=int, default=2, help="seconds between scenarios")
    args = ap.parse_args()

    only = set(s.strip() for s in args.only.split(",")) if args.only else None
    skip = set(s.strip() for s in args.skip.split(",") if s.strip())

    os.makedirs(SHOT_DIR, exist_ok=True)
    teams = find_teams_target()
    if not teams:
        sys.exit("ERROR: no Teams tab open")
    print(f"[*] Teams target: {teams}")
    print(f"[*] Screenshots → {SHOT_DIR}/\n")

    results = []
    for idx, (name, dmax, expected) in enumerate(SCENARIOS, 1):
        if only and name not in only: continue
        if name in skip: continue
        print(f"\n=== [{idx:02d}/{len(SCENARIOS)}] {name} ===")
        try:
            r = run_scenario(teams, name, dmax, expected, idx)
        except Exception as e:
            print(f"  EXC: {e}")
            results.append({"name": name, "status": "EXC", "new_bubbles": 0, "hits": [], "expected": expected or [], "last_text": str(e), "chips": [], "shot": ""})
            continue
        results.append(r)
        bar = {"PASS":"✅","PARTIAL":"🟡","FAIL":"❌","EMPTY":"⬜","EXC":"💥"}.get(r["status"],"?")
        print(f"  {bar} {r['status']}  new_bubbles={r['new_bubbles']}  hits={r['hits']}/{r['expected']}")
        if r["last_text"]:
            preview = r["last_text"][:200].replace("\n", " ⏎ ")
            print(f"  text: {preview}")
        if r["chips"]:
            print(f"  chips: {r['chips']}")
        print(f"  shot: {r['shot']}")
        time.sleep(args.cooldown)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    counts = {"PASS":0, "PARTIAL":0, "FAIL":0, "EMPTY":0, "EXC":0}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
        bar = {"PASS":"✅","PARTIAL":"🟡","FAIL":"❌","EMPTY":"⬜","EXC":"💥"}.get(r["status"],"?")
        print(f"  {bar} {r['name']:38s} bubbles={r['new_bubbles']} hits={len(r['hits'])}/{len(r['expected'])}")
    print(f"\n  ✅ {counts['PASS']}  🟡 {counts['PARTIAL']}  ❌ {counts['FAIL']}  ⬜ {counts['EMPTY']}  💥 {counts['EXC']}")
    print(f"\n  JSON report → /tmp/meetmate-scenarios.json")
    with open("/tmp/meetmate-scenarios.json", "w") as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    main()
