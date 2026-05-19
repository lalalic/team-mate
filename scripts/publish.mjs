#!/usr/bin/env node
/**
 * Chrome Web Store publish pipeline.
 *
 * Pipeline:
 *   1. Verify clean git working tree (or accept --dirty)
 *   2. Bump version (`patch` | `minor` | `major` | explicit `x.y.z`) in
 *      package.json + extension/manifest.json
 *   3. Run `yarn build` (webpack production + zip → team-mate.zip)
 *   4. Upload team-mate.zip to the Chrome Web Store via the API
 *   5. Submit for review (or leave as draft with --draft)
 *
 * Required environment variables (load from .env via `dotenv` if present):
 *   CWS_EXTENSION_ID    — Chrome Web Store extension id
 *   CWS_CLIENT_ID       — Google OAuth client id
 *   CWS_CLIENT_SECRET   — Google OAuth client secret
 *   CWS_REFRESH_TOKEN   — Google OAuth refresh token (offline scope)
 *
 * Usage:
 *   node scripts/publish.mjs                  # bump patch, build, upload, submit
 *   node scripts/publish.mjs --bump minor     # bump minor
 *   node scripts/publish.mjs --bump 4.2.0     # explicit version
 *   node scripts/publish.mjs --skip-bump      # publish current version as-is
 *   node scripts/publish.mjs --draft          # upload only, do NOT submit
 *   node scripts/publish.mjs --dry-run        # everything except the upload
 *   node scripts/publish.mjs --dirty          # allow uncommitted changes
 *
 * Credentials setup (one-time):
 *   See scripts/PUBLISH.md for the OAuth dance — short version:
 *     1. Create OAuth client (type: "Desktop") in Google Cloud Console
 *     2. Run scripts/cws-oauth.mjs to mint a refresh token
 *     3. Drop CWS_* env vars into team-mate/.env (gitignored)
 */

import { execSync, spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

// ─── arg parse ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const opt = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : null
}
const BUMP = opt("bump") || "patch"
const SKIP_BUMP = flag("skip-bump")
const DRAFT = flag("draft")
const DRY = flag("dry-run")
const ALLOW_DIRTY = flag("dirty")

// ─── .env ───────────────────────────────────────────────────────────────────
const envPath = resolve(ROOT, ".env")
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
        if (m && !process.env[m[1]]) {
            let v = m[2]
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
                v = v.slice(1, -1)
            process.env[m[1]] = v
        }
    }
}

const need = ["CWS_EXTENSION_ID", "CWS_CLIENT_ID", "CWS_CLIENT_SECRET", "CWS_REFRESH_TOKEN"]
const missing = need.filter((k) => !process.env[k])
if (missing.length && !DRY) {
    console.error(`✗ Missing env vars: ${missing.join(", ")}`)
    console.error("  See scripts/PUBLISH.md to set them up.")
    process.exit(1)
}

// ─── helpers ────────────────────────────────────────────────────────────────
const sh = (cmd, opts = {}) => {
    console.log(`▶ ${cmd}`)
    return execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts })
}
const shOut = (cmd) => execSync(cmd, { cwd: ROOT }).toString().trim()
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"))
const writeJson = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2) + "\n")

const bump = (cur, target) => {
    if (/^\d+\.\d+\.\d+$/.test(target)) return target
    const [maj, min, pat] = cur.split(".").map(Number)
    if (target === "major") return `${maj + 1}.0.0`
    if (target === "minor") return `${maj}.${min + 1}.0`
    if (target === "patch") return `${maj}.${min}.${pat + 1}`
    throw new Error(`Bad --bump value: ${target}`)
}

// ─── 1. git clean? ──────────────────────────────────────────────────────────
if (!ALLOW_DIRTY && !DRY) {
    try {
        const status = shOut("git status --porcelain")
        if (status) {
            console.error("✗ Working tree dirty. Commit or pass --dirty.")
            console.error(status)
            process.exit(1)
        }
    } catch {
        console.warn("⚠ Not a git repo — skipping clean check.")
    }
}

