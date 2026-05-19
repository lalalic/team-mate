#!/usr/bin/env python3
"""
Live e2e for the v4.1 4-state UX. Drives each state via the
window.__meetmate.injectCaption helper exposed by content.js (v4.1+).

Run AFTER:
   python3 scripts/live-welcome.py   # to be in a meeting + ext reloaded.

Outputs screenshots to /tmp/v41-*.png and a JSON summary.
"""

import base64, json, subprocess, sys, time

def h(script, timeout=30):
    p = subprocess.run(["browser-harness", "-c", script], capture_output=True, text=True, timeout=timeout)
    if p.returncode != 0:
        sys.stderr.write(p.stderr); raise RuntimeError("harness failed")
    return p.stdout.strip()

def shot(name):
    h('capture_screenshot("/tmp/v41-' + name + '.png")')
    print("  -> /tmp/v41-" + name + ".png")

def jseval(expr):
    # Encode expr as base64 to bypass shell + Python quoting hell.
    b = base64.b64encode(expr.encode("utf-8")).decode("ascii")
    return h('import base64; out = js(base64.b64decode("' + b + '").decode("utf-8")); print(out if out is not None else "")')

def snap():
    # Trigger the content script's snapshot writer (event-bridged), then
    # read back the result from a DOM dataset (works across isolated worlds).
    jseval('window.dispatchEvent(new CustomEvent("meetmate:debug_request"));')
    time.sleep(0.2)
    expr = (
        'var c=document.getElementById("meetmate-center"); '
        'var r=document.getElementById("meetmate-rail"); '
        'var t=document.getElementById("meetmate-translation"); '
        'var dbg = null; try { dbg = JSON.parse(document.documentElement.dataset.meetmateDebug || "null") } catch(_) {} '
        'return JSON.stringify({'
        'state: dbg && dbg.state, '
        'transcripts: dbg && dbg.transcripts, '
        'lastCap: dbg && dbg.lastCaption, '
        'center_show: !!c && c.classList.contains("show"), '
        'center_state_attr: c && c.dataset.state || null, '
        'center_text: c ? (c.querySelector(".mm-c-body") ? c.querySelector(".mm-c-body").innerText : "").slice(0,180) : null, '
        'center_chips: c ? Array.from(c.querySelectorAll(".mm-c-chips button")).map(function(b){return b.innerText}) : [], '
        'rail_chips: r ? r.querySelectorAll(".mm-r-chip").length : 0, '
        'rail_visible: r ? getComputedStyle(r).display !== "none" : false, '
        'translation_show: t ? getComputedStyle(t).display !== "none" : false, '
        'translation_lines: t ? t.querySelectorAll(".mm-t-line").length : 0'
        '})'
    )
    return json.loads(jseval(expr))

def inject(name, text):
    payload = json.dumps({"Name": name, "Text": text})
    jseval('window.dispatchEvent(new CustomEvent("meetmate:inject_caption", {detail: ' + payload + '}))')

def click(sel):
    jseval('var el=document.querySelector(' + json.dumps(sel) + '); if(el){el.click(); return "clicked"} else return "missing"')

def set_ask(value):
    expr = (
        'var inp=document.querySelector("#meetmate-rail .mm-r-asker input"); '
        'var setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; '
        'setter.call(inp,' + json.dumps(value) + '); '
        'inp.dispatchEvent(new Event("input",{bubbles:true})); '
        'document.querySelector("#meetmate-rail .mm-r-asker .mm-r-send").click(); '
        'return "sent"'
    )
    jseval(expr)

def main():
    print("=== Pre-flight ===")
    print(json.dumps(snap(), indent=2))

    print("\n=== State 1 -- I'm talking ===")
    inject("Raymond Li", "We're targeting Q1 launch for the Acme integration.")
    time.sleep(1)
    print(json.dumps(snap(), indent=2))
    shot("state1-speaking")
    time.sleep(3)
    print("After 3s pause:")
    print(json.dumps(snap(), indent=2))
    shot("state1-paused")

    print("\n=== State 2 -- I'm mentioned ===")
    inject("Acme PM", "Raymond, can you confirm the integration deadline?")
    time.sleep(2)
    print(json.dumps(snap(), indent=2))
    shot("state2-mentioned-immediate")
    time.sleep(7)
    print("After model response window:")
    print(json.dumps(snap(), indent=2))
    shot("state2-mentioned-with-suggestion")

    print("\n=== State 3a -- quick-help ? ===")
    click("#meetmate-rail .mm-r-asker .mm-r-quickhelp")
    time.sleep(2)
    print(json.dumps(snap(), indent=2))
    shot("state3a-quickhelp")
    time.sleep(6)
    print("After model response:")
    print(json.dumps(snap(), indent=2))
    shot("state3a-quickhelp-reply")

    print("\n=== State 3b -- Ask bar typed ===")
    set_ask("What did we agree about retention?")
    time.sleep(6)
    print(json.dumps(snap(), indent=2))
    shot("state3b-askbar")

    print("\n=== Translation toggle ON ===")
    # If panel already showing (persisted ON from prior run), click off+on to
    # re-prime; otherwise just click on.
    jseval('var t=document.getElementById("meetmate-translation"); if(t && getComputedStyle(t).display!=="none"){document.querySelector("#translateButton").click();} return "norm"')
    time.sleep(0.5)
    click("#translateButton")
    time.sleep(2)
    print(json.dumps(snap(), indent=2))
    shot("translate-on-empty")

    print("Injecting non-Latin caption (Chinese)...")
    inject("Acme Customer", "我们担心迁移之后会出现延迟。")
    time.sleep(8)
    print(json.dumps(snap(), indent=2))
    shot("translate-on-with-line")

    print("Toggling translation OFF...")
    click("#translateButton")
    time.sleep(1)
    print(json.dumps(snap(), indent=2))
    shot("translate-off")

    print("\nDONE. Screenshots: /tmp/v41-*.png")

if __name__ == "__main__":
    main()
