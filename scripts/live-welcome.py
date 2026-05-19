#!/usr/bin/env python3
"""
Live welcome-bubble pipeline.

Drives the user's already-open Chrome (via browser-harness daemon) through:
    1. Reload the MeetMate extension (picks up rebuilt bundle from
       team-mate/extension/).
    2. Switch to a Teams tab that has a meeting on the calendar (or
       reuse one that's already pre-join).
    3. Click "Join" → "Join now".
    4. Poll #aichat for a welcome bubble (timeout: 30s).
    5. Print the bubble text + screenshot path.

Usage:
    python3 team-mate/scripts/live-welcome.py
    python3 team-mate/scripts/live-welcome.py --no-reload   # skip ext reload
    python3 team-mate/scripts/live-welcome.py --no-join     # already in meeting

Pre-reqs:
    - browser-harness daemon already attached to the user's Chrome.
    - MeetMate (immkojolaicdjhkbbhkldmndhfjbehmf) installed + enabled.
    - A Teams meeting visible on https://teams.microsoft.com/v2/ with the
      "Join" button reachable (either calendar or chat pre-join screen).
"""

import argparse
import json
import subprocess
import sys
import time

MM_ID = "immkojolaicdjhkbbhkldmndhfjbehmf"
TEAMS_URL_FRAG = "teams.microsoft.com"
PANEL_SEL = "#meetmate-rail .mm-r-log-entry"


def harness(script: str, timeout: int = 60) -> str:
    """Run a browser-harness -c script, return stdout text."""
    p = subprocess.run(
        ["browser-harness", "-c", script],
        capture_output=True, text=True, timeout=timeout,
    )
    if p.returncode != 0:
        sys.stderr.write(p.stderr)
        raise RuntimeError(f"browser-harness exit {p.returncode}")
    return p.stdout.strip()


def reload_extension() -> None:
    """Reload MeetMate via chrome.developerPrivate from chrome://extensions."""
    script = f'''
for t in cdp("Target.getTargets").get("targetInfos", []):
    if t.get("url","").startswith("chrome://extensions"):
        sid = cdp("Target.attachToTarget", targetId=t["targetId"], flatten=True).get("sessionId")
        cdp("Runtime.enable", session_id=sid)
        r = cdp("Runtime.evaluate",
          expression="new Promise(function(r){{chrome.developerPrivate.reload(\\"{MM_ID}\\",{{failQuietly:true}},function(){{r(\\"ok\\")}})}})",
          awaitPromise=True, returnByValue=True, session_id=sid)
        print(r.get("result",{{}}).get("value") or "no-result")
        break
else:
    new_tab("chrome://extensions/")
    print("opened chrome://extensions/ — re-run --reload")
'''
    print("[1/4] reload extension:", harness(script))


def find_teams_target() -> str:
    """Return the targetId of the Teams tab, or empty."""
    script = f'''
for t in list_tabs():
    if "{TEAMS_URL_FRAG}" in t.get("url",""):
        print(t["targetId"]); break
'''
    return harness(script).strip()


def join_meeting(teams_target: str) -> None:
    """Reload Teams tab (drops user from any active meeting + re-injects
    fresh content script), then click Join → Join now."""
    script = f'''
import time
sid = cdp("Target.attachToTarget", targetId="{teams_target}", flatten=True).get("sessionId")
cdp("Page.enable", session_id=sid)
cdp("Page.reload", ignoreCache=True, session_id=sid)
time.sleep(10)
switch_tab("{teams_target}")
# Find Join button by inner text OR aria-label, anywhere visible.
def find_and_click(pattern_re):
    return js("var cand=Array.from(document.querySelectorAll(\\"button,[role=button]\\")).filter(function(e){{return e.offsetParent}}); var b=cand.find(function(e){{var t=(e.innerText||\\"\\").trim(); var a=(e.getAttribute(\\"aria-label\\")||\\"\\").trim(); return " + pattern_re + ".test(t) || " + pattern_re + ".test(a)}}); if(b){{b.click(); return \\"clicked: \\"+(b.innerText||b.getAttribute(\\"aria-label\\")||\\"\\").trim()}} else return \\"not_found(\\"+cand.length+\\")\\"")

# Retry Join button up to 10s (Teams may still be loading after reload).
clicked1 = False
for attempt in range(10):
    r1 = find_and_click("/^Join( meeting)?$/i")
    if r1.startswith("clicked"):
        print(f"Join (t+{{attempt}}s):", r1)
        clicked1 = True
        break
    time.sleep(1)
if not clicked1:
    print("Join: never appeared")
    print("DONE")
else:
    # Wait for pre-join screen, retry "Join now" up to 12s
    clicked2 = False
    for attempt in range(12):
        time.sleep(1)
        r2 = find_and_click("/^Join now$/i")
        if r2.startswith("clicked"):
            print(f"Join now (t+{{attempt+1}}s):", r2)
            clicked2 = True
            break
    if not clicked2:
        print("Join now: never appeared")
'''
    out = harness(script, timeout=45)
    print("[2/4] join:", out.replace("\n", " | "))


def poll_welcome(teams_target: str, timeout_s: int = 30) -> dict:
    script = f'''
import time, json
switch_tab("{teams_target}")
deadline = time.time() + {timeout_s}
text = None
n = 0
while time.time() < deadline:
    n = int(js("return document.querySelectorAll(\\"{PANEL_SEL}\\").length") or 0)
    if n > 0:
        text = js("var el=document.querySelector(\\"{PANEL_SEL}:last-child\\"); return el && el.innerText && el.innerText.length > 5 ? el.innerText : null")
        if text:
            break
    time.sleep(1)
shot = capture_screenshot()
print(json.dumps({{"bubbles": n, "text": text, "shot": shot}}))
'''
    out = harness(script, timeout=timeout_s + 15)
    return json.loads(out.splitlines()[-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-reload", action="store_true", help="skip extension reload")
    ap.add_argument("--no-join", action="store_true", help="skip Join clicks (already in meeting)")
    ap.add_argument("--timeout", type=int, default=30, help="welcome poll timeout (s)")
    args = ap.parse_args()

    if not args.no_reload:
        reload_extension()
        time.sleep(2)
    else:
        print("[1/4] reload extension: skipped")

    teams = find_teams_target()
    if not teams:
        sys.exit("ERROR: no Teams tab open (need https://teams.microsoft.com/v2/)")
    print(f"[*] Teams target: {teams}")

    if not args.no_join:
        join_meeting(teams)
    else:
        print("[2/4] join: skipped")

    print(f"[3/4] poll for welcome (timeout {args.timeout}s)…")
    result = poll_welcome(teams, timeout_s=args.timeout)
    print(f"[4/4] result: bubbles={result['bubbles']}  screenshot={result['shot']}")
    if result["text"]:
        print("---welcome---")
        print(result["text"])
        print("-------------")
        sys.exit(0)
    else:
        sys.exit("FAIL: no welcome bubble within timeout")


if __name__ == "__main__":
    main()