// ─── 2. bump version ────────────────────────────────────────────────────────
const pkgPath = resolve(ROOT, "package.json")
const manPath = resolve(ROOT, "extension/manifest.json")
const pkg = readJson(pkgPath)
const man = readJson(manPath)
const newVersion = SKIP_BUMP ? pkg.version : bump(pkg.version, BUMP)

if (!SKIP_BUMP) {
    console.log(`▶ Bumping ${pkg.version} → ${newVersion}`)
    pkg.version = newVersion
    man.version = newVersion
    writeJson(pkgPath, pkg)
    writeJson(manPath, man)
}

// ─── 3. build (tests then prod) ─────────────────────────────────────────────
sh("npm test")
sh("npm run build")

const zipPath = resolve(ROOT, "team-mate.zip")
if (!existsSync(zipPath)) {
    console.error(`✗ Build did not produce ${zipPath}`)
    process.exit(1)
}

// ─── 4. upload via CWS API ──────────────────────────────────────────────────
const uploadAndPublish = async () => {
    const { default: chromeWebstoreUpload } = await import("chrome-webstore-upload")
    const webstore = chromeWebstoreUpload({
        extensionId: process.env.CWS_EXTENSION_ID,
        clientId: process.env.CWS_CLIENT_ID,
        clientSecret: process.env.CWS_CLIENT_SECRET,
        refreshToken: process.env.CWS_REFRESH_TOKEN,
    })

    console.log("▶ Uploading team-mate.zip to Chrome Web Store…")
    const { createReadStream } = await import("node:fs")
    const uploadRes = await webstore.uploadExisting(createReadStream(zipPath))
    console.log("  upload:", JSON.stringify(uploadRes, null, 2))
    if (uploadRes.uploadState === "FAILURE") {
        console.error("✗ Upload failed.")
        process.exit(1)
    }

    if (DRAFT) {
        console.log("✓ Uploaded as draft. Submit manually from the dev console.")
        return
    }

    console.log("▶ Submitting for review (publish)…")
    const pubRes = await webstore.publish("default")
    console.log("  publish:", JSON.stringify(pubRes, null, 2))
    const status = pubRes.status || []
    if (status.includes("OK") || status.includes("ITEM_PENDING_REVIEW")) {
        console.log(`✓ v${newVersion} submitted for review.`)
    } else {
        console.warn(`⚠ Publish returned unexpected status: ${status.join(", ")}`)
    }
}

if (DRY) {
    console.log("✓ Dry-run complete. team-mate.zip ready but not uploaded.")
    console.log(`  Would publish version ${newVersion} (DRAFT=${DRAFT})`)
    console.log(`\n  ⚠ After uploading, update the long description manually:`)
    console.log(`    https://chrome.google.com/webstore/devconsole/b6ef2f52-fb3e-4af5-bbbf-ad73d2b79348/${process.env.CWS_EXTENSION_ID || 'immkojolaicdjhkbbhkldmndhfjbehmf'}/edit/listing`)
    console.log(`    Copy from: .market/store-listing.md (## description section)`)
    process.exit(0)
}

uploadAndPublish().then(() => {
    console.log(`\n  ⚠ Long description, screenshots, and privacy fields must be updated manually.`)
    console.log(`    Dev console: https://chrome.google.com/webstore/devconsole/b6ef2f52-fb3e-4af5-bbbf-ad73d2b79348/${process.env.CWS_EXTENSION_ID || 'immkojolaicdjhkbbhkldmndhfjbehmf'}/edit/listing`)
    console.log(`    Copy from: .market/store-listing.md`)
    console.log(`\n    Or run:  node scripts/listing-clipboard.mjs   to copy the description to clipboard.`)
}).catch((e) => {
    console.error("✗ Publish failed:", e?.response?.body || e?.message || e)
    process.exit(1)
})
