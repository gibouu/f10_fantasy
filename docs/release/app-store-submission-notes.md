# FX Racing 1.8.0 (45) — App Store Connect submission notes

Build: **1.8.0 (45)**, from `main` @ `2bc7e5f`.
Assumes the last public release was **1.7.0 (11)** — check the Versions list in
App Store Connect and adjust the release notes if something shipped after that.

---

## 1. What's New in This Version

> Copy-paste. 4000 character limit; this is ~800.

```
Faster picking, a cleaner season view, and a light mode that finally looks right.

• Redesigned race cards — swipe between races and set P1, P10 and your DNF pick without leaving the card
• Picks now save as you make them and sync to your account on their own. Editing from a second device no longer clobbers what you saved on the first
• New season ledger under Me — the whole season on one screen with your result and points per race. Tap a race to see the drivers you picked
• Driver season form sits right on the race card, with a full race-by-race history for any driver
• Tap anyone in Rankings to open their profile and see their picks
• Light mode rework — cards, status colours and the driver picker are all properly readable
• Browse races, results and the global leaderboard without an account

Plus a stack of fixes to saving, offline picks and the pick lock.
```

---

## 2. App Review Information → Notes

> This is the field that prevents avoidable rejections. Copy-paste.

```
FX Racing is a free Formula 1 prediction game. There is no real-money
wagering, no in-app purchase, no virtual currency, and no prizes of any
kind. Players predict three outcomes per race and are scored on accuracy.

NO ACCOUNT IS NEEDED TO REVIEW THE APP.
Launch it and everything is immediately usable as a guest: browse the race
calendar, open any race, make all three picks, view results, and view the
global leaderboard. Please review in guest mode — no demo credentials are
required.

If you want to test the account features, sign in with Apple from the
profile icon (top right). An account adds only: appearing on the leaderboard
under a chosen username, syncing picks across devices, and viewing other
players' profiles.

Account deletion: profile icon (top right) > gear icon > Delete Account.
It is a two-step confirmation and permanently removes the account and all
associated data.

How to make a pick: open the app on the Upcoming tab, tap any of the three
rows on the race card (P1, P10, DNF), choose a driver in the sheet. The
picker advances through all three slots. Picks save automatically. Picks
lock at the start of qualifying, after which the rows become read-only.

The app requires a network connection for race data. Race schedule and
results come from our own backend.
```

**Sign-in required:** **No.** Do not attach a demo account — guest mode covers the whole app, and a stale test account is a rejection risk.

**Contact:** your name, phone, and an email you actually monitor. Review questions arrive by email and the clock keeps running.

---

## 3. Export compliance

`ITSAppUsesNonExemptEncryption` is already declared **false** in the Info.plist, so App Store Connect should not ask. If it does: **No**, the app uses only standard HTTPS.

---

## 4. App Privacy

These must match `ios/FXRacing/PrivacyInfo.xcprivacy` or the submission gets flagged. The manifest declares:

| Data type | Linked to user | Used for tracking | Purpose |
|---|---|---|---|
| Email address | Yes | No | App Functionality |
| Name | Yes | No | App Functionality |
| User ID | Yes | No | App Functionality |
| Gameplay Content | Yes | No | App Functionality |

- **Do you or your third-party partners collect data from this app?** → **Yes**
- **Do you use data for tracking?** → **No** (`NSPrivacyTracking` is `false`, no tracking domains)
- Nothing is collected for advertising, analytics, or product personalisation. Everything above is App Functionality only.
- Email and name arrive via Sign in with Apple. Gameplay Content = the picks and favourite-team choice.

Guest mode collects none of it — picks stay on device until you sign in.

---

## 5. Age rating

Answer the questionnaire honestly; the one that matters is **Contests / Gambling**:

- **Simulated Gambling:** **None.** No wagering, no odds, no currency, no prizes.
- **Contests:** this is a free prediction game with no entry fee and no prize. If the questionnaire offers a "Contests — Infrequent/Mild" option, it does not apply; there is no prize pool.

Expected outcome: **4+**.

Getting this wrong in the "generous" direction is not safer — an inflated rating is its own problem, and a wrong gambling answer is a removal risk later.

---

## 6. Content rights — read this one

The app ships driver headshots and team logos from `public/drivers` and `public/teamlogos`, and uses Formula 1 driver names, team names, and Grand Prix names throughout.

App Store Connect will ask: **"Does your app contain, show, or access third-party content?"**

I can't answer that for you — it depends on where those images came from and what licence you have. Two things worth knowing before you tick a box:

- "Formula 1", "F1", and "Grand Prix" are trademarks of Formula One Licensing BV. Team names and liveries belong to the teams.
- Fan apps using official media without a licence do get pulled, usually on a rights-holder complaint rather than at review.

If you have rights or a licence, say yes and be ready to document it. If the images are scraped from official sources, that's a real exposure and worth resolving separately from this release. Not a blocker for submitting — a thing to be deliberate about.

---

## 7. Before you hit Submit

- [ ] Build 45 finished processing (can take 15–60 min after upload; you'll get an email)
- [ ] Screenshots uploaded in filename order — 6.9" set is already generated and validated
- [ ] Support URL and Privacy Policy URL both resolve (Apple checks these)
- [ ] Version number in App Store Connect reads 1.8.0
- [ ] Release option chosen — manual release is safer for a first submission after a long gap
- [ ] No new Apple legal agreements pending (blocks submission silently)

---

## If it gets rejected

Send me the rejection text and the guideline number. Most rejections at this
stage are metadata, not code — reviewer couldn't find something, or a privacy
answer didn't match the manifest.
