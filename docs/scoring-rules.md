# F10 Racing — Scoring Rules

## Design Goals

- Intuitive and explainable in one screen
- Deterministic and recalculable from locked picks + official results
- Rewards midfield knowledge (10th place) as the premium skill
- Bonus points for winner and DNF accuracy
- No hidden edge cases or manual overrides

---

## Scoring Formula

### Category 1: 10th Place Prediction (max 25 pts)

```
let predictedDriver = user's pick for 10th place
let actualPosition = official finishing position of predictedDriver

if predictedDriver DID NOT FINISH (DNF, DNS, DSQ):
    tenthPlaceScore = 0

else:
    distance = |actualPosition - 10|
    tenthPlaceScore = max(0, 25 - (distance * 3))
```

| Actual P of predicted driver | Score |
|------------------------------|-------|
| P10 (exact)                  | 25    |
| P9 or P11                    | 22    |
| P8 or P12                    | 19    |
| P7 or P13                    | 16    |
| P6 or P14                    | 13    |
| P5 or P15                    | 10    |
| P4 or P16                    | 7     |
| P3 or P17                    | 4     |
| P2 or P18                    | 1     |
| P1 or P19+                   | 0     |
| DNF / DNS / DSQ              | 0     |

### Category 2: Race Winner Prediction (max 5 pts)

```
if user's winner pick = official P1 driver:
    winnerBonus = 5
else:
    winnerBonus = 0
```

No partial credit for winner. Binary.

### Category 3: DNF Prediction (max 3 pts)

```
if user's DNF pick driver DID NOT FINISH the race:
    dnfBonus = 3
else:
    dnfBonus = 0
```

DNF is defined as: official result status is DNF, Accident, Retired, Mechanical, Collision, or any non-classified, non-DNS status that means the driver did not take the chequered flag in a classified position.

**Max per race: 33 points.**

---

## Status Classification Rules

| Provider Status           | Internal Status | Eligible for 10th score | Eligible as DNF pick result |
|--------------------------|-----------------|--------------------------|------------------------------|
| Classified finisher       | CLASSIFIED      | Yes                      | No                           |
| +1 lap, +2 lap, NC       | CLASSIFIED      | Yes (at stated position) | No                           |
| Retired / Mechanical      | DNF             | No                       | Yes                          |
| Accident / Collision      | DNF             | No                       | Yes                          |
| Did Not Start (DNS)       | DNS             | No                       | No                           |
| Disqualified (DSQ)        | DSQ             | No (excluded post-race)  | No (they started and ran)    |

**DSQ note**: A DSQ driver crossed the line but is excluded from official classification post-result. They do not count as a classified finish for 10th prediction, and do not count as a DNF. Score for predicting a DSQ'd driver as 10th = 0. Predicting a DSQ'd driver as your DNF pick = 0 (they technically finished the race before penalty).

**DNS note**: DNS drivers never participated. Excluded from both pick options in the UI at lineup lock. If somehow included (data error), they score 0 for the 10th category and 0 for the DNF category.

---

## Pick Validation Rules

- A driver may not be selected in more than one slot (e.g., you can't pick the same driver as both P10 and winner)
- DNS drivers are filtered out of pick options before the form opens
- Picks cannot reference a driver not entered for the race

---

## Score Storage

Each `ScoreBreakdown` record stores:
```
tenthPlaceScore   int   (0–25)
winnerBonus       int   (0 or 5)
dnfBonus          int   (0 or 3)
totalScore        int   (0–33)
computedAt        datetime
resultVersion     string   (hash or version of result snapshot used)
```

Scores are derived values. The source of truth is always: **locked picks + official normalized race results + this formula**.

Re-running `computeScoresForRace(raceId)` must yield the same output given the same inputs.

---

## Leaderboard Tie-Break Rules

When two users have equal total season points, break ties in this order:

1. Most exact 10th-place hits (tenthPlaceScore = 25)
2. Most race winner hits
3. Most DNF hits
4. Earliest average `lockedAt` timestamp across all pick sets (rewards decisiveness)
5. Stable user ID (UUID sort) as final fallback for determinism

---

---

## Sprint Race Scoring

Sprint races use the same three picks (10th, 1st, DNF) but reduced point values reflecting shorter race length.

### Sprint: 10th Place Prediction (max 10 pts)

```
distance = |actualPosition - 10|
tenthPlaceScore = max(0, 10 - distance)
```

| Actual P of predicted driver | Score |
|------------------------------|-------|
| P10 (exact)                  | 10    |
| P9 or P11                    | 9     |
| P8 or P12                    | 8     |
| P7 or P13                    | 7     |
| ...                          | ...   |
| P1 or P19                    | 1     |
| P0 or P20+                   | 0     |
| DNF / DNS / DSQ              | 0     |

### Sprint: Winner Prediction (max 2 pts)
- Exact match: +2
- No match: 0

### Sprint: DNF Prediction (max 1 pt)
- Correct DNF: +1
- Incorrect: 0

**Sprint max per race: 13 points.**

---

## Season Score Totals

Season standings sum all race scores (both main races and sprint races). Sprint races count toward season total at their lower point values — this keeps the season competitive even in sprint-heavy rounds.

---

## Future Considerations (Post-MVP)

- Qualifying prediction
- Streak bonuses (e.g., 3 exact 10th picks in a row = bonus)
- Position bracket scoring (predict within top 3 of P10)
