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
