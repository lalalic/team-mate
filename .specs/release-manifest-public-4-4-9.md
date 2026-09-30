# MeetMate Public Release Manifest — 4.4.9

**Release target:** Chrome Web Store listing `immkojolaicdjhkbbhkldmndhfjbehmf`
**Observed at:** 2026-09-28 22:45 America/Toronto (`2026-09-29T02:45Z` ± five minutes)
**Release state:** `blocked_before_submission`
**Market package:** `.specs/market-package-v1.md`
**Task:** `public-release-4-4-9`

## Candidate evidence

- Candidate PR head: `autonomous/market-revenue-v2` @
  `c7bd3d688ef5e82c1ecfe1224b533e56ec41962d`.
- `extension/manifest.json` and `package.json` both declare `4.4.9`.
- `npm test` passed all 36 focused assertions.
- `npm run build` produced `team-mate.zip` with manifest version `4.4.9`.
- Package SHA-256:
  `ddf49579a74d1c00a8992af9c27560e33fda4fb1eecdeb49c171e472a1965d3e`.
- `npm run verify:release` passed the explicit unconfigured Stripe path and
  confirmed that no Stripe secret material is present in the bundle.

The package is not submitted. A prepared build is not release evidence.

## External observation

- Chrome Web Store public listing URL:
  `https://chromewebstore.google.com/detail/immkojolaicdjhkbbhkldmndhfjbehmf`.
- Observed public listing title: “MeetMate — Live Facts, Knowledge, Speaking
  Coach & Memory for Teams”.
- Embedded public manifest observed in the listing source: `4.2.0`.
- Therefore the public listing is not yet the reviewed `4.4.9` product.
- The approved Market Package explicitly records product screenshots and demo
  visual QA as pending. The current checkout contains no store feature
  screenshots, so it also lacks the package-required store media for a truthful
  listing update.

## Blockers

1. **Publisher identity is not available.** Opening the selected developer
   dashboard through Browser Harness landed on Google account confirmation /
   sign-in. The authorized automation did not attempt account selection,
   passwords, MFA, or policy acknowledgements.
2. **Production Stripe Payment Link is not available to the release build.**
   `STRIPE_PAYMENT_LINK` was unset in the release environment. The built package
   therefore uses the explicit safe unconfigured path, which the Market Package
   forbids publishing as the production paid boundary.
3. **Fresh 4.4.9 store media is not yet complete.** Create a new screenshot set and a new demo video from the current product, then complete Market/visual QA before listing submission. Old screenshots/video are not release evidence for 4.4.9.

## Next human inputs

- Authenticate the `b6ef2f52-fb3e-4af5-bbbf-ad73d2b79348` Chrome Web Store
  publisher identity and complete any owner/MFA acknowledgement.
- Supply the approved production `STRIPE_PAYMENT_LINK` as release-time
  configuration without exposing a Stripe secret.
- Return the newly produced and approved 4.4.9 screenshots and demo video from the Market Agent.

## Attempt-2 reconciliation evidence

- Revalidation was performed on the same candidate head,
  `c7bd3d688ef5e82c1ecfe1224b533e56ec41962d`, with `npm ci`, `npm test`,
  `npm run build`, `node scripts/verify-release-build.mjs`, and ZIP integrity
  checking. All passed; the rebuilt ZIP manifest reported exactly `4.4.9`.
  Rebuild SHA-256:
  `1a4e4c407773f1076de124d5b331569cd9f020c1dcf1b6769232120f79fbebb9`.
- The read-only `check-status` browser-platform action returned
  `status=unknown` with the explicit error `authenticated Chrome Web Store
  publisher session required`. No upload, listing update, or submission was
  attempted.
- A public Browser Harness observation resolved the selected listing ID and
  rendered version `4.2.0`, independently confirming that the public target is
  not the candidate.
- Public homepage/privacy/support are now intentionally represented by the canonical repository page: `https://github.com/lalalic/team-mate`. The previous `ai.qili2.com` / CDN destinations are no longer release requirements for 4.4.9.

No review state is claimed. No draft submission is claimed. Public availability
of exact version `4.4.9` remains **not verified**.

## Attempt v2 — current-head preflight (2026-09-30)

**Task:** `public-release-4-4-9-v2`
**Candidate head:** `autonomous/market-revenue-v2` @
`c65af6e26a58fbe747441e4a35ebffb9f63929ca`
**Release state:** `blocked_before_submission`

The current candidate was freshly validated. `npm test` passed 32 focused
assertions plus 4 configuration checks. After installing the lockfile
dependencies, `npm run build` produced `team-mate.zip`; `npm run verify:release`
passed with both Stripe links unconfigured and no Stripe secrets in the bundle.
The ZIP contains manifest version `4.4.9`; SHA-256 is
`55485d9b6fca23e337c6b8e926cde003bc3257b9fa0b410e3d9f2476e5d2281d`.

Fresh public-destination checks returned HTTP 200 for:

- `https://github.com/lalalic/team-mate`
- `https://github.com/lalalic/team-mate/blob/main/www/privacy.html`
- `https://github.com/lalalic/team-mate/blob/main/www/support.html`

The live public Chrome Web Store listing
`https://chromewebstore.google.com/detail/immkojolaicdjhkbbhkldmndhfjbehmf`
was freshly fetched and still displays the legacy title “MeetMate — Live Facts,
Knowledge, Speaking Coach & Memory for Teams” and version `4.2.0`, not the
candidate `4.4.9`.

The publisher dashboard was freshly opened for the configured publisher scope.
It redirected to Google account verification for `lalalic@gmail.com` with the
message “Verify it’s you”; no authenticated publisher session was available.
No upload, listing update, draft save, or review submission was attempted.

The release environment exposes neither
`STRIPE_ONE_TIME_PAYMENT_LINK` nor `STRIPE_WEEKLY_PAYMENT_LINK`; the release
workflow expects these as GitHub Actions secrets. The source confirms the
entitlement endpoint is fixed to `https://stripe.qili2.com` with product
`team-mate`, but checkout cannot be claimed live without configured production
Payment Links and a successful checkout verification.

**Current blockers:** publisher Google account verification/MFA, and absent
production Stripe Payment Link configuration. Exact public version `4.4.9`
remains **not verified**; no publication or revenue is claimed.
