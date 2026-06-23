# F10 Racing Scoring Rules

Scoring source of truth: [`../src/lib/scoring/formula.ts`](../src/lib/scoring/formula.ts). Tests live in [`../src/lib/scoring/formula.test.mjs`](../src/lib/scoring/formula.test.mjs).

## Pick Slots

Each pick set has three slots:
- P10 finisher
- race winner
- DNF driver

Only locked picks are scored. Scoring uses locked pick snapshots when available so post-lock field drift cannot affect results.

## Main Race Scoring

P10 points use an explicit distance table for classified drivers:

| Distance from P10 | Points |
|---:|---:|
| 0 | 25 |
| 1 | 18 |
| 2 | 15 |
| 3 | 12 |
| 4 | 10 |
| 5 | 8 |
| 6 | 6 |
| 7 | 4 |
| 8 | 2 |
| 9+ | 0 |

Winner bonus: +5 for the classified P1 driver.

DNF bonus: +3 for any non-classified result.

Maximum base score: 33.

## Sprint Scoring

Sprint P10 points for classified drivers use:

```text
max(0, 8 - abs(position - 10))
```

Winner bonus: +2 for the classified P1 driver.

DNF bonus: +1 for any non-classified result.

Maximum base score: 11.

## Classification

Only `CLASSIFIED` results earn P10 or winner points. Any non-classified result scores zero for P10/winner and counts for the DNF bonus.

## Early-Bird Bonus

If a pick set locked with `lockedSubmittedBeforeQualifying = true`, scoring adds an early-bird bonus equal to the base score. This makes the stored total score `baseScore * 2` for eligible pick sets.
