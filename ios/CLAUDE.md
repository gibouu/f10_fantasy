# FX Racing iOS — Engineering Memory

## Stack
- Swift 6, SwiftUI, iOS 17+, `@Observable`, Xcode 16
- `xcodegen generate` rebuilds the `.xcodeproj` from `project.yml` after every new file
- Backend: Next.js 14 App Router at `Config.apiBaseURL` (localhost:3000 in DEBUG, prod URL in Release)
- Auth: Sign In with Apple → `POST /api/auth/mobile/exchange` → Bearer JWT stored in Keychain
- No test framework

## Folder map (relevant files)

```
ios/FXRacing/
├── FXRacingApp.swift           @main — injects AuthManager, LocalPickStore, GuestStore
├── RootView.swift              Auth state machine → MainTabView (always) or UsernamePickerView
│
├── Core/
│   ├── Config.swift            apiBaseURL (DEBUG=localhost, Release=prod)
│   ├── Auth/
│   │   ├── AuthManager.swift   @Observable state machine; signInWithApple → migrateGuestPicks
│   │   ├── KeychainService.swift
│   │   └── AppleSignInHandler.swift
│   ├── Networking/
│   │   ├── APIClient.swift     URLSession wrapper, Bearer auth, JSONDecoder.api
│   │   ├── APIEndpoint.swift   All endpoint static factories
│   │   └── APIError.swift
│   ├── Models/
│   │   ├── Race.swift          lockCutoffUtc: Date; isLocked = Date() >= lockCutoffUtc
│   │   ├── Pick.swift          LocalPick for guest, Pick for server
│   │   ├── Driver.swift
│   │   ├── User.swift
│   │   ├── LeaderboardRow.swift
│   │   ├── FriendRequest.swift
│   │   └── FriendProfile.swift
│   ├── Storage/
│   │   ├── LocalPickStore.swift  @Observable; UserDefaults-backed [raceId: LocalPick]
│   │   └── GuestStore.swift      @Observable; UserDefaults: localUsername, localTeamSlug
│   └── Sync/
│       └── SyncManager.swift     Migrates guest picks → server after sign-in
│
├── DesignSystem/
│   ├── FXTheme.swift           Colors, Radius, Spacing; fxCardSurface() (Liquid Glass iOS 26+)
│   ├── Extensions.swift        Color(hex:)
│   ├── StatusBadge.swift
│   ├── DriverBubbleView.swift  + SlotDriverBubble for SlotDriver contexts
│   ├── Haptics.swift           select/pick/success/error/locked/scoreReveal
│   ├── SkeletonView.swift      shimmer loaders
│   └── ErrorBanner.swift       RetryView + ErrorBanner
│
└── Features/
    ├── Auth/
    │   ├── SignInView.swift         Full-screen sign-in (cold launch / onboarding only)
    │   ├── SignInViewModel.swift
    │   └── SignInPromptView.swift   Compact sheet with reason string (contextual auth gate)
    ├── Onboarding/
    │   ├── UsernamePickerView.swift   isChange: Bool → POST or PATCH
    │   └── UsernamePickerViewModel.swift
    ├── Races/
    │   ├── RacesListView.swift       List + skeleton + RetryView
    │   ├── RacesListViewModel.swift
    │   ├── RaceCardView.swift
    │   ├── RaceDetailView.swift      Guest + auth pick UI; local-first save
    │   ├── RaceDetailViewModel.swift Local-first: saves LocalPick if guest; uploads if auth
    │   └── DriverPickerSheet.swift
    ├── Rankings/
    │   ├── LeaderboardView.swift     Global visible to guests; Friends requires auth
    │   ├── LeaderboardViewModel.swift
    │   ├── LeaderboardRowView.swift
    │   ├── FriendsViewModel.swift
    │   └── FriendSearchView.swift    Browse OK; Add requires auth → SignInPromptView
    └── Profile/
        ├── ProfileView.swift         Switches between GuestProfileView / ownProfileList
        ├── GuestProfileView.swift    Local username + avatar picker; "Sign in to track picks"
        ├── FriendProfileView.swift
        ├── FriendProfileViewModel.swift
        └── SettingsView.swift        Sign out, username change
```

## Auth state machine

```
App launch → AuthManager.restoreSession()
  Keychain token → GET /api/users/me
    200 → .authenticated(User)
    401 → clear token → .unauthenticated
  No token → .unauthenticated

.unknown          → blank screen (splash)
.unauthenticated  → MainTabView (guest mode — all tabs accessible)
.authenticated, usernameSet=false → UsernamePickerView (full-screen)
.authenticated, usernameSet=true  → MainTabView

Sign-in trigger:
  → contextual: tapping "Add Friend", "Sign in to sync picks" etc.
  → presents SignInPromptView as a sheet with reason string
  → on success: SyncManager.migrateGuestPicks runs, then normal app
```

