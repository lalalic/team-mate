#!/usr/bin/env node
/**
 * Chrome Web Store publish pipeline.
 *
 * Pipeline:
 *   1. Verify clean git working tree (or accept --dirty)
 *   2. Bump version (`patch` | `minor` | `major` | explicit `x.y.z`) in
 *      package.json + extension/manifest.json
 *   3. Run `npm test` + `npm run build` → team-mate.zip
 *   4. Upload team-mate.zip via CWS dashboard (browser-harness CDP)
 *   5. Submit for review (or leave as draft with --draft)
 *
 * Prerequisites:
 *   - Chrome running with --remote-debugging-port (browser-harness connected)
 *   - Logged in to CWS developer console
 *
 * Usage:
 *   node scripts/publish.mjs                  # bump patch, build, upload, submit
 *   node scripts/publish.mjs --bump minor     # bump minor
 *   node scripts/publish.mjs --bump 4.2.0     # explicit version
 *   node scripts/publish.mjs --skip-bump      # publish current version as-is
 *   node scripts/publish.mjs --draft          # upload only, do NOT submit
 *   node scripts/publish.mjs --dry-run        # everything except the upload
 *   node scripts/publish.mjs --dirty          # allow uncommitted changes
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

// No env vars needed — upload is done via browser-harness (scripts/cws-upload.py)

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

// ─── 4. upload via CWS dashboard (browser-harness) ──────────────────────────
const uploadViaDashboard = async () => {
    const submitFlag = DRAFT ? "" : " --submit"
    console.log(`▶ Uploading team-mate.zip via CWS dashboard…${DRAFT ? " (draft only)" : ""}`)
    sh(`python3 scripts/cws-upload.py${submitFlag}`)
}

if (DRY) {
    console.log("✓ Dry-run complete. team-mate.zip ready but not uploaded.")
    console.log(`  Would publish version ${newVersion} (DRAFT=${DRAFT})`)
    process.exit(0)
}

uploadViaDashboard().then(() => {
    console.log(`\n✓ v${newVersion} uploaded to Chrome Web Store.`)
}).catch((e) => {
    console.error("✗ Publish failed:", e?.message || e)
    process.exit(1)
})
