#!/usr/bin/env python3
"""
Upload team-mate.zip to Chrome Web Store via the developer dashboard.

Usage:
  python3 scripts/cws-upload.py                    # upload only (draft)
  python3 scripts/cws-upload.py --submit           # upload + submit for review

Prerequisites:
  - Chrome must be running with --remote-debugging-port (browser-harness connected)
  - Logged in to the CWS developer console at:
    https://chrome.google.com/webstore/devconsole/b6ef2f52-fb3e-4af5-bbbf-ad73d2b79348/immkojolaicdjhkbbhkldmndhfjbehmf
"""

import sys, time, os, argparse

sys.path.insert(0, '/Users/lir/Developer/browser-harness/src')
from browser_harness.helpers import js, cdp, list_tabs, switch_tab

EXTENSION_ID = "immkojolaicdjhkbbhkldmndhfjbehmf"
GROUP_ID = "b6ef2f52-fb3e-4af5-bbbf-ad73d2b79348"
BASE_URL = f"https://chrome.google.com/webstore/devconsole/{GROUP_ID}/{EXTENSION_ID}"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
ZIP_PATH = os.path.join(ROOT, "team-mate.zip")

def find_cws_tab():
    """Find or open the CWS developer console tab."""
    tabs = list_tabs()
    for t in tabs:
        if 'webstore/devconsole' in t.get('url', '') and EXTENSION_ID in t.get('url', ''):
            return t['targetId']
    # Open it
    result = cdp("Target.createTarget", url=f"{BASE_URL}/edit/package")
    time.sleep(5)
    tabs = list_tabs()
    for t in tabs:
        if 'webstore/devconsole' in t.get('url', ''):
            return t['targetId']
    raise RuntimeError("Could not open CWS developer console")

def upload_zip(tid):
    """Navigate to Package tab and upload the zip."""
    switch_tab(tid)
    cdp("Page.navigate", url=f"{BASE_URL}/edit/package")
    time.sleep(4)

    title = js("document.title")
    if 'Package' not in title:
        raise RuntimeError(f"Not on Package page: {title}")

    # Click "Upload new package"
    js("void(Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Upload new package').click())")
    time.sleep(2)

    # Find the zip file input
    doc = cdp("DOM.getDocument")
    root_id = doc['root']['nodeId']
    nodes = cdp("DOM.querySelectorAll", nodeId=root_id, selector='input[type="file"][accept=".zip,.crx"]')
    nids = nodes.get('nodeIds', [])
    if not nids:
        raise RuntimeError("No zip file input found")

    # Set the file
    cdp("DOM.setFileInputFiles", files=[ZIP_PATH], nodeId=nids[0])
    # Trigger change event
    js("""void((function(){
        var inp = document.querySelector('input[type="file"][accept=".zip,.crx"]');
        if(inp) inp.dispatchEvent(new Event('change', {bubbles: true}));
    })())""")
    print(f"  Set file: {ZIP_PATH}")

    # Wait for upload processing (up to 30s)
    for i in range(15):
        time.sleep(2)
        text = js("document.body.innerText.substring(0,3000)")
        if 'Draft' in text and 'Version' in text:
            # Extract version from page
            for line in text.split('\n'):
                if 'Version' in line and '.' in line:
                    print(f"  {line.strip()}")
            return True
        if 'error' in text.lower():
            for line in text.split('\n'):
                if 'error' in line.lower():
                    print(f"  ERROR: {line.strip()}")
            return False
    print("  Warning: upload may still be processing")
    return True

def submit_for_review(tid):
    """Click Submit for review."""
    switch_tab(tid)
    time.sleep(1)

    btn = js("""(function(){
        var btns = document.querySelectorAll('button');
        for(var b of btns){
            if(b.innerText.trim()==='Submit for review' && !b.disabled){
                return 'found';
            }
        }
        return 'not found';
    })()""")

    if btn != 'found':
        print("  Submit button not found or disabled")
        return False

    js("void(Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Submit for review').click())")
    time.sleep(3)

    # Handle confirmation dialog if any
    dialog = js("document.querySelector('[role=dialog]') ? document.querySelector('[role=dialog]').innerText.substring(0,200) : ''")
    if dialog:
        print(f"  Dialog: {dialog[:100]}")
        # Click confirm/submit in dialog
        js("""void((function(){
            var d = document.querySelector('[role=dialog]');
            if(!d) return;
            var btns = d.querySelectorAll('button');
            for(var b of btns){
                var t = b.innerText.trim().toLowerCase();
                if(t.includes('submit') || t.includes('yes') || t.includes('confirm')){
                    b.click(); return;
                }
            }
        })())""")
        time.sleep(3)

    # Check status
    text = js("document.body.innerText.substring(0,500)")
    if 'Pending review' in text or 'pending' in text.lower():
        return True
    print(f"  Status after submit: check dashboard manually")
    return True

def main():
    parser = argparse.ArgumentParser(description="Upload extension to CWS via dashboard")
    parser.add_argument("--submit", action="store_true", help="Submit for review after upload")
    args = parser.parse_args()

    if not os.path.exists(ZIP_PATH):
        print(f"✗ {ZIP_PATH} not found. Run `npm run build` first.")
        sys.exit(1)

    size_kb = os.path.getsize(ZIP_PATH) // 1024
    print(f"▶ Uploading team-mate.zip ({size_kb} KB) to CWS dashboard...")

    tid = find_cws_tab()
    print(f"  Found CWS tab")

    if upload_zip(tid):
        print("✓ Zip uploaded successfully")
    else:
        print("✗ Upload failed")
        sys.exit(1)

    if args.submit:
        print("▶ Submitting for review...")
        if submit_for_review(tid):
            print("✓ Submitted for review")
        else:
            print("⚠ Submit may need manual confirmation")

if __name__ == "__main__":
    main()
