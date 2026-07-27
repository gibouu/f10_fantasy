# F10 iOS Redesign — Review Notes

Date: 2026-07-12
Status: Visual direction selected; design specification still in progress.
Thread: `019f552b-9525-7b70-87a2-977c18f8bf29`

## Confirmed Scope

- Preserve the existing gameplay and scoring rules.
- Each race requires three picks: race winner, P10 finisher, and first DNF.
- Picks submitted before qualifying remain eligible for the existing 2× bonus.
- Users continue to receive scores and compare their ranking.
- The redesign should make race browsing, driver selection, and screen loading substantially faster and calmer.
- Replace the long upcoming/past race list with horizontal swipe navigation.
- Race details should preserve context rather than feel like a slow, unrelated page.

## Selected Direction

The user selected **A — Focused pager / Snap deck**.

This direction presents one dominant race card at a time, shows part of the next card to teach horizontal swiping, and keeps the race-selection experience intentionally simple.

## Pinned Review Notes

1. Target: `a-weekend-schedule` at `(0.2820, 0.5601)`
   - “instead of the timeline just have that somewhere else and have the picks be the main part of the app”

2. Target: `layout-a` at `(0.3641, 0.8835)`
   - “add qualifying results underneath or past race history if qualifying hasn't happened”

3. Target: `layout-a` at `(0.7894, 0.9843)`
   - “no need for tabs at the bottom”

4. Target: `a-filter` at `(0.6193, 0.1596)`
   - “add a third tab for the rankings page”

## Resulting Interpretation

- The main race card should prioritize the three fantasy picks, not the weekend timeline.
- Qualifying results should appear beneath the pick area once available.
- Before qualifying data exists, that supporting space should show useful past-race context instead.
- Remove the persistent bottom tab bar from this concept.
- Use a compact three-way top-level control for Upcoming, Past, and Rankings.
- The next visual iteration should focus on the pick-selection interaction and the swipe-down race detail presentation.

## Latest Correction — 2026-07-13

- Keep the active race card geometrically centered with equal left and right gutters at every supported width.
- Preserve horizontal swiping with only a restrained next-card edge; the swipe cue must never shift the active card off the screen center line.
- Apply the same centered geometry to both Upcoming and Past race decks.
- Browser annotations must sync automatically into the companion session event log. Local browser storage remains useful for persistence, and JSON export remains a fallback, but neither should be the only way the agent can retrieve feedback.

## Source Artifacts

- Selected browser event: `.superpowers/brainstorm/96321-1783858184/state/events`
- Complete annotation export: `/Users/gibou/Downloads/f10-race-navigation-notes-2.json`
- Empty earlier export retained at: `/Users/gibou/Downloads/f10-race-navigation-notes.json`
- Centered Liquid Glass iteration: `.superpowers/brainstorm/70526-1783929684/content/liquid-glass-v4-centered.html`

## Next Step

Review the centered Liquid Glass iteration, then present the performance architecture and native iOS compatibility approach for approval before writing the full design specification.
