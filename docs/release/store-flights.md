# Store flights

This document defines how Illusions treats beta/flight delivery across direct
sales and store platforms.

## Distribution model

The app distinguishes two independent concepts:

- `distributionProvider`: `direct`, `microsoft-store`, `app-store`, or `unknown`
- `releaseChannel`: `stable`, `beta`, `dev`, `alpha`, or `unknown`

The in-app beta update toggle is only valid for `distributionProvider=direct`.
Direct builds use GitHub Releases and `electron-updater`, so the app can opt in
or out of prerelease updates.

Store builds do not use the in-app beta toggle. Their eligibility is controlled
by the platform account and tester group:

- Microsoft Store: Package flights + known user groups in Partner Center
- Apple: TestFlight tester groups / App Store phased or normal release controls

## Microsoft Store

Stable Microsoft Store submission remains handled by:

- `.github/workflows/store-submit.yml`
- `.github/workflows/sync-ms-store-listing.yml`
- `scripts/submit-store.mjs`

These workflows submit a normal application submission. They must not be reused
for beta packages, because that would publish a beta `.appx` to the regular
Store audience instead of a limited flight group.

For Microsoft Store beta delivery, create or update a Package flight in Partner
Center and upload the beta `.appx` artifacts from the GitHub prerelease for the
`beta` branch. Package flight listing text is shared with the non-flighted Store
submission; only packages differ.

MSIX package identity versions are four-part numeric versions and cannot contain
SemVer prerelease labels such as `-beta`. GitHub release asset filenames include
the full Illusions prerelease version for operator clarity, but Partner Center
will still show the numeric MSIX package version from the package manifest.
The fourth MSIX version part is reserved as a channel marker:

- `0`: stable
- `1`: beta
- `2`: alpha
- `3`: dev

Lower revision numbers are closer to the stable release channel.
The workflow keeps `package.json.version` at the stable three-part base version
for SemVer compatibility and writes the four-part MSIX version to
`build.buildVersion` plus the channel marker to `build.buildNumber` before
invoking the AppX target. Electron Builder uses `buildNumber` as the fourth
AppX manifest version part only when `appx.setBuildNumber=true`.

Automation note: do not add a package-flight upload workflow until we have a
verified Partner Center API endpoint or supported CLI path for package flight
submissions. The existing submission API script only targets normal app
submissions.

## Apple

Apple flight delivery will use TestFlight after the Mac App Store build pipeline
exists. The MAS work is tracked separately in `docs/release/mac-app-store.md`.

Until that pipeline is implemented, the shared runtime model already supports
`distributionProvider=app-store`, but there is no App Store Connect upload job
to wire to it.

## UI policy

About settings should follow this behavior:

- `direct`: show the beta update opt-in toggle.
- `microsoft-store` / `app-store`: show platform-managed update copy.
- `releaseChannel=beta` on a store provider: label the build as a flight/beta
  build, but still do not show an opt-in toggle.
