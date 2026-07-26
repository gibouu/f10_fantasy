# FX Racing — App Store release runbook

Everything here runs on a Mac with Xcode. Steps marked **owner only** need an
Apple ID with 2FA and cannot be delegated to an agent.

## 0. Prerequisites

- Xcode with a signed-in Apple ID on the `U6Z87CS4W3` team (automatic signing).
- A clean worktree at the exact commit you intend to ship.
- `xcodegen` (`brew install xcodegen`).

## 1. Set the version and build number

Both live in **`ios/project.yml` only** — never edit the generated pbxproj by
hand, and never let Xcode bump them (`manageAppVersionAndBuildNumber` is
`false` in `ios/ExportOptions.plist`).

```yaml
MARKETING_VERSION: "1.8.0"
CURRENT_PROJECT_VERSION: "45"
```

`CURRENT_PROJECT_VERSION` must be higher than any build already uploaded for
this marketing version — App Store Connect rejects a duplicate. Build 44 was
consumed by the 1.7.1 upload.

Then regenerate and prove the project agrees:

```bash
cd ios && xcodegen generate && cd ..
npm run test:ios-config
```

## 2. Verify before archiving

CI (`.github/workflows/verify.yml`) never runs `xcodebuild` — a green badge
says nothing about whether the iOS app compiles. Run the native build yourself.

```bash
npx tsc --noEmit && npm run lint && npm run build
npm run test:ios
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing \
  -configuration Release -destination 'generic/platform=iOS Simulator' build
```

## 3. Archive

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$HOME/Desktop/FXRacing-1.8.0-45.xcarchive" \
  -allowProvisioningUpdates archive
```

The `FXRacing` scheme's archive action is pinned to Release. Note that
`ios/project.yml` must contain a `schemes:` block — without one,
`xcodegen generate` deletes the shared scheme and this command stops working.

Sanity-check the archive before exporting:

```bash
ARCHIVE="$HOME/Desktop/FXRacing-1.8.0-45.xcarchive"
plutil -p "$ARCHIVE/Products/Applications/FXRacing.app/Info.plist" \
  | grep -E "CFBundleIdentifier|CFBundleShortVersionString|CFBundleVersion"
ls "$ARCHIVE/Products/Applications/FXRacing.app/PrivacyInfo.xcprivacy"
```

Expect `com.fxracing.app`, `1.8.0`, `45`, and a present privacy manifest. The
performance fixtures build only under the `Performance` configuration, so they
cannot appear in this binary.

## 4. Export a signed .ipa

```bash
xcodebuild -exportArchive \
  -archivePath "$HOME/Desktop/FXRacing-1.8.0-45.xcarchive" \
  -exportOptionsPlist ios/ExportOptions.plist \
  -exportPath "$HOME/Desktop/FXRacing-1.8.0-45" \
  -allowProvisioningUpdates
```

This writes `FXRacing.ipa` locally and does **not** contact App Store Connect.

## 5. Upload — owner only

Either flip `destination` to `upload` in `ios/ExportOptions.plist` and re-run
step 4, or upload `FXRacing.ipa` from Xcode Organizer or Transporter. Wait for
App Store Connect to finish processing before the build becomes selectable.

## 6. Screenshots

Generate them with the simulator and validate before uploading:

```bash
npm run validate:app-store-screenshots
```

Required files live in `.artifacts/app-store/` (gitignored): three canonical
shots at 6.9-inch `1320x2868`, which is the only size App Store Connect
requires — it scales that set down for smaller devices. Smaller sizes are
accepted if present but never required, so the whole set comes from one
simulator (**iPhone 17 Pro Max**, whose native resolution is exactly
1320x2868 — no scaling needed).

```
01-race-deck-1320x2868.png
02-driver-picker-1320x2868.png
03-rankings-1320x2868.png
```

PNGs must have no alpha channel. `xcrun simctl io <udid> screenshot` captures
at native resolution but keeps an alpha channel. `sips --setProperty hasAlpha
false` does **not** reliably remove it — convert instead:

```bash
python3 -c 'from PIL import Image; import sys
[Image.open(f).convert("RGB").save(f, "PNG", optimize=True) for f in sys.argv[1:]]' \
  .artifacts/app-store/*.png
```

## 7. Store metadata — owner only

Select the processed build, upload the screenshots in filename order, and
confirm support/privacy URLs, age rating, export compliance
(`ITSAppUsesNonExemptEncryption` is already declared `false`), content rights,
privacy answers, and review contact. The app is playable as a guest, so give
the reviewer guest-mode instructions rather than a test account.

Do not accept new Apple legal agreements on the owner's behalf.
