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
import { createServer } from "node:http"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const envPath = resolve(ROOT, ".env")
const SCOPE = "https://www.googleapis.com/auth/chromewebstore"

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

// Start a local server to capture the OAuth redirect
const server = createServer()
const port = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port))
})
const REDIRECT = `http://localhost:${port}`

const authUrl = new URL("https://accounts.google.com/o/oauth2/auth")
authUrl.searchParams.set("client_id", CID)
authUrl.searchParams.set("redirect_uri", REDIRECT)
authUrl.searchParams.set("response_type", "code")
authUrl.searchParams.set("scope", SCOPE)
authUrl.searchParams.set("access_type", "offline")
authUrl.searchParams.set("prompt", "consent")

console.log("\n▶ Open this URL in a browser signed in to the CWS publisher account:\n")
console.log("   " + authUrl.toString() + "\n")

const code = await new Promise((resolve, reject) => {
    server.on("request", (req, res) => {
        const url = new URL(req.url, REDIRECT)
        const code = url.searchParams.get("code")
        const error = url.searchParams.get("error")
        res.writeHead(200, { "Content-Type": "text/html" })
        if (code) {
            res.end("<h2>✓ Authorization received. You can close this tab.</h2>")
            resolve(code)
        } else {
            res.end(`<h2>✗ Error: ${error || "unknown"}</h2>`)
            reject(new Error(error || "no code"))
        }
    })
    setTimeout(() => reject(new Error("Timed out waiting for OAuth redirect")), 120_000)
})
server.close()

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
