# Publish pipeline — Chrome Web Store

Two scripts:

| Script                     | When to run        | Purpose                          |
| -------------------------- | ------------------ | -------------------------------- |
| `scripts/cws-oauth.mjs`    | Once, ever         | Mint the `CWS_REFRESH_TOKEN`     |
| `scripts/publish.mjs`      | Every release      | Bump → build → upload → submit   |

## One-time setup

1. **Create an OAuth client.** Google Cloud Console → APIs & Services →
   Credentials → "Create credentials" → "OAuth client ID" → application type
   **Desktop**. Copy `client_id` + `client_secret`.
2. **Enable the API.** Same Cloud project → "Enabled APIs & Services" →
   enable **Chrome Web Store API**.
3. **Drop credentials in `team-mate/.env`** (gitignored — verify):

   ```
   CWS_EXTENSION_ID=immkojolaicdjhkbbhkldmndhfjbehmf
   CWS_CLIENT_ID=<from step 1>
   CWS_CLIENT_SECRET=<from step 1>
   ```
4. **Mint the refresh token.**

   ```
   node scripts/cws-oauth.mjs
   ```

   Open the printed URL while signed into the CWS publisher Google account
   (i.e. the account that owns extension id `immkojolaicdjhkbbhkldmndhfjbehmf`).
   Grant consent. Paste the code back. `.env` now has all four `CWS_*` vars.

5. **Install the dep**:
   ```
   yarn add -D chrome-webstore-upload
   ```

## Every release

```
node scripts/publish.mjs                 # bump patch → build → upload → submit for review
node scripts/publish.mjs --bump minor    # 4.1.0 → 4.2.0
node scripts/publish.mjs --bump 4.2.0    # explicit
node scripts/publish.mjs --draft         # upload only, leave as draft for manual review submit
node scripts/publish.mjs --dry-run       # everything except the upload
node scripts/publish.mjs --dirty         # allow uncommitted changes (e.g. local-only edits)
node scripts/publish.mjs --skip-bump     # publish current version (rare; CWS rejects same-version)
```

What the pipeline does:

1. **Refuses dirty tree** (unless `--dirty`). Forces you to commit first.
2. **Bumps** `package.json` + `extension/manifest.json` version.
3. **Runs `npm test`** (offline scenario harness — fails fast).
4. **Runs `yarn build`** which runs webpack production + `yarn zip` to produce
   `team-mate.zip`.
5. **Uploads** `team-mate.zip` via `chrome-webstore-upload`.
6. **Submits for review** (POST `/publish`). Result: `ITEM_PENDING_REVIEW`.

Listing fields the pipeline DOES update (via the bundled `_locales/`):
- `appName` → store title
- `appDesc` → store summary (132-char "short description")

Listing fields the pipeline does **NOT** update (CWS API limitation — must
edit manually in the dev console):
- Long description
- Category / tags
- Screenshots
- Promotional tiles (small + marquee)
- Promo video URL
- Single-purpose statement & privacy practices form

For those, sign in at
`https://chrome.google.com/webstore/devconsole/<group-id>/<ext-id>/edit/listing`
and paste from `.specs/listing-v4-draft.md`.

## CI option (later)

GitHub Actions workflow stub:

```yaml
name: Publish to CWS
on:
  workflow_dispatch:
    inputs:
      bump:
        type: choice
        options: [patch, minor, major]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: yarn }
      - run: yarn install --frozen-lockfile
      - run: node scripts/publish.mjs --bump ${{ inputs.bump }} --dirty
        env:
          CWS_EXTENSION_ID: ${{ secrets.CWS_EXTENSION_ID }}
          CWS_CLIENT_ID:    ${{ secrets.CWS_CLIENT_ID }}
          CWS_CLIENT_SECRET:${{ secrets.CWS_CLIENT_SECRET }}
          CWS_REFRESH_TOKEN:${{ secrets.CWS_REFRESH_TOKEN }}
      - run: git push --follow-tags
```

`--dirty` is used because GH Actions checks out a fresh tree and the bump
edits will appear as uncommitted. The workflow should `git commit` the
version bump as a follow-up step.
