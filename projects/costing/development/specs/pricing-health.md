# Pricing health

Three calculators price work: glass at `/glass/quote`, windows at `/glass/windows`, awnings at
`/glass/awnings`. Each reproduces its source sheet exactly. Fidelity is not the same as being right,
and two things can make an exact calculator quote a wrong price: the numbers can be old, and they
can disagree with each other. This is how both are surfaced.

Nothing here blocks a quote. A price the shop cannot defend is still better sold than not sold; the
job is to make sure nobody is surprised by it later.

| Part | Location |
| --- | --- |
| As-at date reader and grading | `utils/rate-age.ts` |
| Age badge and review card | `components/RateAgeNotice.tsx` |
| Cross-list comparison | `utils/rate-drift.ts` |
| Drift report | `/settings/drift` (`app/settings/drift/page.tsx`) |
| Checks | `utils/rate-age.test.ts`, `utils/rate-drift.test.ts` |

## How old a price is

Every rates document records when each group of prices was last known good, as free text an
estimator typed: `Oct 2021`, `July 2007`, `Apr 2010 (etch), Mar 2015 (powder coat)`, `unknown`.

That text is kept rather than replaced by a date column, because it carries detail a single date
cannot. `parseAsAt` reads the **oldest** date out of it, which is the conservative answer, and grades
what it finds:

| Grade | Meaning |
| --- | --- |
| current | Under 12 months |
| ageing | 12 to 24 months |
| stale | Over 24 months |
| unknown | The text names no date |

`unknown` is treated as needing attention rather than as fresh. A price nobody dated could be any
age. A bare year reads as January of it, so an undated month cannot look newer than it is.

The grade appears in two places: beside each field in the rates editors, and as a card on the
costing pages. The costing pages matter more — the person quoting is the one who needs to know the
price is old, and they were the last to be told.

The glass calculator had no dates at all. It now has one per section, `unknown` until somebody fills
them in.

## Where the lists disagree

Several items appear in more than one list: the same pane of glass, the same hour of labour, the
same ceramic banding. Nothing reconciled them.

`compareRates` measures the gap on **effective** prices, not list prices, because the window costing
adds a 20 percent glass loading to some lines before they reach a cost line and the others carry
none. Comparing raw list prices would report a gap that is not there and miss one that is.

Equivalences are declared by hand in `EQUIVALENCES`. Matching on label was rejected: "6 mm Tint A/P"
and "Grey" may or may not be the same product, and a wrong match is worse than a missing one. Items
whose products are uncertain are deliberately left unmatched. An item held in only one list is
dropped, having nothing to drift against.

A gap under 2 percent is rounding, not drift.

### A gap is not automatically an error

The lists do not all mean the same thing by a price. The glass calculator's is a base that a
per-piece markup is applied to. The window costing's feeds a manufactured window that then carries
margin and uplift. The same pane can honestly be worth two numbers.

What is not defensible is that nobody can say which. The report states this on the page rather than
implying the cheapest list is correct.

### What the defaults show

Every glass item sits 13 to 17 percent apart, always the same direction, and the 8, 10 and 12 mm
gaps are identical to three decimal places. A band that tight across that many items is one event,
not ten: it reads as one list taking a price rise the other never got. The report detects this shape
and says so, because ten separate conversations about ten items would be the wrong response to it.

Labour is $85 an hour for windows and $75 for awnings, a 13 percent gap with no recorded reason.

## What this does not do

It does not decide which list is right, and it does not merge them. One supplier invoice would
settle the glass question and probably settle every row at once. That is
[a question for the client](../../discovery/pricing-currency-decisions.md), not a thing to guess.
