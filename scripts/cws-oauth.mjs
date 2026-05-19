#!/usr/bin/env node
/**
 * One-time helper: mint a Google OAuth refresh token for the Chrome Web Store
 * Publish API.
 *
 * Pre-req:
 *   1. Visit https://console.cloud.google.com → APIs & Services → Credentials.
 *   2. "Create Credentials" → "OAuth client ID" → type "Desktop application".
 *   3. Copy the client_id + client_secret. Drop them into team-mate/.env:
 *        CWS_CLIENT_ID=...
 *        CWS_CLIENT_SECRET=...
 *   4. Enable the "Chrome Web Store API" in the same Cloud project.
 *   5. Run:  node scripts/cws-oauth.mjs
 *      Follow the URL it prints, paste the code back into the terminal.
 *      The refresh_token will be appended to .env.
 */

import { readFileSync, appendFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const envPath = resolve(ROOT, ".env")
const SCOPE = "https://www.googleapis.com/auth/chromewebstore"
const REDIRECT = "urn:ietf:wg:oauth:2.0:oob"

// load existing .env
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
}

const CID = process.env.CWS_CLIENT_ID
const CSECRET = process.env.CWS_CLIENT_SECRET
if (!CID || !CSECRET) {
    console.error("✗ Set CWS_CLIENT_ID and CWS_CLIENT_SECRET in .env first.")
    process.exit(1)
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/auth")
authUrl.searchParams.set("client_id", CID)
authUrl.searchParams.set("redirect_uri", REDIRECT)
authUrl.searchParams.set("response_type", "code")
authUrl.searchParams.set("scope", SCOPE)
authUrl.searchParams.set("access_type", "offline")
authUrl.searchParams.set("prompt", "consent")

console.log("\n▶ Open this URL in a browser signed in to the CWS publisher account:\n")
console.log("   " + authUrl.toString() + "\n")
console.log("After consent you'll get a code. Paste it below.\n")

const rl = readline.createInterface({ input, output })
const code = (await rl.question("code: ")).trim()
rl.close()

const body = new URLSearchParams({
    code,
    client_id: CID,
    client_secret: CSECRET,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
})

const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
})
const j = await res.json()
if (!j.refresh_token) {
    console.error("✗ No refresh_token in response:", j)
    process.exit(1)
}

appendFileSync(envPath, `\nCWS_REFRESH_TOKEN=${j.refresh_token}\n`)
console.log(`✓ Wrote CWS_REFRESH_TOKEN to ${envPath}`)
console.log(`  (access_token also issued; expires in ${j.expires_in}s — refresh token is what we keep.)`)