## Guest mode

**What works without sign-in:**
- Browse race list and race detail
- Make picks → stored locally in `LocalPickStore` (UserDefaults)
- View global leaderboard
- Browse friend search results
- Set local username and local avatar/team logo (stored in `GuestStore`)

**What requires sign-in:**
- Submitting picks to server (picks remain local-only until sign-in)
- Adding friends
- Viewing Friends leaderboard tab
- Profile sync / score tracking

## Local persistence

### LocalPickStore (`UserDefaults` key: `"localPicks"`)
```swift
struct LocalPick: Codable {
  raceId, winnerId, p10Id, dnfId: String
  savedAt: Date
  synced: Bool   // true once successfully POSTed to server
}
// Stored as [raceId: LocalPick] JSON
```
- Survives app backgrounding and device restart
- Does NOT survive reinstall (acceptable)
- Does NOT require auth

### GuestStore (`UserDefaults`)
- `"guest_username"` → String? (draft username, never sent to server)
- `"guest_team_slug"` → String? (local avatar, persisted permanently even after sign-in)
- Username cleared after successful server sign-in (offered as prefill for UsernamePickerView)
- Team slug kept permanently (user preference, used as local avatar cache)

## Pick lock rule

- `race.lockCutoffUtc` comes from the server (= scheduledStartUtc − 2 min, set during sync-schedule cron)
- `Race.isLocked` on iOS = `Date() >= lockCutoffUtc`
- Lock enforced at THREE points:
  1. **UI**: pick bubbles disabled, save button hidden when `race.isLocked`
  2. **LocalPickStore**: refuses to save a pick when race is locked
  3. **Server**: returns 423 on POST /api/picks if locked (catches clock drift)
- Clock drift: client-side lock is informational; server is authoritative. A user with a behind clock gets 423 on upload, sees "This race is now locked."
- Migration skips picks for locked races

## Migration flow (guest → authenticated)

1. User completes Sign In with Apple
2. `AuthManager.signInWithApple(idToken:)` exchanges token with backend
3. `SyncManager.migrateGuestPicks(token:, localPickStore:)` runs:
   - Gets all `localPickStore.unsyncedPicks()`
   - For each: checks `race.isLocked` from cached races list
   - If locked → mark synced (skip, too late)
   - GET /api/picks?raceId= → if 200, server pick exists → skip (mark synced, server wins)
   - If 404 → POST local pick to server
   - On 423 → mark synced (server also says locked)
   - Any other error → leave unsynced (retry on next launch)
4. After migration, `LocalPickStore` retains all picks (synced/unsynced) for display continuity

## Cross-platform (iOS ↔ web) interoperability

- **Same backend identity**: iOS and web use the same User table, friend system, PickSet table
- **Same friend graph**: friend requests created on iOS are visible on web and vice versa
- **Same picks model**: server PickSet has unique constraint on [userId, raceId]
- **Username**: set once (POST), changed once (PATCH) — same limits on both platforms
- **Lock times**: both platforms use `race.lockCutoffUtc` from the same DB record
- **Guest → account**: guest picks uploaded as server PickSets; user becomes compatible with web immediately after sign-in
- **iOS-only**: local avatar slug (GuestStore) — not sent to server as a file, only as a slug string via PATCH /api/users/team after sign-in. Slug stored locally is the same slug as on web.

## Known edge cases / unresolved

- **Offline picks**: LocalPick saved while offline will upload on next launch after auth. If race locks before the device comes online, the pick is lost silently (user not notified).
- **Reinstall**: LocalPickStore and GuestStore use UserDefaults → cleared on reinstall. Guest picks are lost. Acceptable, but could be mitigated with Keychain storage if needed.
- **Multiple guest picks for same race**: LocalPickStore keeps one pick per raceId (last write wins).
- **Server pick conflict during migration**: Server wins. If user made picks on web and then also on iOS as guest, web picks are preserved.
- **App reinstall after sign-in**: Keychain persists through reinstall. Auth token survives. `LocalPickStore` is cleared but server picks are fetched normally.

## Commands

```bash
# In ios/ directory:
xcodegen generate          # regenerate .xcodeproj after adding files
xcodebuild -project FXRacing.xcodeproj -scheme FXRacing \
  -destination 'generic/platform=iOS Simulator' build   # verify compile
```
