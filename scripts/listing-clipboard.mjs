#!/usr/bin/env node
/**
 * Extract the ## description section from .market/store-listing.md and copy
 * it to the macOS clipboard, ready to paste into the CWS dev console.
 *
 * Usage:
 *   node scripts/listing-clipboard.mjs            # copy description
 *   node scripts/listing-clipboard.mjs --section single_purpose_description
 *   node scripts/listing-clipboard.mjs --all      # print all sections
 *   node scripts/listing-clipboard.mjs --open     # open dev console in browser
 */

import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const LISTING = resolve(ROOT, ".market/store-listing.md")
const DEV_CONSOLE = "https://chrome.google.com/webstore/devconsole/b6ef2f52-fb3e-4af5-bbbf-ad73d2b79348/immkojolaicdjhkbbhkldmndhfjbehmf/edit/listing"

const args = process.argv.slice(2)
const section = args.includes("--section") ? args[args.indexOf("--section") + 1] : "description"
const showAll = args.includes("--all")
const openBrowser = args.includes("--open")

// Parse sections
const md = readFileSync(LISTING, "utf8")
const sections = {}
let current = null
for (const line of md.split("\n")) {
    const m = line.match(/^##\s+(.+)/)
    if (m) {
        // Extract the key (first word/phrase before any parenthetical)
        current = m[1].replace(/\s*\(.*$/, "").trim().toLowerCase().replace(/\s+/g, "_")
        sections[current] = []
        continue
    }
    if (current) sections[current].push(line)
}
for (const k of Object.keys(sections)) {
    sections[k] = sections[k].join("\n").trim()
}

if (openBrowser) {
    console.log(`▶ Opening ${DEV_CONSOLE}`)
    execSync(`open "${DEV_CONSOLE}"`)
    process.exit(0)
}

if (showAll) {
    for (const [k, v] of Object.entries(sections)) {
        console.log(`\n═══ ${k} (${v.length} chars) ═══`)
        console.log(v.slice(0, 200) + (v.length > 200 ? "…" : ""))
    }
    process.exit(0)
}

const text = sections[section]
if (!text) {
    console.error(`✗ Section "${section}" not found. Available: ${Object.keys(sections).join(", ")}`)
    process.exit(1)
}

// Copy to clipboard (macOS)
try {
    execSync("pbcopy", { input: text })
    console.log(`✓ Copied "${section}" to clipboard (${text.length} chars)`)
    console.log(`  Preview: ${text.slice(0, 120)}…`)
    console.log(`\n  Paste into: ${DEV_CONSOLE}`)
} catch {
    // Fallback: print to stdout
    console.log(text)
}
