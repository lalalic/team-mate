# MeetMate Premium Publishing Plan

This PR is the implementation handoff for turning the current local Premium Preview into a lightweight production flow without running a MeetMate application server.

## Goals

1. Host the MeetMate public site and payment success page with GitHub Pages from this repository.
2. Use Stripe-hosted checkout/payment links instead of ExtensionPay.
3. Keep entitlement intentionally lightweight and client-side. Strong anti-tamper protection is not a requirement.
4. Publish the assets needed for the Chrome Web Store and public product page.
5. Make release/publish steps repeatable and preferably automated.

## Proposed architecture

```text
Chrome extension
  -> Upgrade to Premium
Stripe Payment Link / hosted checkout
  -> successful payment redirect
GitHub Pages premium-success page
  -> activation handshake with installed extension
chrome.storage.local premium entitlement
```

No MeetMate-owned backend is required.

## GitHub Pages

Add a static site under `docs/` and configure GitHub Pages for the repository.

Suggested pages:

- `docs/index.html` — product/landing page
- `docs/premium.html` — Premium value proposition and upgrade CTA
- `docs/premium-success.html` — post-payment activation page
- `docs/privacy.html` — privacy disclosure for Chrome Web Store and users
- `docs/support.html` — support/contact and troubleshooting

The site should explain clearly that meeting transcripts and uploaded knowledge remain local except for the context/snippets explicitly sent to the user's configured LLM provider.

## Stripe payment

Replace ExtensionPay with Stripe Payment Links.

Initial commercial model: one MeetMate Premium entitlement. The implementation should support a one-time/lifetime purchase first because it does not require ongoing server-side subscription reconciliation.

Requirements:

- Upgrade button opens the configured Stripe Payment Link.
- Stripe redirects successful purchases to the GitHub Pages success page.
- Success page can activate Premium in the installed extension.
- Activation token/handshake should avoid an obvious plain `premium=true` link, while accepting that a determined user can bypass the gate.
- Successful entitlement is stored locally and survives browser restarts.
- Keep a development Premium Preview mechanism for local testing, but make it visually distinct from a real purchase.
- Remove ExtensionPay dependency and related code after Stripe flow is working.

## Premium feature boundary

Free:

- live meeting transcript context
- Ask / grounded Q&A
- private Knowledge + `search_knowledge`
- shortcut library with at most 3 shortcuts shown at once

Premium:

- unlimited shown shortcuts
- answer provenance / sources
- structured end-of-meeting report
- future Premium features behind the same entitlement flag

Do not gate basic Q&A or knowledge search.

## Publish assets

Prepare production-ready assets required by Chrome Web Store and the public site, including:

- extension icons at required sizes
- store icon
- screenshots showing live Q&A, shortcuts, knowledge, provenance, and structured report
- promotional tile / marquee assets if currently required by the store
- concise store description and long description
- privacy disclosure
- support URL
- product/upgrade URLs

All asset source files should live in the repo so releases are reproducible.

## Release and publishing workflow

Create a release workflow that:

1. verifies package and manifest versions match
2. runs tests
3. performs a clean production build
4. recreates `team-mate.zip` from scratch
5. validates expected extension files are present
6. optionally creates a GitHub Release and attaches `team-mate.zip`
7. publishes/deploys GitHub Pages
8. optionally publishes to Chrome Web Store using repository secrets

Keep the canonical extension artifact name exactly:

`team-mate.zip`

Never generate versioned zip filenames for the canonical test/release package.

## Versioning

Every user-visible fix/build must bump the Chrome extension version so testers can confirm the loaded version in `chrome://extensions`.

Package and manifest versions should be kept in sync automatically where possible.

## Security / privacy constraints

- No Stripe secret key inside the extension.
- No provider API key is sent to MeetMate-controlled infrastructure.
- Do not put sensitive activation secrets directly into publicly readable GitHub Pages source when avoidable.
- Treat local entitlement as a soft gate, not a security boundary.
- Do not upload private knowledge to GitHub Pages or Stripe.

## Acceptance criteria

- [ ] GitHub Pages site is publicly reachable.
- [ ] Upgrade opens Stripe-hosted checkout.
- [ ] Successful payment activates Premium in the installed extension without a MeetMate server.
- [ ] Reloading Chrome preserves Premium state.
- [ ] Free users can show at most 3 shortcuts; Premium users can show unlimited shortcuts.
- [ ] Premium provenance works.
- [ ] Premium structured report works.
- [ ] ExtensionPay code/dependency is removed.
- [ ] Store/site assets are checked into the repo.
- [ ] `npm test` passes.
- [ ] clean production build succeeds.
- [ ] canonical artifact is `team-mate.zip`.
- [ ] GitHub Pages deploy is automated or documented.
- [ ] Chrome Web Store publish is automated or documented.
- [ ] README documents setup, payment configuration, release, and publish procedures.
